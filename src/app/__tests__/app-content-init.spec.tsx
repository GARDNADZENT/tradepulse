import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { CONNECTION_STATUS } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import AppContent from '../app-content';

/**
 * Regression tests for the "Initializing Deriv Bot account" hang.
 *
 * The production symptom was a page that rendered the header and account balance
 * but never mounted the dashboard: startup left the loading screen only from
 * `retrieveActiveSymbols().then(...)`, so a WebSocket that never opened, or a
 * symbol request that rejected / never settled, produced a permanent spinner with
 * no error and no way to retry.
 */

const mockRetrieveActiveSymbols = jest.fn();
const mockApiInit = jest.fn((..._args: unknown[]) => Promise.resolve());
const mockConnectionStatus = { current: CONNECTION_STATUS.UNKNOWN };

jest.mock('@/hooks/useApiBase', () => ({
    useApiBase: () => ({ connectionStatus: mockConnectionStatus.current }),
}));

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        app: { setDBotEngineStores: jest.fn(), api_helpers_store: {} },
        transactions: { recovered_transactions: [], recoverPendingContracts: jest.fn() },
        common: { setSocketOpened: jest.fn(), current_language: 'EN', error: null },
        client: { is_logged_in: false, loginid: '', currency: 'USD' },
    }),
}));

jest.mock('@/external/bot-skeleton', () => {
    const active_symbols = { retrieveActiveSymbols: (...args: unknown[]) => mockRetrieveActiveSymbols(...args) };
    return {
        // Reassigned per test to simulate "helper not created yet".
        ApiHelpers: { instance: { active_symbols }, setInstance: jest.fn(), disposeInstance: jest.fn() },
        api_base: { init: (...args: unknown[]) => mockApiInit(...args), api: null },
        ServerTime: { init: jest.fn() },
    };
});

jest.mock('@/services/supabase/status.service', () => ({
    statusService: { saveStatus: jest.fn(() => Promise.resolve(null)) },
}));

jest.mock('@/components/chat/useLiveChat', () => () => {});
jest.mock('@/hooks/useDevMode', () => () => {});
jest.mock('@/hooks/useThemeSwitcher', () => () => ({ is_dark_mode_on: false }));
jest.mock('@/utils/gtm', () => ({ init: jest.fn() }), { virtual: true });
jest.mock('@/components/blockly-loading', () => () => <div>blockly loading</div>);
jest.mock('@/components/audio', () => () => null);
jest.mock('@/components/bot-stopped', () => () => null);
jest.mock('@/components/bot-notification/bot-notification', () => ({ botNotification: jest.fn() }));
jest.mock('@/components/transaction-details', () => () => null);
jest.mock('@/pages/bot-builder', () => () => null);
jest.mock('@/pages/main', () => () => <div data-testid='dashboard'>dashboard mounted</div>);
jest.mock('@/components/auth-loading-wrapper', () => ({ children }: React.PropsWithChildren) => <>{children}</>);

describe('AppContent startup gate', () => {
    beforeEach(() => {
        mockConnectionStatus.current = CONNECTION_STATUS.UNKNOWN;
        mockRetrieveActiveSymbols.mockReset();
        mockApiInit.mockClear();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('shows the initializing state while waiting for the socket', () => {
        render(<AppContent />);
        expect(screen.getByTestId('dt_init_loading')).toBeInTheDocument();
        expect(screen.getByText('Initializing Deriv Bot account')).toBeInTheDocument();
    });

    it('mounts the dashboard once active symbols load', async () => {
        mockRetrieveActiveSymbols.mockResolvedValue([]);
        mockConnectionStatus.current = CONNECTION_STATUS.OPENED;

        render(<AppContent />);

        expect(await screen.findByTestId('dashboard')).toBeInTheDocument();
        expect(mockRetrieveActiveSymbols).toHaveBeenCalledWith(true);
    });

    it('shows a retryable error instead of spinning forever when the socket never opens', () => {
        jest.useFakeTimers();
        render(<AppContent />);

        act(() => {
            jest.advanceTimersByTime(21_000);
        });

        const alert = screen.getByRole('alert');
        expect(alert).toBeInTheDocument();
        expect(screen.getByText('Unable to connect to Deriv')).toBeInTheDocument();
        // Naming the likely cause is the point: users cannot fix a silent spinner.
        expect(screen.getByText(/blocked WebSocket/i)).toBeInTheDocument();
        expect(screen.getByTestId('dt_init_retry')).toBeInTheDocument();
        expect(screen.queryByTestId('dt_init_loading')).not.toBeInTheDocument();
    });

    it('does not raise the socket error once the connection is open', async () => {
        jest.useFakeTimers();
        mockRetrieveActiveSymbols.mockResolvedValue([]);
        mockConnectionStatus.current = CONNECTION_STATUS.OPENED;

        render(<AppContent />);
        expect(await screen.findByTestId('dashboard')).toBeInTheDocument();

        // Deadline elapses well after startup finished: it must stay inert.
        act(() => {
            jest.advanceTimersByTime(25_000);
        });

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });

    it('recovers when a symbol request is retried after a rejection', async () => {
        jest.useFakeTimers();
        mockRetrieveActiveSymbols.mockRejectedValueOnce(new Error('Active symbols API error: timeout'));
        mockRetrieveActiveSymbols.mockResolvedValueOnce([]);
        mockConnectionStatus.current = CONNECTION_STATUS.OPENED;

        render(<AppContent />);

        await act(async () => {
            await Promise.resolve();
        });
        // First failure is retried silently before any error is shown.
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        await act(async () => {
            jest.advanceTimersByTime(2_000);
        });

        expect(mockRetrieveActiveSymbols).toHaveBeenCalledTimes(2);
        // A silent failure is usually a half-open socket, so the retry must rebuild
        // it — `generateDerivApiInstance` reuses a socket that still looks OPEN.
        expect(mockApiInit).toHaveBeenCalledWith(true);
        expect(screen.getByTestId('dashboard')).toBeInTheDocument();
    });

    it('surfaces a symbols error after the retry also fails', async () => {
        jest.useFakeTimers();
        mockRetrieveActiveSymbols.mockRejectedValue(new Error('Active symbols API error: timeout'));
        mockConnectionStatus.current = CONNECTION_STATUS.OPENED;

        render(<AppContent />);

        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            jest.advanceTimersByTime(2_000);
        });
        await act(async () => {
            await Promise.resolve();
        });

        expect(mockRetrieveActiveSymbols).toHaveBeenCalledTimes(2);
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByText('Could not load Deriv markets')).toBeInTheDocument();
    });

    it('retry rebuilds the socket and returns to the loading state', async () => {
        jest.useFakeTimers();
        render(<AppContent />);

        act(() => {
            jest.advanceTimersByTime(21_000);
        });
        expect(screen.getByRole('alert')).toBeInTheDocument();

        mockRetrieveActiveSymbols.mockResolvedValue([]);
        await act(async () => {
            screen.getByTestId('dt_init_retry').click();
        });

        // Disconnected socket → force a brand new connection.
        expect(mockApiInit).toHaveBeenCalledWith(true);
        expect(screen.getByTestId('dt_init_loading')).toBeInTheDocument();
    });
});
