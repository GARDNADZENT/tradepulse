import React, { lazy, Suspense, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { ToastContainer } from 'react-toastify';
import AuthLoadingWrapper from '@/components/auth-loading-wrapper';
import { botNotification } from '@/components/bot-notification/bot-notification';
import useLiveChat from '@/components/chat/useLiveChat';
import { getUrlBase } from '@/components/shared';
import TransactionDetailsModal from '@/components/transaction-details';
import { api_base, ApiHelpers, ServerTime } from '@/external/bot-skeleton';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useApiBase } from '@/hooks/useApiBase';
import useDevMode from '@/hooks/useDevMode';
import { useStore } from '@/hooks/useStore';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { isPreviewMode } from '@/utils/is-preview-mode';
import {
    SOCKET_OPEN_TIMEOUT_MS,
    SYMBOLS_LOAD_TIMEOUT_MS,
    getSocketTimeoutFailure,
    getSymbolsErrorFailure,
    getSymbolsTimeoutFailure,
    withTimeout,
} from '@/utils/api-init-timeout';
import { statusService } from '@/services/supabase/status.service';
import { ThemeProvider } from '@deriv-com/quill-ui';
import { setSmartChartsPublicPath } from '@deriv-com/smartcharts-champion';
import { localize } from '@deriv-com/translations';
import Audio from '../components/audio';
import BlocklyLoading from '../components/blockly-loading';
import BotStopped from '../components/bot-stopped';
import BotBuilder from '../pages/bot-builder';
import Main from '../pages/main';
import './app.scss';
import 'react-toastify/dist/ReactToastify.css';
import '../components/bot-notification/bot-notification.scss';

// App Builder live-preview branding listener. Mounted only in the preview deployment
// (NEXT_PUBLIC_APP_BUILD === 'true'); the inline check is constant-folded by rsbuild so
// the import — and all of src/preview/ — is dead-code-eliminated from standalone partner
// builds (where the BFF strips src/preview/ entirely).
const PreviewBranding =
    process.env.NEXT_PUBLIC_APP_BUILD === 'true' ? lazy(() => import('../preview/preview-branding')) : null;

