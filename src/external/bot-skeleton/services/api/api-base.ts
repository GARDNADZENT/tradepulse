// @ts-nocheck — vendored bot code with known upstream type gaps; see AGENTS.md
/* [AI] - Analytics removed - utility functions moved to @/utils/account-helpers */
import { getAccountId, getAccountType, isDemoAccount, removeUrlParameter } from '@/utils/account-helpers';
/* [/AI] */
import CommonStore from '@/stores/common-store';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { TAuthData } from '@/types/api-types';
import { clearAuthData } from '@/utils/auth-utils';
import { handleBackendError, isBackendError } from '@/utils/error-handler';
import { activeSymbolsProcessorService } from '../../../../services/active-symbols-processor.service';
import { observer as globalObserver } from '../../utils/observer';
import { doUntilDone, socket_state } from '../tradeEngine/utils/helpers';
import {
    CONNECTION_STATUS,
    setAccountList,
    setAuthData,
    setConnectionStatus,
    setIsAuthorized,
    setIsAuthorizing,
} from './observables/connection-status-stream';
import ApiHelpers from './api-helpers';
import {
    generateDerivApiInstance,
    hasStoredAuthCredentials,
    isCurrentSocketPublic,
    V2GetActiveAccountId,
} from './appId';
import chart_api from './chart-api';

type CurrentSubscription = {
    id: string;
    unsubscribe: () => void;
};

type SubscriptionPromise = Promise<{
    subscription: CurrentSubscription;
}>;

type TApiBaseApi = {
    connection: {
        readyState: keyof typeof socket_state;
        addEventListener: (event: string, callback: () => void) => void;
        removeEventListener: (event: string, callback: () => void) => void;
    };
    send: (data: unknown) => void;
    disconnect: () => void;
    authorize: (token: string) => Promise<{ authorize: TAuthData; error: unknown }>;

    onMessage: () => {
        subscribe: (callback: (message: unknown) => void) => {
            unsubscribe: () => void;
        };
    };
} & ReturnType<typeof generateDerivApiInstance>;

class APIBase {
    api: TApiBaseApi | null = null;
    token: string = '';
    account_id: string = '';
    pip_sizes = {};
    account_info = {};
    is_running = false;
    subscriptions: CurrentSubscription[] = [];
    time_interval: ReturnType<typeof setInterval> | null = null;
    has_active_symbols = false;
    is_stopping = false;
    is_initializing = false;
    active_symbols: any[] = [];
    current_auth_subscriptions: SubscriptionPromise[] = [];
    is_authorized = false;
    active_symbols_promise: Promise<any[] | undefined> | null = null;
    common_store: CommonStore | undefined;
    reconnection_attempts: number = 0;

    // Constants for timeouts - extracted magic numbers for better maintainability
    private readonly ACTIVE_SYMBOLS_TIMEOUT_MS = 30000; // 30 seconds (increased for API reliability)
    private readonly ENRICHMENT_TIMEOUT_MS = 15000; // 15 seconds (non-blocking enrichment)
    private readonly MAX_RECONNECTION_ATTEMPTS = 5; // Maximum number of reconnection attempts before session reset

    unsubscribeAllSubscriptions = () => {
        this.current_auth_subscriptions?.forEach(subscription_promise => {
            subscription_promise.then(({ subscription }) => {
                if (subscription?.id) {
                    this.api?.send({
                        forget: subscription.id,
                    });
                }
            });
        });
        this.current_auth_subscriptions = [];
    };

    private readonly handleSocketOpen = (event?: Event) => {
        if (event?.target && this.api?.connection && event.target !== (this.api.connection as unknown)) {
            return;
        }
        this.onsocketopen();
    };

    private readonly handleSocketClose = (event?: Event) => {
        if (this.is_stopping || this.is_initializing) return;
        if (event?.target && this.api?.connection && event.target !== (this.api.connection as unknown)) {
            return;
        }
        this.onsocketclose();
    };

