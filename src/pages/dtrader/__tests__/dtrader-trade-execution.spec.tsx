import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { resetTpSlModalForTests, TpSlResultModal } from '@/components/tp-sl-modal';
import DTrader from '../dtrader';

class TestErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null };
    static getDerivedStateFromError(error: Error) {
        return { error };
    }
    render() {
        if (this.state.error) {
            return <div>Sorry for the interruption: {this.state.error.message}</div>;
        }
        return this.props.children;
    }
}

const messageListeners: Array<(evt: { data: any }) => void> = [];
const mockToggleDrawer = jest.fn();
const mockSetActiveTabIndex = jest.fn();
let buyCounter = 0;

const mockSend = jest.fn(async (payload: any) => {
    if (payload.proposal) {
        const isMatch = payload.contract_type === 'DIGITMATCH';
        return {
            proposal: {
                id: `prop-${payload.contract_type}`,
                ask_price: payload.amount || 0.35,
                payout: isMatch ? 2.33 : 0.37,
                longcode: `Win payout on ${payload.contract_type}`,
            },
        };
    }
    if (payload.buy) {
        buyCounter += 1;
        return {
            buy: {
                contract_id: 987654320 + buyCounter,
                transaction_id: 555666770 + buyCounter,
                buy_price: payload.price || 0.35,
                payout: 2.33,
                longcode:
                    'Win payout if the last digit of Volatility 100 (1s) Index matches prediction after 1 ticks.',
                start_time: 1730300000,
            },
        };
    }
    if (payload.proposal_open_contract) {
        return { proposal_open_contract: { contract_id: payload.contract_id, status: 'open' } };
    }
    return {};
});

jest.mock('@/external/bot-skeleton', () => ({
    api_base: {
        is_authorized: true,
        account_info: { currency: 'USD', loginid: 'VRTC948201' },
        active_symbols: [
            {
                underlying_symbol: '1HZ100V',
                underlying_symbol_name: 'Volatility 100 (1s) Index',
                market: 'synthetic_index',
                pip_size: 0.01,
            },
            {
                underlying_symbol: 'R_50',
                underlying_symbol_name: 'Volatility 50 Index',
                market: 'synthetic_index',
                pip_size: 0.0001,
            },
        ],
        api: {
            send: (payload: any) => mockSend(payload),
            onMessage: () => ({
                subscribe: (cb: (evt: { data: any }) => void) => {
                    messageListeners.push(cb);
                    return {
                        unsubscribe: () => {
                            const idx = messageListeners.indexOf(cb);
                            if (idx >= 0) messageListeners.splice(idx, 1);
                        },
                    };
                },
            }),
        },
    },
    LogTypes: { PURCHASE: 'purchase', PROFIT: 'profit', LOST: 'lost' },
}));

jest.mock('@/external/bot-skeleton/services/api/chart-api', () => ({
    __esModule: true,
    default: { api: null },
}));

jest.mock('@/lib/deriv/tick-bus', () => ({
    derivBus: {
        getPipSize: () => 2,
        getTicks: () =>
            Array.from({ length: 36 }, (_, i) => ({
                t: 1730300000000 + i * 1000,
                price: 1419.5 + (i % 7) * 0.11,
            })),
        subscribe: () => () => {},
        onTick: () => () => {},
        onHistory: () => () => {},
        onStatus: () => () => {},
    },
}));

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        client: {
            is_logged_in: true,
            loginid: 'VRTC948201',
            currency: 'USD',
        },
        journal: {},
        summary_card: {},
        transactions: {
            recovered_transactions: [],
            recovered_completed_transactions: [],
        },
        run_panel: {
            is_drawer_open: false,
            active_index: 0,
            toggleDrawer: (...args: any[]) => mockToggleDrawer(...args),
            setActiveTabIndex: (...args: any[]) => mockSetActiveTabIndex(...args),
        },
        ui: {},
    }),
}));

