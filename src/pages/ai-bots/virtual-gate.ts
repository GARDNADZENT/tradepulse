/**
 * Virtual-gate rules for AI Bot 08 (Under 7 Recovery → Even–Odd Virtual).
 *
 * Bot 08 must simulate recovery signals until the trader's chosen number of
 * **virtual losses** has been reached. Only virtual losses count: a virtual win
 * never advances the gate, and it drops back to virtual scanning without
 * enabling a real trade.
 *
 * The gate is kept in one place and asked at the moment of purchase so a stale
 * boolean, a recomputed target or a start-of-run reset cannot let a real order
 * out before the required virtual losses exist.
 */

export interface VirtualGateState {
    /** Recovery is active (a real loss happened and has not been recovered). */
    inRecovery: boolean;
    /** Consecutive virtual losses counted for the current gate. */
    virtualLosses: number;
    /** Trader-configured number of virtual losses required. */
    required: number;
}

/** Normalizes the user's target to a whole number of at least 1. */
export const normalizeVirtualTarget = (value: unknown): number => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1;
    const rounded = Math.floor(numeric);
    return rounded >= 1 ? rounded : 1;
};

/**
 * True when a *real* order may be placed.
 *
 * While in recovery, every virtual loss must be completed first. A real order is
 * allowed only once `virtualLosses >= required`; it is then the "next signal"
 * real trade. Outside recovery the normal entry signal trades for real.
 *
 * @param isVirtualBot whether the selected bot is Bot 08
 * @param state current gate values
 */
export const canPlaceRealOrder = (isVirtualBot: boolean, state: VirtualGateState): boolean => {
    if (!isVirtualBot) return true;
    if (!state.inRecovery) return true;
    return state.virtualLosses >= normalizeVirtualTarget(state.required);
};

/**
 * Outcome of a settled *virtual* simulation.
 *
 * Losses accumulate; wins are recorded but do not advance the gate, so a win
 * leaves the bot in virtual scanning and the loss counter untouched.
 */
export const applyVirtualOutcome = (
    state: VirtualGateState,
    outcome: 'won' | 'lost'
): { virtualLosses: number; virtualMode: boolean; targetReached: boolean } => {
    const required = normalizeVirtualTarget(state.required);
    const virtualLosses = outcome === 'lost' ? Math.max(0, state.virtualLosses) + 1 : Math.max(0, state.virtualLosses);
    const targetReached = virtualLosses >= required;
    return { virtualLosses, targetReached, virtualMode: !targetReached };
};

/**
 * Restores a persisted recovery gate.
 *
 * The persisted `virtualMode` flag is deliberately *derived* rather than trusted:
 * an interrupted run may have written a flag that disagrees with its loss count
 * (e.g. after a target change), and trusting it is what allowed a real order
 * before the virtual losses existed.
 */
export const restoreVirtualGate = (
    saved: { virtualLosses?: number; virtualLossesRequired?: number } | undefined,
    fallbackRequired: number,
    isVirtualBot: boolean
): VirtualGateState => {
    const required = normalizeVirtualTarget(saved?.virtualLossesRequired ?? fallbackRequired);
    const virtualLosses = Math.max(0, Math.floor(Number(saved?.virtualLosses) || 0));
    return {
        inRecovery: Boolean(saved),
        virtualLosses: saved ? virtualLosses : 0,
        required,
    };
};

/** Human-readable reason shown when the gate blocks a real order. */
export const getGateBlockedMessage = (state: VirtualGateState): string =>
    `[VIRTUAL] Real trade held: ${Math.max(0, state.virtualLosses)}/${normalizeVirtualTarget(
        state.required
    )} virtual losses. Simulating until the target is reached — no money wagered.`;
