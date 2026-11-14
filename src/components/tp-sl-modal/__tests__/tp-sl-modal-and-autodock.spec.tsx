import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TickPulse from '@/pages/tick-pulse/tick-pulse';
import {
    autoDockRunPanel,
    classifyBotAlertForTpSl,
    formatTpSlSignedAmount,
    resetTpSlModalForTests,
    TpSlResultModal,
    triggerTpSlModal,
} from '../index';

const mockExecuteLiveDerivTrade = jest.fn();
const mockToggleDrawer = jest.fn();
const mockSetActiveTabIndex = jest.fn();

jest.mock('@/utils/ai-bot-xml-builder', () => {
    const actual = jest.requireActual('@/utils/ai-bot-xml-builder');
    return {
        ...actual,
        executeLiveDerivTrade: (...args: any[]) => mockExecuteLiveDerivTrade(...args),
    };
});

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        client: {
            is_logged_in: true,
            currency: 'USD',
            loginid: 'VRTC12345',
        },
        journal: {},
        transactions: {},
        summary_card: {},
        run_panel: {
            is_drawer_open: false,
            active_index: 0,
            toggleDrawer: (...args: any[]) => mockToggleDrawer(...args),
            setActiveTabIndex: (...args: any[]) => mockSetActiveTabIndex(...args),
        },
    }),
}));

jest.mock('@/external/bot-skeleton', () => ({
    api_base: {
        is_authorized: true,
        account_info: { currency: 'USD' },
        api: null,
    },
    LogTypes: {
        PURCHASE: 'purchase',
        PROFIT: 'profit',
        LOST: 'lost',
    },
}));

jest.mock('@/external/bot-skeleton/services/api/chart-api', () => ({
    __esModule: true,
    default: { api: null },
}));

jest.mock('@/lib/deriv/tick-bus', () => ({
    derivBus: {
        getTicks: () =>
            Array.from({ length: 40 }, (_, i) => ({
                t: 1700000000000 + i * 1000,
                price: 250.09,
            })),
        getPipSize: () => 2,
        onHistory: () => () => {},
        onTick: () => () => {},
        subscribe: () => () => {},
    },
}));

describe('Universal TP/SL Pop-Up Modal & Auto-Docked Sidebar', () => {
    beforeEach(() => {
        window.localStorage.clear();
        resetTpSlModalForTests();
        mockExecuteLiveDerivTrade.mockReset();
        mockToggleDrawer.mockReset();
        mockSetActiveTabIndex.mockReset();
    });

    it('renders Take Profit Hit (+$10.22) and Stop Loss Hit (-$25.00) modals and closes on Continue', () => {
        render(<TpSlResultModal />);
        expect(screen.queryByTestId('tp-sl-result-modal')).not.toBeInTheDocument();

        act(() => {
            triggerTpSlModal({ type: 'tp', amount: 10.22, currency: 'USD' });
        });

        expect(screen.getByTestId('tp-sl-modal-title')).toHaveTextContent('Take Profit Hit');
        expect(screen.getByTestId('tp-sl-modal-amount')).toHaveTextContent('+$10.22');

        fireEvent.click(screen.getByTestId('tp-sl-modal-continue'));
        expect(screen.queryByTestId('tp-sl-result-modal')).not.toBeInTheDocument();

        act(() => {
            resetTpSlModalForTests();
            triggerTpSlModal({ type: 'sl', amount: -25, currency: 'USD' });
        });

        expect(screen.getByTestId('tp-sl-modal-title')).toHaveTextContent('Stop Loss Hit');
        expect(screen.getByTestId('tp-sl-modal-amount')).toHaveTextContent('-$25.00');
    });

    it('classifies XML bot text_print alerts into TP/SL accurately while ignoring startup banners', () => {
        expect(classifyBotAlertForTpSl('TRADERSPULSE', 0, 0)).toBeNull();
        expect(classifyBotAlertForTpSl('<< CONGRATULATIONS >>', 12.4, 8)).toBe('tp');
        expect(classifyBotAlertForTpSl('Ooops! You hit your Stop Loss', -30, 6)).toBe('sl');
        expect(formatTpSlSignedAmount(10.22, 'USD', 'tp')).toBe('+$10.22');
        expect(formatTpSlSignedAmount(-15.5, 'EUR', 'sl')).toBe('-€15.50');
    });

    it('auto-docks RunPanel to Transactions when starting an operation and pops up Take Profit Hit upon reaching TP', async () => {
        let onContractUpdateCb: ((poc: any, isTerminal: boolean) => void) | undefined;
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            onContractUpdateCb = params.onContractUpdate;
            return {
                contractId: 7771,
                buyPrice: params.stake,
                longcode: 'Over 2',
            };
        });

        render(
            <>
                <TickPulse />
                <TpSlResultModal />
            </>
        );

        // Set Take Profit to 10.00
        fireEvent.change(screen.getByTestId('tickpulse-take-profit'), {
            target: { value: '10' },
        });

        // Start TickPulse operation -> sidebar automatically docks open to Transactions (tab 1)
        await act(async () => {
            fireEvent.click(screen.getByTestId('tickpulse-load-and-run'));
        });

        expect(mockSetActiveTabIndex).toHaveBeenCalledWith(1);
        expect(mockToggleDrawer).toHaveBeenCalledWith(true);

        await waitFor(() => {
            expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        });

        // Settle contract with +$10.22 profit (>= $10 TP) -> Take Profit Hit modal pops up!
        await act(async () => {
            onContractUpdateCb?.(
                {
                    contract_id: 7771,
                    profit: 10.22,
                    buy_price: 1,
                    currency: 'USD',
                },
                true
            );
        });

        expect(screen.getByTestId('tp-sl-modal-title')).toHaveTextContent('Take Profit Hit');
        expect(screen.getByTestId('tp-sl-modal-amount')).toHaveTextContent('+$10.22');

        const dummyPanel = { is_drawer_open: false, active_index: 0 };
        autoDockRunPanel(dummyPanel, 1);
        expect(dummyPanel).toEqual({ is_drawer_open: true, active_index: 1 });
    });
});
