import PurchaseMixin from '@/external/bot-skeleton/services/tradeEngine/trade/Purchase';
import getBotInterface from '@/external/bot-skeleton/services/tradeEngine/Interface/BotInterface';
import { observer } from '@/external/bot-skeleton/utils/observer';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';

const mockSend = jest.fn();
const mockListeners: Array<(message: any) => void> = [];
jest.mock('@/external/bot-skeleton/services/api/api-base', () => ({ api_base: {
    account_info: { loginid: 'VRTC_TEST_AI', currency: 'USD' }, active_symbols: [],
    api: { sent_requests: [{ ticks: '1HZ10V' }], send: (...args: any[]) => mockSend(...args), onMessage: () => ({ subscribe: (cb: any) => { mockListeners.push(cb); return { unsubscribe: jest.fn() }; } }) },
    pushSubscription: jest.fn(),
} }));

class BaseEngine {
    $scope: any = { ticksService: { pipSizes: { '1HZ10V': 2 } } };
    vh_state: any = { enabled: false, is_virtual: false, threshold: 0, loss_count: 0, virtual_win_count: 0, real_loss_count: 0, initial_stake: 0, current_stake: 0, needs_stake_reset: false };
    tradeOptions: any = { symbol: '1HZ10V', duration: 1, duration_unit: 't', amount: 2, currency: 'USD', prediction: 2 };
    store: any = { dispatch: jest.fn() };
    getPipSize() { return 2; }
}
const createEngine = () => {
    const engine: any = new (PurchaseMixin(BaseEngine as any))();
    getBotInterface(engine).setVirtualHook({ enabled: true, startMode: 'virtual', aiEitherMode: true, virtualLosses: 2, virtualWins: 1 });
    return engine;
};

