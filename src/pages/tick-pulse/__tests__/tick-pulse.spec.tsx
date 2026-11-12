import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { executeLiveDerivTrade, normalizeDerivContractParams } from '@/utils/ai-bot-xml-builder';
import TickPulse from '../tick-pulse';
import {
    checkTickPulseEntryCondition,
    clampPredictionForContract,
    computeNextTickPulseStake,
    createInitialRecoveryState,
    estimateNetProfitRatio,
    rankTickPulseMarkets,
    resolveTickPulseOrderSpec,
    selectBestReadyTickPulseMarket,
    settleTickPulseRecoveryState,
    TICKPULSE_CONTRACTS,
    TICKPULSE_MARKETS,
} from '../tick-pulse-engine';

const mockExecuteLiveDerivTrade = jest.fn();

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
        run_panel: {},
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

const mockSubscribedLists: string[][] = [];
let tickListeners: Array<(ev: any) => void> = [];

jest.mock('@/lib/deriv/tick-bus', () => {
    return {
        derivBus: {
            getTicks: (sym: string) => {
                if (sym === '1HZ75V') {
                    // Last digit 9 (odd, > 2) -> 100% Over 2, 0% Even
                    return Array.from({ length: 40 }, (_, i) => ({
                        t: 1700000000000 + i * 1000,
                        price: 250.09,
                    }));
                }
                if (sym === '1HZ10V') {
                    // Last digit 2 (even, <= 2) -> 0% Over 2, 100% Even!
                    return Array.from({ length: 40 }, (_, i) => ({
                        t: 1700000000500 + i * 1000,
                        price: 120.02,
                    }));
                }
                return Array.from({ length: 40 }, (_, i) => ({
                    t: 1700000000200 + i * 1000,
                    price: 100 + ((i * 7 + 1) % 10) / 100,
                }));
            },
            getPipSize: () => 2,
            onHistory: () => () => {},
            onTick: (fn: (ev: any) => void) => {
                tickListeners.push(fn);
                return () => {
                    tickListeners = tickListeners.filter(x => x !== fn);
                };
            },
            subscribe: (symbols: string[]) => {
                mockSubscribedLists.push(symbols);
                return () => {};
            },
        },
    };
});

