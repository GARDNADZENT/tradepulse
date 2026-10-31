import { storeAuthInfo } from '@/external/deriv-core';
import {
    account_list$,
    authData$,
    isAuthorized$,
    setAccountList,
    setAuthData,
    setIsAuthorized,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import ClientStore from '@/stores/client-store';
import RunPanelStore from '@/stores/run-panel-store';

jest.mock('@deriv-com/translations', () => ({
    localize: (str: string) => str,
    Localize: ({ i18n_default_text }: { i18n_default_text: string }) => i18n_default_text,
    getInitialLanguage: () => 'EN',
}));

jest.mock('@/external/bot-skeleton/services/api/api-base', () => ({
    api_base: {
        is_running: false,
        is_authorized: true,
        account_info: {},
        init: jest.fn(async () => undefined),
    },
}));

describe('PAT Login Session & Bot Execution Parity', () => {
    const originalFetch = globalThis.fetch;
    const envObj = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
    const originalAppId = envObj.NEXT_PUBLIC_DERIV_APP_ID;

    beforeEach(() => {
        localStorage.clear();
        sessionStorage.clear();
        DerivWSAccountsService.clearCache();
        setAccountList([]);
        setAuthData(null);
        setIsAuthorized(false);
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        envObj.NEXT_PUBLIC_DERIV_APP_ID = originalAppId;
    });

    it('hydrates ClientStore.is_logged_in = true from stored V2 PAT session on DOT Demo Options accounts', () => {
        storeAuthInfo({
            access_token: 'pat_synthetic_session_token',
            token_type: 'Bearer',
            expires_in: 31536000,
            expires_at: Math.floor(Date.now() / 1000) + 31536000,
            scope: 'trade',
            refresh_token: '',
        });
        DerivWSAccountsService.storeAccounts([
            {
                account_id: 'DOT00000001',
                balance: '9847.67',
                currency: 'USD',
                group: 'demo',
                status: 'active',
                account_type: 'demo',
            },
        ]);
        localStorage.setItem('active_loginid', 'DOT00000001');

        const client = new ClientStore({} as any);

        expect(client.is_logged_in).toBe(true);
        expect(client.loginid).toBe('DOT00000001');
        expect(client.currency).toBe('USD');
        expect(client.balance).toBe('9847.67');
        expect(client.is_virtual).toBe(true);
        expect(isAuthorized$.getValue()).toBe(true);
        expect(authData$.getValue()?.loginid).toBe('DOT00000001');
        expect(account_list$.getValue()).toHaveLength(1);

        client.destroy();
    });

    it('negotiates /otp WebSocket URL for pat_... tokens even when NEXT_PUBLIC_DERIV_APP_ID is configured', async () => {
        envObj.NEXT_PUBLIC_DERIV_APP_ID = 'app_synthetic_oauth_client';
        const seenHeaders: Record<string, string>[] = [];

        globalThis.fetch = jest.fn(async (_url: string, init?: RequestInit) => {
            seenHeaders.push((init?.headers || {}) as Record<string, string>);
            return {
                ok: true,
                status: 200,
                json: async () => ({
                    data: {
                        url: 'wss://api.derivws.com/trading/v1/options/ws/demo?otp=synthetic_otp',
                    },
                }),
            };
        }) as any;

        const wsUrl = await DerivWSAccountsService.fetchOTPWebSocketURL(
            'pat_synthetic_session_token',
            'DOT00000001'
        );

        expect(wsUrl).toBe('wss://api.derivws.com/trading/v1/options/ws/demo?otp=synthetic_otp');
        expect(seenHeaders[0].Authorization).toBe('Bearer pat_synthetic_session_token');
        expect(seenHeaders[0]['Deriv-App-ID']).toBeUndefined();
    });

    it('starts the bot on Run without showing the login dialog when logged in via PAT', async () => {
        storeAuthInfo({
            access_token: 'pat_synthetic_session_token',
            token_type: 'Bearer',
            expires_in: 31536000,
            expires_at: Math.floor(Date.now() / 1000) + 31536000,
            scope: 'trade',
            refresh_token: '',
        });
        DerivWSAccountsService.storeAccounts([
            {
                account_id: 'DOT00000001',
                balance: '9847.67',
                currency: 'USD',
                group: 'demo',
                status: 'active',
                account_type: 'demo',
            },
        ]);
        localStorage.setItem('active_loginid', 'DOT00000001');

        const client = new ClientStore({} as any);
        // Simulate a transient store reset prior to clicking Run
        client.setIsLoggedIn(false);

        const mockRunBot = jest.fn();
        const mockRootStore: any = {
            dbot: {
                saveRecentWorkspace: jest.fn(),
                unHighlightAllBlocks: jest.fn(),
                getStrategySounds: jest.fn(() => []),
                shouldRunBot: jest.fn(() => true),
                runBot: mockRunBot,
            },
            summary_card: {
                clear: jest.fn(),
                is_multiplier: false,
            },
            journal: {
                onLogSuccess: jest.fn(),
                onError: jest.fn(),
                onNotify: jest.fn(),
            },
            transactions: {
                onBotContractEvent: jest.fn(),
            },
        };
        const mockCore: any = {
            client,
            common: {
                is_socket_opened: true,
            },
            ui: {
                setAccountSwitcherDisabledMessage: jest.fn(),
                setPromptHandler: jest.fn(),
                is_mobile: true,
            },
        };

        const runPanel = new RunPanelStore(mockRootStore, mockCore);
        await runPanel.onRunButtonClick();

        expect(client.is_logged_in).toBe(true);
        expect(runPanel.is_dialog_open).toBe(false);
        expect(runPanel.is_running).toBe(true);
        expect(mockRunBot).toHaveBeenCalledTimes(1);

        runPanel.disposeReactionsFn?.();
        client.destroy();
    });
});
