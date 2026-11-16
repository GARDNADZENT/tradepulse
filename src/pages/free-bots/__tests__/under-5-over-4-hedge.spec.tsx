import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import FreeBots from '../free-bots';
import PurchaseMixin from '@/external/bot-skeleton/services/tradeEngine/trade/Purchase';
import OpenContractMixin from '@/external/bot-skeleton/services/tradeEngine/trade/OpenContract';
import TicksMixin from '@/external/bot-skeleton/services/tradeEngine/trade/Ticks';
import TicksService from '@/external/bot-skeleton/services/api/ticks_service';
import TradeEngine from '@/external/bot-skeleton/services/tradeEngine/trade';
import { BEFORE_PURCHASE } from '@/external/bot-skeleton/services/tradeEngine/trade/state/constants';

const mockApiSend = jest.fn();
const messageListeners: Array<(msg: any) => void> = [];

jest.mock('@/external/bot-skeleton/services/api/api-base', () => ({
    api_base: {
        account_info: { loginid: 'VRTC99999', currency: 'USD' },
        active_symbols: [],
        api: {
            send: (...args: any[]) => mockApiSend(...args),
            onMessage: () => ({
                subscribe: (cb: (msg: any) => void) => {
                    messageListeners.push(cb);
                    return { unsubscribe: () => {} };
                },
            }),
        },
        pushSubscription: () => {},
    },
}));

jest.mock('@/hooks/useStore', () => ({
    useStore: () => ({
        dashboard: { setActiveTab: jest.fn() },
        load_modal: { loadStrategyToBuilder: jest.fn() },
    }),
}));

jest.mock('@/utils/freebots-cache', () => ({
    fetchXmlWithCache: jest.fn(),
    prefetchAllXmlInBackground: jest.fn(),
}));

