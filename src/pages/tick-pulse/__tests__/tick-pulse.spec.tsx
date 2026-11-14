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
let mockTickEpochOffset = 0;

jest.mock('@/lib/deriv/tick-bus', () => {
    return {
        derivBus: {
            getTicks: (sym: string) => {
                if (sym === '1HZ75V') {
                    // Last digit 9 (odd, > 2) -> 100% Over 2, 0% Even
                    return Array.from({ length: 40 }, (_, i) => ({
                        t: 1700000000000 + i * 1000 + mockTickEpochOffset,
                        price: 250.09,
                    }));
                }
                if (sym === '1HZ10V') {
                    // Last digit 2 (even, <= 2) -> 0% Over 2, 100% Even!
                    return Array.from({ length: 40 }, (_, i) => ({
                        t: 1700000000500 + i * 1000 + mockTickEpochOffset,
                        price: 120.02,
                    }));
                }
                return Array.from({ length: 40 }, (_, i) => ({
                    t: 1700000000200 + i * 1000 + mockTickEpochOffset,
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
        mockTickEpochOffset = 0;
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

    it('keeps a winning recovery stake for exactly two trades before resetting to base', () => {
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

        // Win (+$5.90) -> Before loss mode, but hold the winning $6.25 stake for two trades.
        state = settleTickPulseRecoveryState({
            prev: state,
            profit: 5.9,
            stake: 6.25,
        });
        expect(state.inRecovery).toBe(false);
        expect(state.consecutiveLosses).toBe(0);
        expect(state.winningStakeTradesRemaining).toBe(2);
        const nextStake = () => computeNextTickPulseStake({ initialStake: 1, martingaleMultiplier: 2.5, recoveryState: state });
        expect(nextStake()).toBe(6.25);
        state = settleTickPulseRecoveryState({ prev: state, profit: 1, stake: 6.25 });
        expect(state.winningStakeTradesRemaining).toBe(1);
        expect(nextStake()).toBe(6.25);
        state = settleTickPulseRecoveryState({ prev: state, profit: 1, stake: 6.25 });
        expect(state.winningStakeTradesRemaining).toBe(0);
        expect(nextStake()).toBe(1);
    });

    it.each([0, 1])('cancels the winning-stake hold on follow-up loss %s and resumes martingale', winsBeforeLoss => {
        let state = settleTickPulseRecoveryState({ prev: createInitialRecoveryState(), profit: 1, stake: 6.25 });
        if (winsBeforeLoss) state = settleTickPulseRecoveryState({ prev: state, profit: 1, stake: 6.25 });
        state = settleTickPulseRecoveryState({ prev: state, profit: -6.25, stake: 6.25 });
        expect(state).toMatchObject({ inRecovery: true, consecutiveLosses: 1, winningStakeTradesRemaining: 0, winningStake: 0 });
        expect(computeNextTickPulseStake({ initialStake: 1, martingaleMultiplier: 2, recoveryState: state })).toBe(12.5);
        state = settleTickPulseRecoveryState({ prev: state, profit: 2, stake: 12.5 });
        expect(state).toMatchObject({ inRecovery: false, winningStake: 12.5, winningStakeTradesRemaining: 2 });
    });

    it('clears the winning-stake hold in a fresh or reset session', () => {
        const state = createInitialRecoveryState();
        expect(state.winningStakeTradesRemaining).toBe(0);
        expect(computeNextTickPulseStake({ initialStake: 1, martingaleMultiplier: 2, recoveryState: state })).toBe(1);
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

    it('places two follow-up orders at the actual winning stake before returning to base', async () => {
        const callbacks: Array<(poc: any, terminal: boolean) => void> = [];
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            callbacks.push(params.onContractUpdate);
            return { contractId: 9000 + callbacks.length, buyPrice: params.stake, longcode: 'test' };
        });
        render(<TickPulse />);
        fireEvent.change(screen.getByTestId('tickpulse-martingale'), { target: { value: '3.2' } });
        await act(async () => { fireEvent.click(screen.getByTestId('tickpulse-load-and-run')); });
        expect(mockExecuteLiveDerivTrade.mock.calls[0][0]).toMatchObject({ stake: 1, contractType: 'DIGITOVER' });
        const settle = async (index: number, profit: number, stake: number) => {
            await act(async () => { callbacks[index]({ contract_id: 9001 + index, profit, buy_price: stake, currency: 'USD' }, true); });
        };
        const newTick = async () => {
            mockTickEpochOffset += 1000;
            await act(async () => { tickListeners.forEach(fn => fn({ symbol: '1HZ75V', price: 250.09, t: 1700000099000 + mockTickEpochOffset })); });
        };
        await settle(0, -1, 1);
        await newTick();
        expect(mockExecuteLiveDerivTrade.mock.calls[1][0]).toMatchObject({ stake: 3.2, contractType: 'DIGITEVEN' });
        await settle(1, 0.5, 3.2);
        expect(screen.getByTestId('tickpulse-status-banner')).toHaveTextContent('Winning stake 3.20 USD for 2 more trade(s)');
        await newTick();
        expect(mockExecuteLiveDerivTrade.mock.calls[2][0]).toMatchObject({ stake: 3.2, contractType: 'DIGITOVER' });
        await settle(2, 0.5, 3.2);
        expect(screen.getByTestId('tickpulse-status-banner')).toHaveTextContent('for 1 more trade(s)');
        await newTick();
        expect(mockExecuteLiveDerivTrade.mock.calls[3][0]).toMatchObject({ stake: 3.2, contractType: 'DIGITOVER' });
        await settle(3, 0.5, 3.2);
        expect(screen.getByTestId('tickpulse-status-banner')).toHaveTextContent('Next stake resets to base');
        await newTick();
        expect(mockExecuteLiveDerivTrade.mock.calls[4][0]).toMatchObject({ stake: 1, contractType: 'DIGITOVER' });
        fireEvent.click(screen.getByTestId('tickpulse-load-and-run'));
        await settle(4, 0.2, 1);
    });

    it('resumes the configured martingale immediately if a held-stake trade loses', async () => {
        const callbacks: Array<(poc: any, terminal: boolean) => void> = [];
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            callbacks.push(params.onContractUpdate);
            return { contractId: 9000 + callbacks.length, buyPrice: params.stake, longcode: 'test' };
        });
        render(<TickPulse />);
        await act(async () => { fireEvent.click(screen.getByTestId('tickpulse-load-and-run')); });
        const settle = async (index: number, profit: number, stake: number) => {
            await act(async () => { callbacks[index]({ contract_id: 9001 + index, profit, buy_price: stake }, true); });
        };
        const newTick = async () => {
            mockTickEpochOffset += 1000;
            await act(async () => { tickListeners.forEach(fn => fn({ symbol: '1HZ75V' })); });
        };
        await settle(0, -1, 1);
        await newTick();
        expect(mockExecuteLiveDerivTrade.mock.calls[1][0]).toMatchObject({ stake: 2, contractType: 'DIGITEVEN' });
        await settle(1, 0.5, 2);
        await newTick();
        expect(mockExecuteLiveDerivTrade.mock.calls[2][0]).toMatchObject({ stake: 2, contractType: 'DIGITOVER' });
        await settle(2, -2, 2);
        await newTick();
        expect(mockExecuteLiveDerivTrade.mock.calls[3][0]).toMatchObject({ stake: 4, contractType: 'DIGITEVEN' });
        fireEvent.click(screen.getByTestId('tickpulse-load-and-run'));
        await settle(3, 0.5, 4);
    });

    it('does not place held-stake follow-ups after take profit is reached', async () => {
        const callbacks: Array<(poc: any, terminal: boolean) => void> = [];
        mockExecuteLiveDerivTrade.mockImplementation(async (params: any) => {
            callbacks.push(params.onContractUpdate);
            return { contractId: 9000 + callbacks.length, buyPrice: params.stake, longcode: 'test' };
        });
        render(<TickPulse />);
        fireEvent.change(screen.getByTestId('tickpulse-take-profit'), { target: { value: '0.5' } });
        await act(async () => { fireEvent.click(screen.getByTestId('tickpulse-load-and-run')); });
        await act(async () => { callbacks[0]({ contract_id: 9001, profit: -1, buy_price: 1 }, true); });
        mockTickEpochOffset += 1000;
        await act(async () => { tickListeners.forEach(fn => fn({ symbol: '1HZ75V' })); });
        await act(async () => { callbacks[1]({ contract_id: 9002, profit: 1.6, buy_price: 2 }, true); });
        expect(screen.getByTestId('tickpulse-status-banner')).toHaveTextContent('Take profit reached');
        mockTickEpochOffset += 1000;
        await act(async () => { tickListeners.forEach(fn => fn({ symbol: '1HZ75V' })); });
        expect(mockExecuteLiveDerivTrade).toHaveBeenCalledTimes(2);
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
