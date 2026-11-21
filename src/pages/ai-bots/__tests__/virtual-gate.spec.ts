import { applyVirtualOutcome, canPlaceRealOrder, restoreVirtualGate } from '../virtual-gate';

/**
 * Bot 08 must not place a real trade until the trader's chosen number of
 * *virtual losses* exists. Reported production symptom: a real order fired with
 * zero counted virtual losses.
 */
describe('AI Bot 08 virtual gate', () => {
    it('blocks a real order while virtual losses are still owed', () => {
        for (const required of [1, 2, 3, 5]) {
            for (let losses = 0; losses < required; losses++) {
                expect(canPlaceRealOrder(true, { inRecovery: true, virtualLosses: losses, required })).toBe(false);
            }
            expect(canPlaceRealOrder(true, { inRecovery: true, virtualLosses: required, required })).toBe(true);
        }
    });

    it('blocks the real order when the actual loss count is below the configured target', () => {
        // A resolved default of 1 vs a configured 2 must not fire real at 1/2.
        expect(canPlaceRealOrder(true, { inRecovery: true, virtualLosses: 1, required: 2 })).toBe(false);
        expect(canPlaceRealOrder(true, { inRecovery: true, virtualLosses: 0, required: 2 })).toBe(false);
    });

    it('lets non-virtual bots and initial entries trade normally', () => {
        expect(canPlaceRealOrder(false, { inRecovery: true, virtualLosses: 0, required: 2 })).toBe(true);
        expect(canPlaceRealOrder(true, { inRecovery: false, virtualLosses: 0, required: 2 })).toBe(true);
    });

    it('never advances the gate on a virtual win', () => {
        const won = applyVirtualOutcome({ inRecovery: true, virtualLosses: 0, required: 2 }, 'won');
        expect(won).toEqual({ virtualLosses: 0, targetReached: false, virtualMode: true });

        const wonLater = applyVirtualOutcome({ inRecovery: true, virtualLosses: 1, required: 2 }, 'won');
        expect(wonLater).toEqual({ virtualLosses: 1, targetReached: false, virtualMode: true });
    });

    it('counts virtual losses and opens the gate exactly at the target', () => {
        const first = applyVirtualOutcome({ inRecovery: true, virtualLosses: 0, required: 2 }, 'lost');
        expect(first).toEqual({ virtualLosses: 1, targetReached: false, virtualMode: true });

        const second = applyVirtualOutcome({ inRecovery: true, virtualLosses: 1, required: 2 }, 'lost');
        expect(second).toEqual({ virtualLosses: 2, targetReached: true, virtualMode: false });

        // Extra losses beyond the target must not wrap the gate open/closed.
        const third = applyVirtualOutcome({ inRecovery: true, virtualLosses: 2, required: 2 }, 'lost');
        expect(third.targetReached).toBe(true);
    });

    it('derives a restored gate from the loss count instead of a stale saved flag', () => {
        // Saved flag says "real" but only 1 of 2 virtual losses happened.
        const gate = restoreVirtualGate({ virtualLosses: 1, virtualLossesRequired: 2 }, 1, true);
        expect(gate).toEqual({ inRecovery: true, virtualLosses: 1, required: 2 });
        expect(canPlaceRealOrder(true, gate)).toBe(false);

        // Target raised between runs: still owed the difference.
        const raised = restoreVirtualGate({ virtualLosses: 1, virtualLossesRequired: 3 }, 3, true);
        expect(canPlaceRealOrder(true, raised)).toBe(false);
    });

    it('keeps a gate with no saved losses fully closed', () => {
        const gate = restoreVirtualGate({ virtualLossesRequired: 2 }, 2, true);
        expect(canPlaceRealOrder(true, gate)).toBe(false);
    });

    it('treats a fresh run (no saved gate) as a normal entry rather than a locked gate', () => {
        const gate = restoreVirtualGate(undefined, 2, true);
        expect(gate.inRecovery).toBe(false);
        expect(canPlaceRealOrder(true, gate)).toBe(true);
    });

    it('normalizes nonsense targets without opening the gate early', () => {
        expect(canPlaceRealOrder(true, { inRecovery: true, virtualLosses: 0, required: 0 })).toBe(false);
        expect(canPlaceRealOrder(true, { inRecovery: true, virtualLosses: 1, required: 0 })).toBe(true);
        expect(canPlaceRealOrder(true, { inRecovery: true, virtualLosses: 0, required: 2.9 })).toBe(false);
        expect(canPlaceRealOrder(true, { inRecovery: true, virtualLosses: 1, required: Number.NaN })).toBe(true);
    });
});
