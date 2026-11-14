import fs from 'fs';
import path from 'path';
import React from 'react';
import { render, screen } from '@testing-library/react';
import FreeBots from '../free-bots';
import PurchaseMixin from '@/external/bot-skeleton/services/tradeEngine/trade/Purchase';
import OpenContractMixin from '@/external/bot-skeleton/services/tradeEngine/trade/OpenContract';
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

describe('Free Bots — Under 5 Over 4 Simultaneous Hedging Bot', () => {
    beforeEach(() => {
        mockApiSend.mockReset();
        messageListeners.length = 0;
    });

    it('lists Under 5 Over 4 in Free Bots without altering existing catalog or layout', () => {
        render(<FreeBots />);
        expect(screen.getByText('Under 5 Over 4')).toBeInTheDocument();
        expect(screen.getByText('Best of 3')).toBeInTheDocument();
    });

    it('provides valid Under 5 Over 4 XML configured for simultaneous DIGITOVER 4 + DIGITUNDER 5', () => {
        const xmlPath = path.resolve(
            process.cwd(),
            'public/xml/special-bots/Under 5 Over 4.xml'
        );
        const xml = fs.readFileSync(xmlPath, 'utf8');
        const parsed = new DOMParser().parseFromString(xml, 'text/xml');
        expect(parsed.querySelector('parsererror')).toBeNull();
        expect(xml).toContain('type="purchase_hedge"');
        expect(xml).toContain('<field name="PURCHASE_LIST_1">DIGITOVER</field>');
        expect(xml).toContain('<field name="PURCHASE_LIST_2">DIGITUNDER</field>');
        expect(xml).toContain('<field name="NUM">4</field>');
        expect(xml).toContain('<field name="NUM">5</field>');
    });

    it('purchases Over 4 and Under 5 simultaneously in parallel and settles both open contracts', async () => {
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

        // Trigger simultaneous hedge purchase: Over 4 + Under 5
        const hedgePromise = engine.purchaseHedge('DIGITOVER', 4, 'DIGITUNDER', 5);

        // Verify BOTH buy requests were sent immediately in parallel without waiting sequentially
        expect(mockApiSend).toHaveBeenCalledTimes(2);
        expect(mockApiSend.mock.calls[0][0]).toMatchObject({
            buy: '1',
            price: 1,
            parameters: {
                contract_type: 'DIGITOVER',
                barrier: 4,
                underlying_symbol: '1HZ100V',
            },
        });
        expect(mockApiSend.mock.calls[1][0]).toMatchObject({
            buy: '1',
            price: 1,
            parameters: {
                contract_type: 'DIGITUNDER',
                barrier: 5,
                underlying_symbol: '1HZ100V',
            },
        });

        resolveBuy1({
            buy: { contract_id: 5001, transaction_id: 7001, buy_price: 1, longcode: 'Over 4' },
        });
        resolveBuy2({
            buy: { contract_id: 5002, transaction_id: 7002, buy_price: 1, longcode: 'Under 5' },
        });

        await hedgePromise;
        expect(engine.expectedHedgeIds.has(5001)).toBe(true);
        expect(engine.expectedHedgeIds.has(5002)).toBe(true);

        const waitAfter = engine.waitForAfter();
        let afterResolved = false;
        waitAfter.then(() => {
            afterResolved = true;
        });

        // Leg 1 (Over 4) settles as a win (+0.96) — cycle must wait for Leg 2!
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

        // Leg 2 (Under 5) settles — now BOTH legs are complete and afterPromise resolves!
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
