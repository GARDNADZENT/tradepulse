import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { normalizeDerivContractParams } from '@/utils/ai-bot-xml-builder';
import TickPulse from '../tick-pulse';
import {
    checkTickPulseEntryCondition,
    clampPredictionForContract,
    computeNextTickPulseStake,
    createInitialRecoveryState,
    estimateNetProfitRatio,
    rankTickPulseMarkets,
    resolveTickPulseOrderSpec,
    settleTickPulseRecoveryState,
    TICKPULSE_CONTRACTS,
    TICKPULSE_MARKETS,
} from '../tick-pulse-engine';

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

jest.mock('@/lib/deriv/tick-bus', () => {
    const sampleTicks = Array.from({ length: 40 }, (_, i) => ({
        t: 1700000000000 + i * 1000,
        price: 100 + ((i * 7 + 3) % 10) / 100,
    }));
    return {
        derivBus: {
            getTicks: (sym: string) =>
                sym === '1HZ75V'
                    ? Array.from({ length: 40 }, (_, i) => ({
                          t: 1700000000000 + i * 1000,
                          price: 250 + 0.08, // last digit 8 -> strong Over 2 hit rate
                      }))
                    : sampleTicks,
            getPipSize: () => 2,
            onHistory: () => () => {},
            onTick: () => () => {},
            subscribe: () => () => {},
        },
    };
});

describe('TickPulse Engine & UI', () => {
    beforeEach(() => {
        window.localStorage.clear();
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
        const evenRatio = estimateNetProfitRatio('EVEN', 4); // ~0.961
        let state = createInitialRecoveryState(2);

        // Initial stake before loss = $1.00
        expect(
            computeNextTickPulseStake({
                initialStake: 1,
                recoveryState: state,
                afterNetProfitRatio: evenRatio,
            })
        ).toBe(1);

        // Lose -$1.00 on Before-loss trade -> enters Split 1/2 recovery
        state = settleTickPulseRecoveryState({
            prev: state,
            profit: -1,
            configuredSplits: 2,
        });
        expect(state.inRecovery).toBe(true);
        expect(state.unrecoveredLoss).toBe(1);
        expect(state.remainingSplits).toBe(2);

        // Split 1/2 stake needs to recover $0.50 at ~0.961 net ratio -> $0.53
        const split1Stake = computeNextTickPulseStake({
            initialStake: 1,
            recoveryState: state,
            afterNetProfitRatio: evenRatio,
        });
        expect(split1Stake).toBe(0.53);

        // Win +$0.51 on Split 1/2 -> remaining unrecovered loss $0.49, 1 split left
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

        // Win +$0.49 on Split 2/2 -> fully recovered, back to Before-loss mode!
        state = settleTickPulseRecoveryState({
            prev: state,
            profit: 0.49,
            configuredSplits: 2,
        });
        expect(state.inRecovery).toBe(false);
        expect(state.unrecoveredLoss).toBe(0);
        expect(state.remainingSplits).toBe(2);
    });

    it('ranks the market with the strongest empirical hit rate #1 and evaluates entry conditions', () => {
        const ranked = rankTickPulseMarkets({
            getTicks: s =>
                s === '1HZ75V'
                    ? Array.from({ length: 40 }, (_, i) => ({ t: i * 1000, price: 250.08 }))
                    : Array.from({ length: 40 }, (_, i) => ({ t: i * 1000, price: 100.01 })),
            getPipSize: () => 2,
            contractKey: 'OVER',
            prediction: 2,
        });

        expect(ranked[0].symbol).toBe('1HZ75V');
        expect(ranked[0].hitRatePct).toBe(100);

        const opposite2Ticks = [
            { t: 1, price: 100.08 },
            { t: 2, price: 100.07 },
            { t: 3, price: 100.01 }, // <= 2 (opposite)
            { t: 4, price: 100.02 }, // <= 2 (opposite)
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

    it('renders TickPulse UI cleanly with TradersPulse branding, 10 contracts, splits, and Find Best Market', () => {
        render(<TickPulse />);

        expect(screen.getByTestId('tickpulse-page')).toBeInTheDocument();
        expect(screen.getByText('TradersPulse')).toBeInTheDocument();
        expect(screen.getByTestId('tickpulse-markets-ticks')).toHaveTextContent('13 / 40');

        // Switch Before loss to Only Ups and After loss to Reset Call
        fireEvent.click(screen.getByTestId('before-contract-ONLY_UPS'));
        fireEvent.click(screen.getByTestId('after-contract-RESET_CALL'));
        fireEvent.click(screen.getByTestId('tickpulse-split-3'));

        expect(screen.getByText('Before: Only Ups')).toBeInTheDocument();
        expect(screen.getByText('After: Reset Call')).toBeInTheDocument();

        // Click Find Best Market
        fireEvent.click(screen.getByTestId('tickpulse-find-best-market'));
        expect(screen.getByTestId('tickpulse-status-banner').textContent).toContain('Best Market:');

        // Switch to Trade history sub-tab
        fireEvent.click(screen.getByText('Trade history'));
        expect(screen.getByTestId('tickpulse-history-panel')).toBeInTheDocument();

        // Ensure zero external brand leakage
        const fullHtml = document.body.innerHTML;
        expect(fullHtml).not.toMatch(/Risk Managers|Makoti|Duke/i);
    });
});