describe('TickPulse Engine, Live 13-Market Radar & Auto-Best-Market Trading', () => {
    beforeEach(() => {
        window.localStorage.clear();
        mockExecuteLiveDerivTrade.mockReset();
        mockSubscribedLists.length = 0;
        tickListeners = [];
    });

    it('defines all 10 TickPulse contracts and all 13 Volatility markets', () => {
        expect(TICKPULSE_CONTRACTS.map(c => c.label)).toEqual([
            'Over',
            'Under',
            'Even',
            'Odd',
            'Rise',
            'Fall',
            'Reset Call',
            'Reset Put',
            'Only Ups',
            'Only Downs',
        ]);
        expect(TICKPULSE_MARKETS).toHaveLength(13);
        expect(executeLiveDerivTrade).toBeDefined();
    });

    it('normalizes special TickPulse contracts (RESETCALL, RESETPUT, RUNHIGH, RUNLOW) safely for Deriv WS', () => {
        const resetCall = resolveTickPulseOrderSpec('RESET_CALL', 4, 1);
        expect(resetCall).toEqual({
            apiContractType: 'RESETCALL',
            duration: 5,
            displayLabel: 'Reset Call',
        });
        expect(normalizeDerivContractParams({ contractType: 'RESETCALL', duration: 1 })).toEqual({
            apiContractType: 'RESETCALL',
            duration: 5,
            durationUnit: 't',
        });

        const onlyUps = resolveTickPulseOrderSpec('ONLY_UPS', 4, 1);
        expect(onlyUps).toEqual({
            apiContractType: 'RUNHIGH',
            duration: 2,
            displayLabel: 'Only Ups',
        });
        expect(normalizeDerivContractParams({ contractType: 'RUNLOW', duration: 1 })).toEqual({
            apiContractType: 'RUNLOW',
            duration: 2,
            durationUnit: 't',
        });

        expect(clampPredictionForContract('OVER', 9)).toBe(8);
        expect(clampPredictionForContract('UNDER', 0)).toBe(1);
    });

    it('calculates Split-2 recovery stakes and resets back to Before loss after 2 recovery wins', () => {
        const evenRatio = estimateNetProfitRatio('EVEN', 4);
        let state = createInitialRecoveryState(2);

        expect(
            computeNextTickPulseStake({
                initialStake: 1,
                recoveryState: state,
                afterNetProfitRatio: evenRatio,
            })
        ).toBe(1);

        state = settleTickPulseRecoveryState({
            prev: state,
            profit: -1,
            configuredSplits: 2,
        });
        expect(state.inRecovery).toBe(true);
        expect(state.unrecoveredLoss).toBe(1);
        expect(state.remainingSplits).toBe(2);

        const split1Stake = computeNextTickPulseStake({
            initialStake: 1,
            recoveryState: state,
            afterNetProfitRatio: evenRatio,
        });
        expect(split1Stake).toBe(0.53);

        state = settleTickPulseRecoveryState({
            prev: state,
            profit: 0.51,
            configuredSplits: 2,
        });
        expect(state.inRecovery).toBe(true);
        expect(state.unrecoveredLoss).toBe(0.49);
        expect(state.remainingSplits).toBe(1);

        const split2Stake = computeNextTickPulseStake({
            initialStake: 1,
            recoveryState: state,
            afterNetProfitRatio: evenRatio,
        });
        expect(split2Stake).toBe(0.51);

        state = settleTickPulseRecoveryState({
            prev: state,
            profit: 0.49,
            configuredSplits: 2,
        });
        expect(state.inRecovery).toBe(false);
        expect(state.unrecoveredLoss).toBe(0);
        expect(state.remainingSplits).toBe(2);
    });

    it('ranks all 13 markets and selects the #1 ready market dynamically per contract', () => {
        const rankedOver = rankTickPulseMarkets({
            getTicks: s =>
                s === '1HZ75V'
                    ? Array.from({ length: 40 }, (_, i) => ({ t: i * 1000, price: 250.09 }))
                    : Array.from({ length: 40 }, (_, i) => ({ t: i * 1000, price: 100.02 })),
            getPipSize: () => 2,
            contractKey: 'OVER',
            prediction: 2,
        });

        expect(rankedOver[0].symbol).toBe('1HZ75V');
        expect(rankedOver[0].hitRatePct).toBe(100);

        const chosenEven = selectBestReadyTickPulseMarket({
            getTicks: s =>
                s === '1HZ10V'
                    ? Array.from({ length: 40 }, (_, i) => ({ t: 1000 + i * 1000, price: 120.02 }))
                    : Array.from({ length: 40 }, (_, i) => ({ t: 1000 + i * 1000, price: 250.09 })),
            getPipSize: () => 2,
            contractKey: 'EVEN',
            prediction: 4,
            condition: 'NONE',
        });

        expect(chosenEven?.ranking.symbol).toBe('1HZ10V');
        expect(chosenEven?.ranking.hitRatePct).toBe(100);

        const opposite2Ticks = [
            { t: 1, price: 100.08 },
            { t: 2, price: 100.07 },
            { t: 3, price: 100.01 },
            { t: 4, price: 100.02 },
        ];
        expect(
            checkTickPulseEntryCondition({
                condition: 'OPPOSITE_2',
                contractKey: 'OVER',
                prediction: 2,
                rawTicks: opposite2Ticks,
                pipSize: 2,
            })
        ).toBe(true);
    });

    it('subscribes to all 13 markets, renders the Live 13-Market Radar, and auto-switches to the #1 market per trade', async () => {
        const tradeCallbacks: Array<(poc: any, isTerminal: boolean) => void> = [];
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            tradeCallbacks.push(params.onContractUpdate);
            return {
                contractId: 9000 + tradeCallbacks.length,
                buyPrice: params.stake,
                longcode: `${params.contractType} on ${params.symbol}`,
            };
        });

        render(<TickPulse />);

        // Verifies simultaneous subscription to all 13 Volatility symbols
        expect(mockSubscribedLists[0]).toHaveLength(13);
        expect(screen.getByTestId('tickpulse-live-radar')).toBeInTheDocument();
        expect(screen.getByText('★ BEST TARGET')).toBeInTheDocument();
        expect(screen.getByTestId('tickpulse-markets-ticks')).toHaveTextContent('13 / 40');

        // Start Auto-Trading Best Market (Default: Before = Over 2, After = Even)
        await act(async () => {
            fireEvent.click(screen.getByTestId('tickpulse-load-and-run'));
        });

        // Trade 1 automatically picks #1 Over-2 market: 1HZ75V
        await waitFor(() => {
            expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        });
        expect(mockExecuteLiveDerivTrade.mock.calls[0][0]).toMatchObject({
            symbol: '1HZ75V',
            contractType: 'DIGITOVER',
            barrier: 2,
            stake: 1,
        });

        // Settle Trade 1 as a -$1.00 loss -> TickPulse enters After-loss Split 1/2 (Even)
        // and dynamically switches to #1 Even market: 1HZ10V!
        await act(async () => {
            tradeCallbacks[0](
                {
                    contract_id: 9001,
                    profit: -1,
                    buy_price: 1,
                    currency: 'USD',
                },
                true
            );
            await new Promise(r => setTimeout(r, 220));
        });

        await waitFor(() => {
            expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(2);
        });
        expect(mockExecuteLiveDerivTrade.mock.calls[1][0]).toMatchObject({
            symbol: '1HZ10V',
            contractType: 'DIGITEVEN',
            stake: 0.53,
        });

        // Ensure zero external brand leakage
        expect(document.body.innerHTML).not.toMatch(/Risk Managers|Makoti|Duke/i);
    });
});