    onsocketopen() {
        setConnectionStatus(CONNECTION_STATUS.OPENED);

        // Reset reconnection attempts on successful connection
        this.reconnection_attempts = 0;

        const currentClientStore = globalObserver.getState('client.store');
        if (currentClientStore) {
            currentClientStore.setIsAccountRegenerating(false);
        }

        this.handleTokenExchangeIfNeeded();
    }

    private async handleTokenExchangeIfNeeded() {
        const urlParams = new URLSearchParams(window.location.search);
        const account_id = urlParams.get('account_id');
        const accountType = urlParams.get('account_type');

        if (account_id) {
            localStorage.setItem('active_loginid', account_id);
            // Remove account_id from URL after storing
            removeUrlParameter('account_id');
        }
        if (accountType) {
            localStorage.setItem('account_type', accountType);
            // Remove account_type from URL after storing
            removeUrlParameter('account_type');
        }

        // Check if we have an account_id from URL or localStorage
        let activeAccountId: string | null = getAccountId();

        // If no account_id in localStorage, check stored accounts (sessionStorage / localStorage)
        if (!activeAccountId) {
            try {
                const accounts = DerivWSAccountsService.getStoredAccounts();
                if (accounts && accounts.length > 0 && accounts[0].account_id) {
                    const accountId = accounts[0].account_id as string;
                    activeAccountId = accountId;
                    localStorage.setItem('active_loginid', accountId);
                    localStorage.setItem('account_type', isDemoAccount(accountId) ? 'demo' : 'real');
                }
            } catch (error) {
                console.error('[APIBase] Error reading stored accounts:', error);
            }
        }

        // If an unauthenticated public socket opened while auth credentials now exist,
        // immediately upgrade to an authenticated OTP/V3 WebSocket instead of calling balance() on /ws/public.
        if (activeAccountId && isCurrentSocketPublic() && hasStoredAuthCredentials()) {
            await this.init(true);
            return;
        }

        // Now proceed with normal authorization if we have an account_id
        if (activeAccountId) {
            setIsAuthorizing(true);
            await this.authorizeAndSubscribe();
        } else {
            setIsAuthorizing(false);
        }
    }

    onsocketclose() {
        if (this.is_stopping || this.is_initializing) return;
        setConnectionStatus(CONNECTION_STATUS.CLOSED);
        this.reconnectIfNotConnected();
    }

    async init(force_create_connection = false) {
        if (this.is_initializing && !force_create_connection) return;
        this.is_initializing = true;
        this.is_stopping = false;

        try {
            this.toggleRunButton(true);

            if (this.api) {
                this.unsubscribeAllSubscriptions();
            }

            // Reset reconnection attempts counter on successful connection initialization
            if (!force_create_connection) {
                this.reconnection_attempts = 0;
            }

            if (!this.api || this.api?.connection.readyState !== 1 || force_create_connection) {
                if (this.api?.connection) {
                    ApiHelpers.disposeInstance();
                    setConnectionStatus(CONNECTION_STATUS.CLOSED);
                    this.api.connection.removeEventListener('open', this.handleSocketOpen);
                    this.api.connection.removeEventListener('close', this.handleSocketClose);
                    this.api.disconnect();
                }

                this.api = await generateDerivApiInstance(force_create_connection);

                this.api?.connection.removeEventListener('open', this.handleSocketOpen);
                this.api?.connection.removeEventListener('close', this.handleSocketClose);
                this.api?.connection.addEventListener('open', this.handleSocketOpen);
                this.api?.connection.addEventListener('close', this.handleSocketClose);

                // Store the current account ID used for this WebSocket connection
                const currentClientStore = globalObserver.getState('client.store');
                if (currentClientStore) {
                    const active_login_id = getAccountId();
                    if (active_login_id) {
                        currentClientStore.setWebSocketLoginId(active_login_id);
                    }
                }

                // If socket already reached OPEN before listener attached, run open flow immediately
                if (this.api?.connection.readyState === 1) {
                    this.onsocketopen();
                }
            }

            const hasAccountID = V2GetActiveAccountId();

            if (!this.has_active_symbols && !hasAccountID) {
                this.active_symbols_promise = this.getActiveSymbols().then(() => undefined);
            }

            this.initEventListeners();

            if (this.time_interval) clearInterval(this.time_interval);
            this.time_interval = null;

            await chart_api.init(force_create_connection);
        } finally {
            this.is_initializing = false;
        }
    }