describe('AI Developer virtual hook', () => {
    beforeEach(() => { jest.useFakeTimers(); mockSend.mockReset(); mockListeners.length = 0; });
    afterEach(() => { jest.runOnlyPendingTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });
    const runVirtual = async (engine: any, digit: number, epoch: number) => {
        const promise = engine.purchase('DIGITOVER', 2);
        engine.processVirtualTick({ symbol: '1HZ10V', quote: 100 + digit / 100, epoch });
        await jest.runOnlyPendingTimersAsync();
        await promise;
    };
    it('starts virtual; two virtual losses or one virtual win permit real trading, never resetting real stake', async () => {
        const emit = jest.spyOn(observer, 'emit');
        const engine = createEngine();
        const reset = jest.spyOn(engine, 'resetStakeVariableForRealTrading');
        await runVirtual(engine, 1, 1);
        expect(engine.vh_state.is_virtual).toBe(true);
        expect(engine.vh_state.loss_count).toBe(1);
        await runVirtual(engine, 2, 2);
        expect(engine.vh_state.is_virtual).toBe(false);
        expect(engine.vh_state.needs_stake_reset).toBe(false);
        expect(mockSend).not.toHaveBeenCalled();
        expect(reset).not.toHaveBeenCalled();
        const virtualRows = emit.mock.calls.filter((call: any[]) => call[0] === 'bot.ai_virtual_contract');
        expect(virtualRows).toHaveLength(2);
        expect(virtualRows[0][1]).toMatchObject({ accountKey: 'VRTC_TEST_AI', outcome: 'lost', contract_type: 'DIGITOVER', entry_spot: '100.01', exit_spot: '100.01' });
        expect(virtualRows[0][1]).not.toHaveProperty('profit');
        expect(emit.mock.calls.filter((call: any[]) => call[0] === 'bot.contract')).toHaveLength(0);
        engine.tradeOptions.amount = 4.2; // after-purchase XML raises the losing real stake
        engine.onRealContractSettled({ profit: -2 });
        expect(engine.vh_state.is_virtual).toBe(true);
        await runVirtual(engine, 8, 3); // virtual win immediately returns to real
        expect(engine.vh_state.is_virtual).toBe(false);
        expect(engine.tradeOptions.amount).toBe(4.2);
        expect(reset).not.toHaveBeenCalled();
        engine.onRealContractSettled({ profit: 1 });
        expect(engine.vh_state.is_virtual).toBe(false); // real win stays real
    });
    it('ignores late ticks after stop and prevents a virtual trade crossing accounts', async () => {
        const engine = createEngine();
        const emit = jest.spyOn(observer, 'emit');
        const pending = engine.purchase('DIGITOVER', 2);
        engine.$scope.stopped = true;
        engine.processVirtualTick({ symbol: '1HZ10V', quote: 100.04, epoch: 1 });
        expect(engine.vh_state.is_virtual).toBe(true);
        expect(emit.mock.calls.filter((call: any[]) => call[0] === 'bot.ai_virtual_contract')).toHaveLength(0);
        engine.$scope.stopped = false;
        (api_base.account_info as any).loginid = 'VRTC_OTHER';
        engine.processVirtualTick({ symbol: '1HZ10V', quote: 100.04, epoch: 2 });
        expect(emit).toHaveBeenCalledWith('bot.stop_button_click');
        expect(engine.vh_state.virtual_trade_active).toBe(false);
        expect(mockSend).not.toHaveBeenCalled();
        (api_base.account_info as any).loginid = 'VRTC_TEST_AI';
        // The stopped interpreter will no longer await the canceled virtual promise.
        void pending;
    });
    it('rotates markets after each purchase cycle and honours the every-N setting', async () => {
        const emit = jest.spyOn(observer, 'emit');
        const engine = createEngine();
        engine.tradeOptions.symbol = '1HZ10V';
        engine.setMarketRotation({ enabled: true, everyTrades: 1, markets: ['1HZ10V', 'R_10', '1HZ25V'] });
        expect(engine.market_rotation).toEqual({ everyTrades: 1, markets: ['1HZ10V', 'R_10', '1HZ25V'] });
        expect(emit).toHaveBeenCalledWith('ui.log.success', expect.objectContaining({ log_type: 'market_rotation' }));

        const seen: string[] = [];
        for (let cycle = 0; cycle < 4; cycle++) {
            engine.applyMarketRotation();
            seen.push(engine.tradeOptions.symbol);
        }
        expect(seen).toEqual(['1HZ10V', 'R_10', '1HZ25V', '1HZ10V']);

        engine._rotationTradeIndex = 0;
        engine.setMarketRotation({ enabled: true, everyTrades: 2, markets: ['1HZ10V', 'R_10'] });
        const everyTwo: string[] = [];
        for (let cycle = 0; cycle < 4; cycle++) {
            engine.applyMarketRotation();
            everyTwo.push(engine.tradeOptions.symbol);
        }
        expect(everyTwo).toEqual(['1HZ10V', '1HZ10V', 'R_10', 'R_10']);

        engine.setMarketRotation({ enabled: false });
        expect(engine.market_rotation).toBeNull();
        const frozen = engine.tradeOptions.symbol;
        engine.applyMarketRotation();
        expect(engine.tradeOptions.symbol).toBe(frozen);
    });

    it('rejects rotation lists that cannot cycle and ignores malformed symbols', () => {
        const engine = createEngine();
        engine.setMarketRotation({ enabled: true, everyTrades: 1, markets: ['R_10'] });
        expect(engine.market_rotation).toBeNull();
        engine.setMarketRotation({ enabled: true, everyTrades: 1, markets: ['R_10', 'bad symbol', 'R_25'] });
        expect(engine.market_rotation?.markets).toEqual(['R_10', 'R_25']);
    });

    it('fails closed if market precision is missing', async () => {
        const engine = createEngine();
        engine.$scope.ticksService.pipSizes = {};
        await expect(engine.purchase('DIGITOVER', 2)).rejects.toThrow(/precision/);
        expect(mockSend).not.toHaveBeenCalled();
    });

    const runVirtualHedge = async (engine: any, legs: [string, number, string, number], quotes: Array<[number, number]>) => {
        const promise = engine.purchaseHedge(legs[0], legs[1], legs[2], legs[3]);
        quotes.forEach(([quote, epoch]) => engine.processVirtualTick({ symbol: '1HZ10V', quote, epoch }));
        await jest.runOnlyPendingTimersAsync();
        await promise;
    };

    it('simulates both hedge legs on the same ticks and counts one combined outcome', async () => {
        const emit = jest.spyOn(observer, 'emit');
        const engine = createEngine();
        engine.tradeOptions.duration = 3; // 3-tick Rise + Fall, 0.35 per leg would be scaled by stake below
        await runVirtualHedge(engine, ['CALL', 0, 'PUT', 0], [[100, 1], [100.05, 2], [100.02, 3], [100.1, 4]]);
        const rows = emit.mock.calls.filter((call: any[]) => call[0] === 'bot.ai_virtual_contract');
        // One row for the pair, never one per leg: the cycle is a single combined result.
        expect(rows).toHaveLength(1);
        expect(rows[0][1]).toMatchObject({ outcome: 'lost', contract_type: 'CALL+PUT', entry_spot: '100.00', exit_spot: '100.10' });
        expect(engine.vh_state.loss_count).toBe(1);
        expect(engine.vh_state.is_virtual).toBe(true);
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('loses both legs when the exit price is unchanged and switches to real after two combined losses', async () => {
        const emit = jest.spyOn(observer, 'emit');
        const engine = createEngine();
        engine.tradeOptions.duration = 3;
        await runVirtualHedge(engine, ['CALL', 0, 'PUT', 0], [[100, 1], [100, 2], [100, 3], [100, 4]]);
        const first = emit.mock.calls.filter((call: any[]) => call[0] === 'bot.ai_virtual_contract');
        expect(first).toHaveLength(1);
        expect(first[0][1].outcome).toBe('lost');
        expect(engine.vh_state.loss_count).toBe(1);
        await runVirtualHedge(engine, ['CALL', 0, 'PUT', 0], [[100, 5], [99.9, 6], [99.8, 7], [99.7, 8]]);
        expect(engine.vh_state.loss_count).toBe(0);
        expect(engine.vh_state.is_virtual).toBe(false); // two combined losses hand control to real trading
        expect(mockSend).not.toHaveBeenCalled();
    });

    it('simulates a one-tick digit pair as one cycle', async () => {
        const emit = jest.spyOn(observer, 'emit');
        const engine = createEngine();
        await runVirtualHedge(engine, ['DIGITOVER', 2, 'DIGITUNDER', 7], [[100.09, 1]]);
        const rows = emit.mock.calls.filter((call: any[]) => call[0] === 'bot.ai_virtual_contract');
        expect(rows).toHaveLength(1);
        expect(rows[0][1]).toMatchObject({ outcome: 'lost', contract_type: 'DIGITOVER+DIGITUNDER' });
        expect(engine.vh_state.loss_count).toBe(1);
    });
});