describe('DTrader SmartCharts Canvas, 2x5 Circular Digits & 4-Button Execution Card', () => {
    beforeEach(() => {
        localStorage.clear();
        resetTpSlModalForTests();
        messageListeners.length = 0;
        buyCounter = 0;
        mockSend.mockClear();
        mockToggleDrawer.mockClear();
        mockSetActiveTabIndex.mockClear();
    });

    it('renders SmartCharts controls, 2x5 circular 0-9 digit rings, Matches/Differs/Both/AUTO buttons, auto-docks sidebar, and triggers TP modal on win', async () => {
        render(
            <TestErrorBoundary>
                <DTrader />
                <TpSlResultModal />
            </TestErrorBoundary>
        );

        // 1. Verify chart controls & 2x5 circular digit rings render
        expect(screen.getByText('Default')).toBeInTheDocument();
        expect(screen.getAllByText('Digits').length).toBeGreaterThanOrEqual(2);
        expect(screen.getByText('Line')).toBeInTheDocument();
        expect(screen.getByText('Candles')).toBeInTheDocument();
        expect(screen.getByTestId('dtrader-digits-cluster')).toBeInTheDocument();
        expect(screen.getByTestId('dtrader-digit-ring-0')).toBeInTheDocument();
        expect(screen.getByTestId('dtrader-digit-ring-9')).toBeInTheDocument();

        // Clicking digit ring 6 sets Prediction to 6
        fireEvent.click(screen.getByTestId('dtrader-digit-ring-6'));
        expect((screen.getByTestId('dtrader-prediction-input') as HTMLInputElement).value).toBe('6');

        // Toggle Line and back to Candles
        fireEvent.click(screen.getByText('Line'));
        fireEvent.click(screen.getByText('Candles'));

        // 2. Verify default Matches / Differs / Both / AUTO buttons
        const upBtn = screen.getByTestId('dtrader-buy-up');
        const downBtn = screen.getByTestId('dtrader-buy-down');
        const bothBtn = screen.getByTestId('dtrader-buy-both');
        const autoBtn = screen.getByTestId('dtrader-buy-auto');

        expect(upBtn).toHaveTextContent('Matches');
        expect(downBtn).toHaveTextContent('Differs');
        expect(bothBtn).toHaveTextContent(/Both/i);
        expect(bothBtn).toHaveTextContent(/Matches \+ Differs/i);
        expect(autoBtn).toHaveTextContent(/AUTO/i);

        // Execute single Matches leg -> auto-docks global Transactions drawer
        await act(async () => {
            fireEvent.click(upBtn);
        });

        expect(mockSetActiveTabIndex).toHaveBeenCalledWith(1);
        expect(mockToggleDrawer).toHaveBeenCalledWith(true);

        await waitFor(() => {
            expect(screen.queryByText(/Sorry for the interruption/i)).not.toBeInTheDocument();
            expect(screen.getByTestId('dtrader-status-line')).toHaveTextContent(
                /Bought: Win payout if the last digit/i
            );
        });

        // Settle contract with +$3.10 profit (>= default TP 2.5) -> CONTRACT WON & Take Profit Hit modal pops up!
        await act(async () => {
            messageListeners.slice().forEach(cb =>
                cb({
                    data: {
                        proposal_open_contract: {
                            contract_id: 987654321,
                            status: 'won',
                            is_sold: 1,
                            buy_price: 0.35,
                            bid_price: 3.45,
                            payout: 3.45,
                            profit: 3.1,
                            currency: 'USD',
                            entry_spot: { quote: 1419.85, epoch: 1730300001 },
                            exit_spot: { quote: 1419.96, epoch: 1730300002 },
                            transaction_ids: { buy: 555666771, sell: 555666888 },
                        },
                    },
                })
            );
        });

        await waitFor(() => {
            expect(screen.getByTestId('tp-sl-modal-title')).toHaveTextContent('Take Profit Hit');
            expect(screen.getByTestId('tp-sl-modal-amount')).toHaveTextContent('+$3.10');
        });
        fireEvent.click(screen.getByTestId('tp-sl-modal-continue'));

        // 3. Test simultaneous 'Both' button (purchases Matches + Differs in parallel)
        const buysBeforeBoth = buyCounter;
        await act(async () => {
            fireEvent.click(screen.getByTestId('dtrader-buy-both'));
        });
        expect(buyCounter - buysBeforeBoth).toBe(2);

        // 4. Switch Trade Type to Accumulators and verify Growth Rate selector
        fireEvent.change(screen.getByLabelText('Trade Type'), {
            target: { value: 'accumulators' },
        });
        expect(screen.getByText('Growth Rate')).toBeInTheDocument();
        expect(screen.getByTestId('dtrader-buy-up')).toHaveTextContent(/Buy Accumulator/i);
    });
});