    getConnectionStatus() {
        if (this.api?.connection) {
            const ready_state = this.api.connection.readyState;
            return socket_state[ready_state as keyof typeof socket_state] || 'Unknown';
        }
        return 'Socket not initialized';
    }

    terminate() {
        this.is_stopping = true;
        if (this.api) {
            this.api.connection?.removeEventListener('open', this.handleSocketOpen);
            this.api.connection?.removeEventListener('close', this.handleSocketClose);
            this.api.disconnect();
        }
    }

    initEventListeners() {
        if (window) {
            window.addEventListener('online', this.reconnectIfNotConnected);
            window.addEventListener('focus', this.reconnectIfNotConnected);
        }
    }

    async createNewInstance(account_id: string) {
        if (this.account_id !== account_id) {
            await this.init(true);
        }
    }

    reconnectIfNotConnected = () => {
        if (this.is_initializing || this.is_stopping) return;
        if (this.api?.connection?.readyState && this.api?.connection?.readyState > 1) {
            this.reconnection_attempts += 1;

            if (this.reconnection_attempts >= this.MAX_RECONNECTION_ATTEMPTS) {
                // Reset reconnection counter
                this.reconnection_attempts = 0;

                // Properly handle logout through the API
                setIsAuthorized(false);
                setAccountList([]);
                setAuthData(null);

                // Clear necessary storage items
                localStorage.removeItem('active_loginid');
                localStorage.removeItem('account_type');
                localStorage.removeItem('accountsList');
                localStorage.removeItem('clientAccounts');
            }

            this.init(true);
        }
    };

