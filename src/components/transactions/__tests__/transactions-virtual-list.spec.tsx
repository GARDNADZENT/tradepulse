import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { observable } from 'mobx';
import TransactionsStore from '@/stores/transactions-store';
import Transactions from '../transactions';

let mockTransactions: TransactionsStore;
jest.mock('@/hooks/useStore', () => ({ useStore: () => ({
    run_panel: { contract_stage: 0 }, transactions: mockTransactions,
}) }));
jest.mock('@deriv-com/ui', () => ({ useDevice: () => ({ isDesktop: true }) }));
jest.mock('@/components/download', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/shared_ui/data-list', () => ({ __esModule: true, default: ({ data_source, rowRenderer, keyMapper, getRowSize }: any) => (
    <div>{data_source.map((row: any, index: number) => <div key={keyMapper(row)} data-height={getRowSize({ index })}>{rowRenderer({ row })}</div>)}</div>
) }));
jest.mock('../transaction', () => ({ __esModule: true, default: () => <div>Real transaction</div> }));
jest.mock('@/components/market/market-icon', () => ({ MarketIcon: () => <span>Market</span> }));
jest.mock('@/components/trade-type/trade-type-icon', () => ({ TradeTypeIcon: () => <span>Even</span> }));

describe('Transactions panel virtual rows', () => {
    it('updates the shared list as simulated results arrive and keeps View Detail for real contracts', () => {
        sessionStorage.clear();
        const client = observable({ loginid: 'VRTC_LIST' });
        mockTransactions = new TransactionsStore({ run_panel: { run_id: 'run-1' } } as any, { client } as any);
        render(<Transactions is_drawer_open />);
        expect(screen.getByText('There are no transactions to display')).toBeInTheDocument();
        act(() => mockTransactions.pushVirtualTransaction({
            display_name: 'Volatility 10 Index', underlying_symbol: 'R_10', contract_type: 'DIGITEVEN',
            entry_spot: '1357.82', exit_spot: '1357.83', currency: 'USD', outcome: 'lost',
        }, client.loginid));
        expect(screen.getByTestId('virtual-transaction')).toHaveTextContent('1357.82');
        expect(screen.getByTestId('virtual-transaction')).toHaveTextContent('1357.83');
        expect(screen.getByTestId('virtual-transaction')).toHaveTextContent('Virtual Loss');
        expect(screen.getByRole('button', { name: 'View Detail' })).toBeDisabled();
        expect(mockTransactions.statistics.number_of_runs).toBe(0);
        act(() => mockTransactions.pushTransaction({ contract_id: 12, transaction_ids: { buy: 12 },
            date_start: 1000, buy_price: 1, profit: 0.5, is_completed: true } as any));
        expect(screen.getByText('Real transaction')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'View Detail' })).toBeEnabled();
        expect(mockTransactions.statistics.number_of_runs).toBe(1);
        mockTransactions.disposeReactionsFn();
    });
});
