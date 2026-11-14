import React from 'react';
import { render, screen } from '@testing-library/react';
import { observable, runInAction } from 'mobx';
import { transaction_elements } from '@/constants/transactions';
import TransactionsStore from '@/stores/transactions-store';
import VirtualTransaction from '../virtual-transaction';

jest.mock('@/components/market/market-icon', () => ({ MarketIcon: () => <span>Market</span> }));
jest.mock('@/components/trade-type/trade-type-icon', () => ({ TradeTypeIcon: () => <span>Odd</span> }));

const virtual = {
    display_name: 'Volatility 10 Index', underlying_symbol: 'R_10', contract_type: 'DIGITODD' as const,
    entry_spot: '1357.80', exit_spot: '1357.81', currency: 'USD', outcome: 'won' as const,
};

describe('virtual transactions', () => {
    beforeEach(() => sessionStorage.clear());

    it('records simulations without changing real statistics, and isolates, restores and clears them by account', () => {
        const client = observable({ loginid: 'VIRTUAL_TEST_A' });
        const root: any = { run_panel: { run_id: 'run-1' } };
        const store = new TransactionsStore(root, { client } as any);
        const expectedZero = {
            number_of_runs: 0, won_contracts: 0, lost_contracts: 0,
            total_profit: 0, total_stake: 0, total_payout: 0,
        };
        expect(store.statistics).toEqual(expectedZero);
        store.pushVirtualTransaction(virtual, client.loginid);
        store.pushVirtualTransaction({ ...virtual, outcome: 'lost', exit_spot: '1357.82' }, client.loginid);
        expect(store.transactions).toHaveLength(2);
        expect(store.transactions[0]).toMatchObject({ type: transaction_elements.VIRTUAL_CONTRACT, data: {
            is_virtual: true, outcome: 'lost', buy_price: 0, profit: 0, entry_spot: '1357.80', exit_spot: '1357.82',
        } });
        expect((store.transactions[0].data as any).virtual_id).not.toEqual((store.transactions[1].data as any).virtual_id);
        expect(store.statistics).toEqual(expectedZero);
        expect((store.transactions[0].data as any).contract_id).toBeUndefined();
        store.recoverPendingContracts();
        expect(store.recovered_transactions).toHaveLength(0);

        // A real loss contributes exactly once; virtual rows do not change the counts or P/L.
        store.pushTransaction({ contract_id: 123, transaction_ids: { buy: 123 }, date_start: 1000,
            entry_spot: 1357.8, buy_price: 0.5, profit: -0.5, currency: 'USD', is_completed: true } as any);
        expect(store.statistics).toMatchObject({ number_of_runs: 1, won_contracts: 0, lost_contracts: 1,
            total_stake: 0.5, total_profit: -0.5 });
        store.disposeReactionsFn();

        const restored = new TransactionsStore(root, { client } as any);
        expect(restored.transactions).toHaveLength(3);
        expect(restored.statistics.number_of_runs).toBe(1);
        runInAction(() => { client.loginid = 'VIRTUAL_TEST_B'; });
        expect(restored.transactions).toHaveLength(0);
        restored.pushVirtualTransaction(virtual, 'VIRTUAL_TEST_A');
        expect(restored.transactions).toHaveLength(0);
        restored.pushVirtualTransaction(virtual, client.loginid);
        expect(restored.transactions).toHaveLength(1);
        restored.clear();
        expect(restored.transactions).toHaveLength(0);
        runInAction(() => { client.loginid = 'VIRTUAL_TEST_A'; });
        expect(restored.transactions).toHaveLength(3);
        restored.disposeReactionsFn();
    });

    it.each(['won', 'lost'] as const)('shows %s as a clearly marked zero-cost virtual result', outcome => {
        render(<VirtualTransaction trade={{ ...virtual, outcome, virtual_id: 'v1', is_virtual: true,
            run_id: 'run-1', buy_price: 0, profit: 0 }} />);
        const row = screen.getByTestId('virtual-transaction');
        expect(row).toHaveTextContent('1357.80');
        expect(row).toHaveTextContent('1357.81');
        expect(row).toHaveTextContent('0.00 USD');
        expect(row).toHaveTextContent(outcome === 'won' ? 'Virtual Win' : 'Virtual Loss');
        expect(row).not.toHaveTextContent('NaN');
    });
});