describe('Free Bots — Over 5 Under 4 Simultaneous Hedging Bot', () => {
    beforeEach(() => {
        mockApiSend.mockReset();
        messageListeners.length = 0;
    });

    it('lists Over 5 Under 4 in Free Bots without altering existing catalog or layout', () => {
        render(<FreeBots />);
        expect(screen.getByText('Over 5 Under 4')).toBeInTheDocument();
        expect(screen.getByText('Best of 3')).toBeInTheDocument();
    });

    it('provides valid Over 5 Under 4 XML configured for simultaneous DIGITOVER 5 + DIGITUNDER 4', () => {
        const xmlPath = path.resolve(
            process.cwd(),
            'public/xml/special-bots/Over 5 Under 4.xml'
        );
        const xml = fs.readFileSync(xmlPath, 'utf8');
        const parsed = new DOMParser().parseFromString(xml, 'text/xml');
        expect(parsed.querySelector('parsererror')).toBeNull();
        const field = (selector: string, name: string) => parsed.querySelector(`${selector} > field[name="${name}"]`)?.textContent;
        expect(field('#tp_num_over', 'NUM')).toBe('5');
        expect(field('#tp_num_under', 'NUM')).toBe('4');
        expect(field('#tp_fresh_digit', 'DIGIT_1')).toBe('4');
        expect(field('#tp_fresh_digit', 'DIGIT_2')).toBe('5');
        expect(parsed.querySelector('#tp_hedge_before #tp_fresh_entry_check > value[name="IF0"] > #tp_fresh_digit')).not.toBeNull();
        expect(parsed.querySelector('#tp_fresh_entry_check > statement[name="DO0"] > #tp_hedge_purchase_block')).not.toBeNull();
        expect(field('#tp_hedge_purchase_block', 'PURCHASE_LIST_1')).toBe('DIGITOVER');
        expect(field('#tp_hedge_purchase_block', 'PURCHASE_LIST_2')).toBe('DIGITUNDER');
        expect(parsed.querySelector('#tp_hedge_after #tp_hedge_again')).not.toBeNull();
    });

    it('generates a synchronous check of the configured fresh digits', () => {
        const oldBlockly = (window as any).Blockly;
        const generator: any = { forBlock: {}, ORDER_ATOMIC: 0 };
        (window as any).Blockly = { Blocks: {}, JavaScript: { javascriptGenerator: generator } };
        try {
            jest.isolateModules(() => {
                require('@/external/bot-skeleton/scratch/blocks/Binary/Tick Analysis/risk_manager_blocks');
            });
            const block = { getFieldValue: (name: string) => ({ DIGIT_1: '4', DIGIT_2: '5' } as any)[name] };
            expect(generator.forBlock.fresh_cycle_digit(block)).toEqual(['Bot.isFreshCycleDigit(4, 5)', 0]);
        } finally {
            (window as any).Blockly = oldBlockly;
        }
    });

    it('distinguishes historical ticks from new live market updates', () => {
        const service = new TicksService();
        const callback = jest.fn();
        service.tickListeners = service.tickListeners.setIn(['1HZ100V', 'test'], callback);
        service.updateTicksAndCallListeners('1HZ100V', [{ epoch: 10, quote: 100.04 }]);
        expect(callback).toHaveBeenLastCalledWith(expect.any(Array), { isLive: false });
        messageListeners.forEach(cb => cb({ data: { msg_type: 'tick', tick: { symbol: '1HZ100V', epoch: 11, quote: 100.05, id: 'stream' } } }));
        expect(callback).toHaveBeenLastCalledWith(expect.any(Array), { isLive: true });
        expect(callback).toHaveBeenCalledTimes(2);
        messageListeners.forEach(cb => cb({ data: { msg_type: 'tick', tick: { symbol: '1HZ100V', epoch: 11, quote: 100.05, id: 'stream' } } }));
        expect(callback).toHaveBeenCalledTimes(2); // duplicate stream update isn't a fresh tick
    });

    it('requires an observed fresh 4 or 5 after the start of every cycle', async () => {
        let tickCallback!: (ticks: any[], metadata: any) => void;
        class BaseEngine {
            $scope: any = { ticksService: { pipSizes: { '1HZ100V': 2 }, monitor: async ({ callback }: any) => { tickCallback = callback; return 'key'; } } };
            store: any = { state: { scope: 'STOP' }, getState() { return this.state; }, dispatch(action: any) {
                if (typeof action === 'function') return action(this.dispatch.bind(this), this.getState.bind(this));
                if (action.type === 'START') this.state = { scope: BEFORE_PURCHASE };
            } };
            options = { symbol: '1HZ100V' };
            validateTradeOptions(x: any) { return x; }
            checkLimits() {}
            makeDirectPurchaseDecision() {}
            getPipSize() { return 2; }
        }
        const engine: any = new (TicksMixin(BaseEngine as any))();
        // Ensure the real watch callback and real start lifecycle are exercised.
        await engine.watchTicks('1HZ100V');
        const tick = (digit: number, epoch: number) => tickCallback([{ quote: 100 + digit / 100, epoch }], { isLive: true });
        const startCycle = () => TradeEngine.prototype.start.call(engine, { amount: 1 });
        tick(4, 1); // history / a tick before the bot starts
        startCycle();
        expect(engine.isFreshCycleDigit(4, 5)).toBe(false);
        tickCallback([{ quote: 100.05, epoch: 2 }], { isLive: false }); // history isn't a live signal
        expect(engine.isFreshCycleDigit(4, 5)).toBe(false);
        for (const digit of [0, 1, 2, 3, 6, 7, 8, 9]) {
            tick(digit, 10 + digit);
            expect(engine.isFreshCycleDigit(4, 5)).toBe(false);
        }
        tick(4, 30);
        expect(engine.isFreshCycleDigit(4, 5)).toBe(true);
        engine.$scope.ticksService.pipSizes = {};
        expect(engine.isFreshCycleDigit(4, 5)).toBe(false); // don't guess unknown precision
        engine.$scope.ticksService.pipSizes = { '1HZ100V': 2 };
        engine.store.state = { scope: 'DURING_PURCHASE' };
        tick(5, 31); // cannot start another pair while either leg is open
        expect(engine.isFreshCycleDigit(4, 5)).toBe(false);
        engine.store.state = { scope: 'STOP' }; // both legs have settled
        startCycle();
        expect(engine.isFreshCycleDigit(4, 5)).toBe(false);
        tick(5, 32);
        expect(engine.isFreshCycleDigit(4, 5)).toBe(true);
        startCycle(); // a repeated 5 must itself be a new tick
        expect(engine.isFreshCycleDigit(4, 5)).toBe(false);
        tick(5, 33);
        expect(engine.isFreshCycleDigit(4, 5)).toBe(true);
    });

    it('purchases Over 5 and Under 4 simultaneously in parallel and settles both open contracts', async () => {
        class BaseEngine {
            data: any = { contract: {}, proposals: [] };
            vh_state: any = { enabled: false, is_virtual: false, needs_stake_reset: false };
            tradeOptions: any = {
                amount: 1,
                basis: 'stake',
                currency: 'USD',
                duration: 1,
                duration_unit: 't',
                symbol: '1HZ100V',
            };
            options: any = { timeMachineEnabled: false };
            accountInfo: any = { loginid: 'VRTC99999' };
            is_proposal_subscription_required = false;
            contractId: any = '';
            isSold = false;
            afterPromise: any = null;
            settledTotals: any[] = [];
            dispatchedActions: any[] = [];
            store = {
                getState: () => ({ scope: BEFORE_PURCHASE }),
                dispatch: (act: any) => this.dispatchedActions.push(act),
            };
            setInterpreterVariable() {}
            updateAndReturnTotalRuns() {
                return 1;
            }
            updateTotals(contract: any) {
                this.settledTotals.push(contract);
            }
        }

        const HedgeEngine = OpenContractMixin(PurchaseMixin(BaseEngine as any));
        const engine: any = new HedgeEngine();
        engine.observeOpenContract();

        let resolveBuy1!: (v: any) => void;
        let resolveBuy2!: (v: any) => void;

        mockApiSend
            .mockImplementationOnce(
                () =>
                    new Promise(res => {
                        resolveBuy1 = res;
                    })
            )
            .mockImplementationOnce(
                () =>
                    new Promise(res => {
                        resolveBuy2 = res;
                    })
            );

        // Trigger simultaneous hedge purchase: Over 5 + Under 4
        const hedgePromise = engine.purchaseHedge('DIGITOVER', 5, 'DIGITUNDER', 4);

        // Verify BOTH buy requests were sent immediately in parallel without waiting sequentially
        expect(mockApiSend).toHaveBeenCalledTimes(2);
        expect(mockApiSend.mock.calls[0][0]).toMatchObject({
            buy: '1',
            price: 1,
            parameters: {
                contract_type: 'DIGITOVER',
                barrier: 5,
                underlying_symbol: '1HZ100V',
            },
        });
        expect(mockApiSend.mock.calls[1][0]).toMatchObject({
            buy: '1',
            price: 1,
            parameters: {
                contract_type: 'DIGITUNDER',
                barrier: 4,
                underlying_symbol: '1HZ100V',
            },
        });

        resolveBuy1({
            buy: { contract_id: 5001, transaction_id: 7001, buy_price: 1, longcode: 'Over 5' },
        });
        resolveBuy2({
            buy: { contract_id: 5002, transaction_id: 7002, buy_price: 1, longcode: 'Under 4' },
        });

        await hedgePromise;
        expect(engine.expectedHedgeIds.has(5001)).toBe(true);
        expect(engine.expectedHedgeIds.has(5002)).toBe(true);

        const waitAfter = engine.waitForAfter();
        let afterResolved = false;
        waitAfter.then(() => {
            afterResolved = true;
        });

        // Leg 1 (Over 5) settles as a win (+0.96) — cycle must wait for Leg 2!
        messageListeners.forEach(cb =>
            cb({
                data: {
                    msg_type: 'proposal_open_contract',
                    proposal_open_contract: {
                        contract_id: 5001,
                        is_sold: 1,
                        buy_price: 1,
                        sell_price: 1.96,
                        currency: 'USD',
                        transaction_ids: { buy: 7001, sell: 8001 },
                    },
                },
            })
        );
        await Promise.resolve();
        expect(afterResolved).toBe(false);
        expect(engine.settledTotals).toHaveLength(1);

        // Leg 2 (Under 4) settles — now BOTH legs are complete and afterPromise resolves!
        messageListeners.forEach(cb =>
            cb({
                data: {
                    msg_type: 'proposal_open_contract',
                    proposal_open_contract: {
                        contract_id: 5002,
                        is_sold: 1,
                        buy_price: 1,
                        sell_price: 0,
                        currency: 'USD',
                        transaction_ids: { buy: 7002, sell: 8002 },
                    },
                },
            })
        );
        await waitAfter;

        expect(afterResolved).toBe(true);
        expect(engine.settledTotals).toHaveLength(2);
        expect(engine.data.contract).toMatchObject({
            buy_price: 2,
            sell_price: 1.96,
            profit: -0.04,
        });
    });
});
