import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const mockSend = jest.fn(async (payload: any) => {
    if (payload.proposal) {
        return {
            proposal: {
                id: 'prop-123',
                ask_price: 10,
                payout: 16.52,
                longcode:
                    'Win payout if the last digit of Volatility 100 (1s) Index is strictly lower than 6 after 1 ticks.',
            },
        };
    }
    if (payload.buy) {
        return {
            buy: {
                contract_id: 987654321,
                transaction_id: 555666777,
                buy_price: 10,
                payout: 16.52,
                longcode:
                    'Win payout if the last digit of Volatility 100 (1s) Index is strictly lower than 6 after 1 ticks.',
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
            Array.from({ length: 24 }, (_, i) => ({
                t: 1730300000000 + i * 1000,
                price: 1356.1 + (i % 5) * 0.11,
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
        transactions: {
            recovered_transactions: [],
            recovered_completed_transactions: [],
        },
        ui: {},
    }),
}));

describe('DTrader RiskManagers-style trade execution & chart controls', () => {
    beforeEach(() => {
        localStorage.clear();
        messageListeners.length = 0;
        mockSend.mockClear();
    });

    it('renders dual purchase buttons, chart modes (Default/Digits, Line/Candles), 0-9 distribution, and settles live trades cleanly', async () => {
        render(
            <TestErrorBoundary>
                <DTrader />
            </TestErrorBoundary>
        );

        // Verify chart controls & dual purchase buttons render
        expect(screen.getByText('Default')).toBeInTheDocument();
        expect(screen.getByText('Digits')).toBeInTheDocument();
        expect(screen.getByText('Line')).toBeInTheDocument();
        expect(screen.getByText('Candles')).toBeInTheDocument();
        expect(screen.getByText('0–9 Digit Distribution')).toBeInTheDocument();

        // Toggle Candles and back to Line
        fireEvent.click(screen.getByText('Candles'));
        fireEvent.click(screen.getByText('Line'));

        const overBtn = await screen.findByTestId('dtrader-buy-up');
        const underBtn = await screen.findByTestId('dtrader-buy-down');
        expect(overBtn).toHaveTextContent(/Over 6 — Payout/i);
        expect(underBtn).toHaveTextContent(/Under 6 — Payout/i);

        await act(async () => {
            fireEvent.click(underBtn);
        });

        await waitFor(() => {
            expect(screen.queryByText(/Sorry for the interruption/i)).not.toBeInTheDocument();
            expect(screen.getByText(/OPEN CONTRACT/i)).toBeInTheDocument();
            expect(
                screen.getAllByText(/Bought: Win payout if the last digit/i).length
            ).toBeGreaterThan(0);
        });

        // Emit settlement update including nested object spot payload to verify primitive coercion
        await act(async () => {
            messageListeners.slice().forEach(cb =>
                cb({
                    data: {
                        proposal_open_contract: {
                            contract_id: 987654321,
                            status: 'won',
                            is_sold: 1,
                            buy_price: 10,
                            bid_price: 16.52,
                            payout: 16.52,
                            profit: 6.52,
                            currency: 'USD',
                            entry_spot: { quote: 1356.21, epoch: 1730300001 },
                            exit_spot: { quote: 1356.32, epoch: 1730300002 },
                            transaction_ids: { buy: 555666777, sell: 555666888 },
                        },
                    },
                })
            );
        });

        await waitFor(() => {
            expect(screen.queryByText(/Sorry for the interruption/i)).not.toBeInTheDocument();
            expect(screen.getByText(/CONTRACT WON/i)).toBeInTheDocument();
            expect(screen.getByText(/Won: Under 6/i)).toBeInTheDocument();
        });

        // Switch DTRADER RECORD to Transactions tab
        const txTabs = screen.getAllByRole('button', { name: /Transactions/i });
        fireEvent.click(txTabs[0]);

        await waitFor(() => {
            expect(screen.queryByText(/Sorry for the interruption/i)).not.toBeInTheDocument();
            expect(screen.getAllByText(/\+6\.52 USD/i).length).toBeGreaterThanOrEqual(2);
        });

        // Switch trade type to Accumulators and verify growth rate selector
        fireEvent.change(screen.getByLabelText('Trade Type'), {
            target: { value: 'accumulators' },
        });
        expect(screen.getByText('Growth Rate')).toBeInTheDocument();
        expect(screen.getByTestId('dtrader-buy-up')).toHaveTextContent(/Buy Accumulator/i);
    });
});
