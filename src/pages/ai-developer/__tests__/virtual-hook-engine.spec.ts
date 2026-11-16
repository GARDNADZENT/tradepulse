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
    it('rejects paired virtual hooks and fails closed if market precision is missing', async () => {
        const engine = createEngine();
        await expect(engine.purchaseHedge('DIGITOVER', 2, 'DIGITUNDER', 5)).rejects.toThrow(/paired/);
        engine.$scope.ticksService.pipSizes = {};
        await expect(engine.purchase('DIGITOVER', 2)).rejects.toThrow(/precision/);
        expect(mockSend).not.toHaveBeenCalled();
    });
});