    async authorizeAndSubscribe() {
        if (!this.api) return;

        this.account_id = getAccountId() || '';
        setIsAuthorizing(true);

        try {
            let v3AuthorizedAccounts: any[] | null = null;
            let v3AuthorizedLoginId = '';
            if (typeof window !== 'undefined' && localStorage.getItem('deriv_pat_mode') === 'v3') {
                const v3Token =
                    localStorage.getItem('deriv_api_token') || localStorage.getItem('authToken') || '';
                if (v3Token && typeof this.api.authorize === 'function') {
                    let authRes: any;
                    try {
                        authRes = await this.api.authorize(v3Token);
                    } catch (v3Err: any) {
                        authRes = v3Err;
                    }
                    if (authRes?.error) {
                        const errorMessage = isBackendError(authRes.error)
                            ? handleBackendError(authRes.error)
                            : authRes.error.message || 'Authorization failed';
                        console.error('V3 Authorization error:', errorMessage);
                        setIsAuthorizing(false);
                        return { ...authRes.error, localizedMessage: errorMessage };
                    }
                    if (authRes?.authorize?.loginid) {
                        v3AuthorizedLoginId = String(authRes.authorize.loginid);
                    }
                    if (Array.isArray(authRes?.authorize?.account_list)) {
                        v3AuthorizedAccounts = authRes.authorize.account_list;
                    }
                }
            }

            let balance: any;
            let error: any;
            try {
                const balanceRes: any = await this.api.balance();
                balance = balanceRes?.balance;
                error = balanceRes?.error;
            } catch (balanceErr: any) {
                error = balanceErr?.error || balanceErr;
            }

            if (error) {
                // If balance() failed with AuthorizationRequired because a public socket answered
                // while stored auth credentials exist, upgrade to an authenticated socket immediately.
                if (error?.code === 'AuthorizationRequired' && isCurrentSocketPublic() && hasStoredAuthCredentials()) {
                    setIsAuthorizing(false);
                    await this.init(true);
                    return;
                }

                const errorMessage = isBackendError(error)
                    ? handleBackendError(error)
                    : error.message || 'Authorization failed';

                console.error('Authorization error:', errorMessage);

                setIsAuthorizing(false);
                return { ...error, localizedMessage: errorMessage };
            }

            const storedAccounts = DerivWSAccountsService.getStoredAccounts();
            const resolvedLoginId = String(
                balance?.loginid ||
                    balance?.account_id ||
                    v3AuthorizedLoginId ||
                    this.account_id ||
                    getAccountId() ||
                    storedAccounts?.[0]?.account_id ||
                    ''
            );
            const matchingStored = storedAccounts?.find(a => a.account_id === resolvedLoginId);
            const resolvedBalance =
                typeof balance?.balance === 'number'
                    ? balance.balance
                    : matchingStored
                      ? parseFloat(matchingStored.balance) || 0
                      : 0;
            const resolvedCurrency = String(balance?.currency || matchingStored?.currency || 'USD');

            this.account_info = {
                balance: resolvedBalance,
                currency: resolvedCurrency,
                loginid: resolvedLoginId,
            };
            this.token = resolvedLoginId;

            const account_type = getAccountType(resolvedLoginId);
            const currentAccount = resolvedLoginId
                ? {
                      balance: resolvedBalance,
                      currency: resolvedCurrency,
                      is_virtual: account_type === 'real' ? 0 : 1,
                      loginid: resolvedLoginId,
                  }
                : null;

            // Build full account list from stored accounts (populated during OAuth / V2 PAT flow)
            // Falls back to V3 authorize account_list or current account
            const accountList =
                storedAccounts && storedAccounts.length > 0
                    ? storedAccounts
                          .filter(a => !a.status || a.status === 'active')
                          .map(a => ({
                              balance:
                                  a.account_id === resolvedLoginId
                                      ? resolvedBalance
                                      : parseFloat(a.balance) || 0,
                              currency: a.currency || resolvedCurrency,
                              is_virtual:
                                  a.account_type === 'demo' || isDemoAccount(a.account_id) ? 1 : 0,
                              loginid: a.account_id,
                          }))
                    : v3AuthorizedAccounts && v3AuthorizedAccounts.length > 0
                      ? v3AuthorizedAccounts.map((a: any) => ({
                            balance: a.loginid === resolvedLoginId ? resolvedBalance : Number(a.balance) || 0,
                            currency: a.currency || resolvedCurrency,
                            is_virtual: a.is_virtual || isDemoAccount(a.loginid) ? 1 : 0,
                            loginid: a.loginid,
                        }))
                      : currentAccount
                        ? [currentAccount]
                        : [];

            setAccountList(accountList); // Observable stream
            if (resolvedLoginId) {
                setAuthData({
                    balance: resolvedBalance,
                    currency: resolvedCurrency,
                    loginid: resolvedLoginId,
                    is_virtual: account_type === 'real' ? 0 : 1,
                    account_list: accountList,
                });
            }

            const isDemo = isDemoAccount(resolvedLoginId);
            if (resolvedLoginId) {
                localStorage.setItem('account_type', isDemo ? 'demo' : 'real');
            }

            if (resolvedLoginId) {
                globalObserver.emit('api.authorize', {
                    account_list: accountList,
                    current_account: {
                        loginid: resolvedLoginId,
                        currency: resolvedCurrency,
                        is_virtual: account_type === 'real' ? 0 : 1,
                        balance: resolvedBalance,
                    },
                });
            }

            // Update the WebSocket login ID in the client store
            const currentClientStore = globalObserver.getState('client.store');
            if (currentClientStore && resolvedLoginId) {
                currentClientStore.setWebSocketLoginId(resolvedLoginId);
            }

            setIsAuthorized(true);
            this.is_authorized = true;
            localStorage.setItem('client_account_details', JSON.stringify(accountList));
            if (balance?.country) {
                localStorage.setItem('client.country', balance.country);
            }

            if (resolvedLoginId) {
                localStorage.setItem('active_loginid', resolvedLoginId);
            }

            if (this.has_active_symbols) {
                this.toggleRunButton(false);
            } else {
                this.active_symbols_promise = this.getActiveSymbols();
            }
            this.subscribe();
        } catch (e) {
            this.is_authorized = false;
            clearAuthData();
            setIsAuthorized(false);
            globalObserver.emit('Error', e);
        } finally {
            setIsAuthorizing(false);
        }
    }

