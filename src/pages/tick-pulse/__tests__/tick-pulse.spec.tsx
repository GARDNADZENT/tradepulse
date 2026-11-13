import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { executeLiveDerivTrade, normalizeDerivContractParams } from '@/utils/ai-bot-xml-builder';
import TickPulse from '../tick-pulse';
import {
    checkTickPulseEntryCondition,
    clampPredictionForContract,
    computeNextTickPulseStake,
    createInitialRecoveryState,
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

describe('TickPulse Engine, User Martingale & Zero Pre-Run KPIs', () => {
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

    it('calculates user-chosen Martingale stakes on consecutive losses and resets to initial stake on win', () => {
        let state = createInitialRecoveryState();

        expect(
            computeNextTickPulseStake({
                initialStake: 1,
                martingaleMultiplier: 2.5,
                recoveryState: state,
            })
        ).toBe(1);

        // Loss #1 (-$1.00) -> enters After loss, next stake = 1.00 * 2.5 = 2.50
        state = settleTickPulseRecoveryState({
            prev: state,
            profit: -1,
            stake: 1,
        });
        expect(state.inRecovery).toBe(true);
        expect(state.consecutiveLosses).toBe(1);
        expect(
            computeNextTickPulseStake({
                initialStake: 1,
                martingaleMultiplier: 2.5,
                recoveryState: state,
            })
        ).toBe(2.5);

        // Loss #2 (-$2.50) -> consecutive loss #2, next stake = 2.50 * 2.5 = 6.25
        state = settleTickPulseRecoveryState({
            prev: state,
            profit: -2.5,
            stake: 2.5,
        });
        expect(state.inRecovery).toBe(true);
        expect(state.consecutiveLosses).toBe(2);
        expect(
            computeNextTickPulseStake({
                initialStake: 1,
                martingaleMultiplier: 2.5,
                recoveryState: state,
            })
        ).toBe(6.25);

        // Win (+$5.90) -> resets cleanly back to Before loss and Initial Stake ($1.00)
        state = settleTickPulseRecoveryState({
            prev: state,
            profit: 5.9,
            stake: 6.25,
        });
        expect(state.inRecovery).toBe(false);
        expect(state.consecutiveLosses).toBe(0);
        expect(
            computeNextTickPulseStake({
                initialStake: 1,
                martingaleMultiplier: 2.5,
                recoveryState: state,
            })
        ).toBe(1);
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

    it('starts strictly at zero KPIs before any run, removes Recovery Splits for user Martingale, and updates exact stats during run', async () => {
        // Seed legacy history in localStorage to prove stale 100/100 / 66% never leaks into pre-run UI
        window.localStorage.setItem(
            'tp_tickpulse_history_v1',
            JSON.stringify([
                {
                    contractId: 111,
                    timestamp: Date.now(),
                    symbol: '1HZ75V',
                    marketLabel: 'Volatility 75 (1s) Index',
                    phaseLabel: 'Before loss',
                    isRecovery: false,
                    contractLabel: 'Over 2',
                    stake: 1,
                    profit: 0.4,
                    currency: 'USD',
                    status: 'won',
                },
            ])
        );

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

        // 1. Recovery Splits removed; user-editable Martingale input present
        expect(screen.queryByText(/Split-1/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Recovery Splits/i)).not.toBeInTheDocument();
        const martingaleInput = screen.getByTestId('tickpulse-martingale') as HTMLInputElement;
        expect(martingaleInput.value).toBe('2.0');

        // 2. Before any run executes, all KPI cards MUST be strictly zero (0.00 USD, 0 / 0, 0%, 0 / 0)
        expect(screen.getByTestId('tickpulse-session-pl')).toHaveTextContent('0.00 USD');
        expect(screen.getByTestId('tickpulse-trades-settled')).toHaveTextContent('0 / 0');
        expect(screen.getByTestId('tickpulse-win-rate')).toHaveTextContent('0%');
        expect(screen.getByTestId('tickpulse-markets-ticks')).toHaveTextContent('0 / 0');

        // User chooses custom Martingale = 3.2
        fireEvent.change(martingaleInput, { target: { value: '3.2' } });
        expect(martingaleInput.value).toBe('3.2');

        // Start Auto-Trading Best Market (Default: Before = Over 2, After = Even)
        await act(async () => {
            fireEvent.click(screen.getByTestId('tickpulse-load-and-run'));
        });

        // Trade 1 automatically picks #1 Over-2 market: 1HZ75V with stake $1.00
        await waitFor(() => {
            expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(1);
        });
        expect(mockExecuteLiveDerivTrade.mock.calls[0][0]).toMatchObject({
            symbol: '1HZ75V',
            contractType: 'DIGITOVER',
            barrier: 2,
            stake: 1,
        });

        // Emit 2 live ticks during the run -> Live Scanner reflects exact markets & ticks scanned
        act(() => {
            tickListeners.forEach(fn => fn({ symbol: '1HZ75V', price: 250.09, t: 1700099999001 }));
            tickListeners.forEach(fn => fn({ symbol: '1HZ10V', price: 120.02, t: 1700099999002 }));
        });
        expect(screen.getByTestId('tickpulse-markets-ticks')).toHaveTextContent('2 / 3');

        // Settle Trade 1 as a -$1.00 loss -> Trades/Settled = 1 / 1, Win Rate = 0%,
        // and Trade 2 switches to #1 Even market (1HZ10V) with user's Martingale stake 1.00 * 3.2 = $3.20!
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
        });

        expect(screen.getByTestId('tickpulse-trades-settled')).toHaveTextContent('1 / 1');
        expect(screen.getByTestId('tickpulse-win-rate')).toHaveTextContent('0%');

        await waitFor(() => {
            expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(2);
        });
        expect(mockExecuteLiveDerivTrade.mock.calls[1][0]).toMatchObject({
            symbol: '1HZ10V',
            contractType: 'DIGITEVEN',
            stake: 3.2,
        });

        // Settle Trade 2 as a +$3.05 win -> Trades/Settled = 2 / 2, Win Rate = 50%, Session P/L = +2.05 USD
        await act(async () => {
            tradeCallbacks[1](
                {
                    contract_id: 9002,
                    profit: 3.05,
                    buy_price: 3.2,
                    currency: 'USD',
                },
                true
            );
        });

        expect(screen.getByTestId('tickpulse-trades-settled')).toHaveTextContent('2 / 2');
        expect(screen.getByTestId('tickpulse-win-rate')).toHaveTextContent('50%');
        expect(screen.getByTestId('tickpulse-session-pl')).toHaveTextContent('+2.05 USD');
    });
});