const AppContent = observer(() => {
    const [is_api_initialized, setIsApiInitialized] = React.useState(false);
    const [is_loading, setIsLoading] = React.useState(true);
    // Set when startup gives up (socket never opened, or the market list failed).
    // Rendering an explicit error instead of spinning forever is the whole point:
    // a silent spinner left users unable to tell a blocked WebSocket from a slow API.
    const [init_failure, setInitFailure] = React.useState(null);
    // Bumped by Retry so the bootstrap effects run again.
    const [init_attempt, setInitAttempt] = React.useState(0);

    const store = useStore();
    const { app, transactions, common, client } = store;
    const { is_dark_mode_on } = useThemeSwitcher();

    const { recovered_transactions, recoverPendingContracts } = transactions;
    const is_subscribed_to_msg_listener = React.useRef(false);
    const msg_listener = React.useRef(null);
    const retry_timer = React.useRef(null);
    // Refs mirror the two flags for callbacks armed in earlier renders
    // (the socket deadline is deliberately not re-armed on every state change).
    const api_initialized_ref = React.useRef(false);
    api_initialized_ref.current = is_api_initialized;
    const loading_ref = React.useRef(true);
    loading_ref.current = is_loading;
    const { connectionStatus } = useApiBase();

    // Initialize dev mode keyboard shortcuts
    useDevMode();

    // Warn (once) when the OAuth app id isn't configured, so a developer running
    // locally understands why Log in / Sign up are disabled. Skipped inside the
    // App Builder static preview, which intentionally runs without env vars.
    useEffect(() => {
        if (isPreviewMode()) return;
        if (typeof window !== 'undefined' && window.localStorage.getItem('active_loginid')) return;
        const rawAppId = process.env.NEXT_PUBLIC_DERIV_APP_ID;
        if (!rawAppId || rawAppId.trim() === '🔒') {
            botNotification(localize('Waiting for environment variables to be set…'), undefined, { type: 'warning' });
        }
    }, []);

    const livechat_client_information = {
        is_client_store_initialized: client?.is_logged_in ? true : !!client,
        is_logged_in: client?.is_logged_in,
        loginid: client?.loginid,
        currency: client?.currency,
        residence: client?.residence,
        email: '',
        first_name: '',
        last_name: '',
    };

    useLiveChat(livechat_client_information);

    // NOTE: Disabled Intercom until further notice
    // const token = V2GetActiveToken() ?? null;
    // useIntercom(token);

    useEffect(() => {
        if (connectionStatus === CONNECTION_STATUS.OPENED) {
            setIsApiInitialized(true);
            common.setSocketOpened(true);
            statusService.saveStatus('connected', { connectionStatus: 'opened' });
        } else if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            common.setSocketOpened(false);
            statusService.saveStatus('disconnected', { connectionStatus });
        }
    }, [common, connectionStatus]);

    // Never wait for the socket forever. Without this the loading screen had no
    // exit when the WebSocket was blocked (ad blocker, VPN, firewall, offline) and
    // never reached OPENED, so nothing ever set `is_api_initialized` or `is_loading`.
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            // The socket opened (`is_api_initialized`) or startup already resolved
            // (success or a symbols error) — the connection is not the problem.
            if (api_initialized_ref.current || !loading_ref.current) return;
            console.error('[TradersPulse] Deriv socket did not open within', SOCKET_OPEN_TIMEOUT_MS, 'ms');
            setInitFailure(getSocketTimeoutFailure(connectionStatus));
            setIsLoading(false);
        }, SOCKET_OPEN_TIMEOUT_MS);

        return () => clearTimeout(timeoutId);
        // Re-armed on every retry.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [init_attempt]);

    useEffect(
        () => () => {
            if (retry_timer.current) clearTimeout(retry_timer.current);
        },
        []
    );

    const retryInitialization = React.useCallback(() => {
        setInitFailure(null);
        setIsLoading(true);
        if (retry_timer.current) {
            clearTimeout(retry_timer.current);
            retry_timer.current = null;
        }
        // A dead socket must be rebuilt: `generateDerivApiInstance` reuses any
        // CONNECTING/OPEN singleton, so the error path has to force a new socket
        // rather than waiting on the same one again.
        if (connectionStatus !== CONNECTION_STATUS.OPENED) {
            ApiHelpers.disposeInstance();
            api_base.init(true).catch(error => {
                console.error('[TradersPulse] Reconnect failed:', error);
            });
        }
        setInitAttempt(attempt => attempt + 1);
    }, [connectionStatus]);

    const { current_language } = common;
    const html = document.documentElement;
    React.useEffect(() => {
        html?.setAttribute('lang', current_language.toLowerCase());
        html?.setAttribute('dir', current_language.toLowerCase() === 'ar' ? 'rtl' : 'ltr');
    }, [current_language, html]);

    const handleMessage = React.useCallback(
        ({ data }) => {
            if (data?.msg_type === 'proposal_open_contract' && !data?.error) {
                const { proposal_open_contract } = data;
                if (
                    proposal_open_contract?.status !== 'open' &&
                    !recovered_transactions?.includes(proposal_open_contract?.contract_id)
                ) {
                    recoverPendingContracts(proposal_open_contract);
                }
            }
        },
        [recovered_transactions, recoverPendingContracts]
    );

    React.useEffect(() => {
        setSmartChartsPublicPath(getUrlBase('/js/smartcharts/'));
    }, []);

    React.useEffect(() => {
        // Check if api is initialized and then subscribe to the api messages
        // Also we should only subscribe to the messages once user is logged in
        // And is not already subscribed to the messages
        if (!is_subscribed_to_msg_listener.current && client.is_logged_in && is_api_initialized && api_base?.api) {
            is_subscribed_to_msg_listener.current = true;
            msg_listener.current = api_base.api.onMessage()?.subscribe(handleMessage);
        }
        return () => {
            if (is_subscribed_to_msg_listener.current && msg_listener.current) {
                is_subscribed_to_msg_listener.current = false;
                msg_listener.current.unsubscribe?.();
            }
        };
    }, [is_api_initialized, client.is_logged_in, client.loginid, handleMessage, connectionStatus]);

    const init = () => {
        ServerTime.init(common);
        app.setDBotEngineStores();
        ApiHelpers.setInstance(app.api_helpers_store);
        import('@/utils/gtm').then(({ default: GTM }) => {
            GTM.init(store);
        });
    };

    const changeActiveSymbolLoadingState = () => {
        init();

        const retrieveActiveSymbols = (is_retry = false) => {
            const active_symbols = ApiHelpers?.instance?.active_symbols;

            if (!active_symbols) {
                setInitFailure(getSymbolsErrorFailure(new Error('Market data helper is unavailable')));
                setIsLoading(false);
                return;
            }

            // `retrieveActiveSymbols` can reject (socket error) *or* never settle at
            // all (a request that gets no reply while the socket looks open). Both
            // used to leave the app on the loading screen forever, because the only
            // way out was the `.then()` below.
            withTimeout(
                Promise.resolve(active_symbols.retrieveActiveSymbols(true)),
                SYMBOLS_LOAD_TIMEOUT_MS,
                'Active symbols request timed out'
            )
                .then(() => {
                    setInitFailure(null);
                    setIsLoading(false);
                })
                .catch(error => {
                    console.error('[TradersPulse] Failed to load active symbols:', error);

                    if (!is_retry) {
                        // Either the request rejected, or it hung long enough to hit
                        // the deadline above. Both usually mean the socket is in a
                        // half-open state (`readyState === OPEN`, but nothing is
                        // delivered — e.g. after a laptop sleep or a proxy reset) and
                        // `generateDerivApiInstance` would happily reuse it. Force a
                        // fresh connection and retry once before giving up.
                        retry_timer.current = setTimeout(() => {
                            retry_timer.current = null;
                            api_base.init(true).catch(reconnect_error => {
                                console.error('[TradersPulse] Reconnect during retry failed:', reconnect_error);
                            });
                            retrieveActiveSymbols(true);
                        }, 1500);
                        return;
                    }

                    const timed_out = error instanceof Error && error.message === 'Active symbols request timed out';
                    setInitFailure(timed_out ? getSymbolsTimeoutFailure() : getSymbolsErrorFailure(error));
                    setIsLoading(false);
                });
        };

        if (ApiHelpers?.instance?.active_symbols) {
            retrieveActiveSymbols();
        } else {
            // This is a workaround to fix the issue where the active symbols are not loaded immediately
            // when the API is initialized. Should be replaced with RxJS pubsub.
            // Bounded: if the helper never appears, fall through to the error screen
            // instead of polling a dead interval forever.
            const started_at = Date.now();
            const intervalId = setInterval(() => {
                if (ApiHelpers?.instance?.active_symbols) {
                    clearInterval(intervalId);
                    retrieveActiveSymbols();
                } else if (Date.now() - started_at >= SYMBOLS_LOAD_TIMEOUT_MS) {
                    clearInterval(intervalId);
                    setInitFailure(getSymbolsTimeoutFailure());
                    setIsLoading(false);
                }
            }, 1000);

            return () => clearInterval(intervalId);
        }
    };

    React.useEffect(() => {
        if (is_api_initialized) {
            init();
            setIsLoading(true);
            if (!client.is_logged_in) {
                // Polling never finds the helper → the cleanup stops the interval.
                return changeActiveSymbolLoadingState();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_api_initialized, init_attempt]);

    React.useEffect(() => {
        if (client.is_logged_in && is_api_initialized) {
            return changeActiveSymbolLoadingState();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [is_api_initialized, client.loginid, init_attempt]);

    if (common?.error) return null;

    return (
        <React.Fragment>
            {PreviewBranding && (
                <Suspense fallback={null}>
                    <PreviewBranding />
                </Suspense>
            )}
            {init_failure ? (
                <div className='app-root__loading app-root__loading--error' role='alert' data-testid='dt_init_error'>
                    <div className='app-root__loading-card'>
                        <h2 className='app-root__loading-title'>{init_failure.title}</h2>
                        <p className='app-root__loading-detail'>{init_failure.detail}</p>
                        <div className='app-root__loading-actions'>
                            <button
                                type='button'
                                className='app-root__loading-retry'
                                onClick={retryInitialization}
                                data-testid='dt_init_retry'
                            >
                                {localize('Retry')}
                            </button>
                            <button
                                type='button'
                                className='app-root__loading-reload'
                                onClick={() => window.location.reload()}
                            >
                                {localize('Reload page')}
                            </button>
                        </div>
                        <p className='app-root__loading-code'>{init_failure.code}</p>
                    </div>
                </div>
            ) : is_loading ? (
                <div className='app-root__loading' data-testid='dt_init_loading'>
                    <span className='app-root__loading-spinner' aria-hidden='true' />
                    <span>{localize('Initializing Deriv Bot account')}</span>
                </div>
            ) : (
                <AuthLoadingWrapper>
                    <ThemeProvider theme={is_dark_mode_on ? 'dark' : 'light'}>
                        <BlocklyLoading />
                        <div className='bot-dashboard bot' data-testid='dt_bot_dashboard'>
                            <Audio />
                            <Main />
                            <BotBuilder />
                            <BotStopped />
                            <TransactionDetailsModal />
                            <ToastContainer limit={3} draggable={false} />
                        </div>
                    </ThemeProvider>
                </AuthLoadingWrapper>
            )}
        </React.Fragment>
    );
});

export default AppContent;