    async subscribe() {
        const subscribeToStream = (streamName: string) => {
            return doUntilDone(
                () => {
                    const subscription = this.api?.send({
                        [streamName]: 1,
                        subscribe: 1,
                    });

                    if (subscription) {
                        this.current_auth_subscriptions.push(subscription);
                    }
                    return subscription;
                },
                [],
                this
            );
        };

        const streamsToSubscribe = ['balance', 'transaction', 'proposal_open_contract'];

        await Promise.all(streamsToSubscribe.map(subscribeToStream));
    }

    getActiveSymbols = async () => {
        if (!this.api) {
            throw new Error('API connection not available for fetching active symbols');
        }

        try {
            // Add timeout to prevent hanging - increased to 30 seconds for reliability
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Active symbols fetch timeout')), 30000)
            );

            const activeSymbolsPromise = doUntilDone(() => this.api?.send({ active_symbols: 'brief' }), [], this);

            const apiResult = await Promise.race([activeSymbolsPromise, timeout]);

            const { active_symbols = [], error = {} } = apiResult as any;

            if (error && Object.keys(error).length > 0) {
                throw new Error(`Active symbols API error: ${error.message || 'Unknown error'}`);
            }

            if (!active_symbols.length) {
                throw new Error('No active symbols received from API');
            }

            this.has_active_symbols = true;

            // Store raw symbols immediately
            this.active_symbols = active_symbols;
            
            // Process active symbols using the dedicated service with fallback (non-blocking)
            this.processSymbolsAsync(active_symbols).catch(error => {
                console.warn('Symbol enrichment failed, keeping raw symbols:', error);
            });

            this.toggleRunButton(false);
            return this.active_symbols;
        } catch (error) {
            console.error('Failed to fetch active symbols:', error);
            throw error;
        }
    };

    private async processSymbolsAsync(active_symbols: any[]) {
        try {
            const enrichmentTimeout = new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Enrichment timeout')), 15000)
            );

            const enrichmentPromise = activeSymbolsProcessorService.processActiveSymbols(active_symbols);
            const processedResult = await Promise.race([enrichmentPromise, enrichmentTimeout]);

            this.active_symbols = processedResult.enrichedSymbols;
            this.pip_sizes = processedResult.pipSizes;
        } catch (enrichmentError) {
            console.warn('Symbol enrichment failed, keeping raw symbols:', enrichmentError);
            // Keep raw symbols if enrichment fails
            this.pip_sizes = {};
        }
    }

    toggleRunButton = (toggle: boolean) => {
        const run_button = document.querySelector('#db-animation__run-button');
        if (!run_button) return;
        (run_button as HTMLButtonElement).disabled = toggle;
    };

    setIsRunning(toggle = false) {
        this.is_running = toggle;
    }

    pushSubscription(subscription: CurrentSubscription) {
        this.subscriptions.push(subscription);
    }

    clearSubscriptions() {
        this.subscriptions.forEach(s => s.unsubscribe());
        this.subscriptions = [];

        // Resetting timeout resolvers
        const global_timeouts = globalObserver.getState('global_timeouts') ?? [];

        global_timeouts.forEach((_: unknown, i: number) => {
            clearTimeout(i);
        });
    }
}

export const api_base = new APIBase();
