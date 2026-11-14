import { extractLastDigit } from './ai-bot-presets';

export type VirtualRecoveryContract = 'DIGITEVEN' | 'DIGITODD';

export interface VirtualRecoveryTrade {
    symbol: string;
    marketLabel: string;
    contractType: VirtualRecoveryContract;
    pipSize: number;
    ticksRemaining: number;
    lastTickTime: number;
    entrySpot: number;
    currency: string;
}

/** Advance only on newer live ticks from the chosen market. No buy or P/L is involved. */
export function advanceVirtualRecovery(
    trade: VirtualRecoveryTrade,
    symbol: string,
    tick: { t: number; price: number }
): { trade: VirtualRecoveryTrade; outcome: 'won' | 'lost' | null; digit?: number } {
    if (
        symbol !== trade.symbol ||
        !Number.isFinite(tick.t) ||
        !Number.isFinite(tick.price) ||
        tick.t <= trade.lastTickTime
    ) {
        return { trade, outcome: null };
    }
    const next = { ...trade, ticksRemaining: trade.ticksRemaining - 1, lastTickTime: tick.t };
    if (next.ticksRemaining > 0) return { trade: next, outcome: null };
    const digit = extractLastDigit(tick.price, trade.pipSize);
    const won = trade.contractType === 'DIGITEVEN' ? digit % 2 === 0 : digit % 2 === 1;
    return { trade: next, outcome: won ? 'won' : 'lost', digit };
}
