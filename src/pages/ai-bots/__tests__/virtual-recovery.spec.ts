import { advanceVirtualRecovery, VirtualRecoveryTrade } from '../virtual-recovery';

const trade: VirtualRecoveryTrade = {
    symbol: 'R_10', marketLabel: 'Volatility 10 Index', contractType: 'DIGITEVEN',
    pipSize: 2, ticksRemaining: 2, lastTickTime: 1000, entrySpot: 100, currency: 'USD',
};

describe('virtual recovery settlement', () => {
    it('uses only newer ticks from the chosen market and the configured duration', () => {
        expect(advanceVirtualRecovery(trade, 'R_25', { t: 2000, price: 100.02 }).trade).toEqual(trade);
        expect(advanceVirtualRecovery(trade, 'R_10', { t: 1000, price: 100.02 }).trade).toEqual(trade);
        expect(advanceVirtualRecovery(trade, 'R_10', { t: 2000, price: NaN }).trade).toEqual(trade);
        const first = advanceVirtualRecovery(trade, 'R_10', { t: 2000, price: 100.01 });
        expect(first.outcome).toBeNull();
        expect(first.trade.ticksRemaining).toBe(1);
        const settled = advanceVirtualRecovery(first.trade, 'R_10', { t: 3000, price: 100.02 });
        expect(settled).toMatchObject({ outcome: 'won', digit: 2 });
    });

    it('evaluates Even and Odd from the symbol precision including trailing zeros', () => {
        const oneTick = { ...trade, ticksRemaining: 1 };
        expect(advanceVirtualRecovery(oneTick, 'R_10', { t: 2000, price: 123.4 }).outcome).toBe('won');
        expect(advanceVirtualRecovery(oneTick, 'R_10', { t: 2000, price: 123.41 }).outcome).toBe('lost');
        expect(advanceVirtualRecovery({ ...oneTick, contractType: 'DIGITODD' }, 'R_10', { t: 2000, price: 123.41 }).outcome).toBe('won');
    });
});
