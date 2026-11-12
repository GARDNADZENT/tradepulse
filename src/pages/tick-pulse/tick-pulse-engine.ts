export type TickPulseContractKey =
    | 'OVER'
    | 'UNDER'
    | 'EVEN'
    | 'ODD'
    | 'RISE'
    | 'FALL'
    | 'RESET_CALL'
    | 'RESET_PUT'
    | 'ONLY_UPS'
    | 'ONLY_DOWNS';

export type TickPulseSplitCount = 1 | 2 | 3;

export type TickPulseEntryCondition =
    | 'NONE'
    | 'OPPOSITE_1'
    | 'OPPOSITE_2'
    | 'OPPOSITE_3'
    | 'CONFIRM_1';

export interface TickPulseContractMeta {
    key: TickPulseContractKey;
    label: string;
    apiType: string;
    usesPrediction: boolean;
    defaultPrediction: number;
    defaultDurationTicks: number;
    theoreticalWinProb: (prediction: number) => number;
}

export interface TickPulseMarketDef {
    symbol: string;
    label: string;
    shortLabel: string;
}

export const TICKPULSE_MARKETS: TickPulseMarketDef[] = [
    { symbol: '1HZ10V', label: 'Volatility 10 (1s) Index', shortLabel: 'V10 (1s)' },
    { symbol: '1HZ15V', label: 'Volatility 15 (1s) Index', shortLabel: 'V15 (1s)' },
    { symbol: '1HZ25V', label: 'Volatility 25 (1s) Index', shortLabel: 'V25 (1s)' },
    { symbol: '1HZ30V', label: 'Volatility 30 (1s) Index', shortLabel: 'V30 (1s)' },
    { symbol: '1HZ50V', label: 'Volatility 50 (1s) Index', shortLabel: 'V50 (1s)' },
    { symbol: '1HZ75V', label: 'Volatility 75 (1s) Index', shortLabel: 'V75 (1s)' },
    { symbol: '1HZ90V', label: 'Volatility 90 (1s) Index', shortLabel: 'V90 (1s)' },
    { symbol: '1HZ100V', label: 'Volatility 100 (1s) Index', shortLabel: 'V100 (1s)' },
    { symbol: 'R_10', label: 'Volatility 10 Index', shortLabel: 'V10' },
    { symbol: 'R_25', label: 'Volatility 25 Index', shortLabel: 'V25' },
    { symbol: 'R_50', label: 'Volatility 50 Index', shortLabel: 'V50' },
    { symbol: 'R_75', label: 'Volatility 75 Index', shortLabel: 'V75' },
    { symbol: 'R_100', label: 'Volatility 100 Index', shortLabel: 'V100' },
];

export const TICKPULSE_CONTRACTS: TickPulseContractMeta[] = [
    {
        key: 'OVER',
        label: 'Over',
        apiType: 'DIGITOVER',
        usesPrediction: true,
        defaultPrediction: 2,
        defaultDurationTicks: 1,
        theoreticalWinProb: p => Math.max(0.1, Math.min(0.9, (9 - clampPredictionForContract('OVER', p)) / 10)),
    },
    {
        key: 'UNDER',
        label: 'Under',
        apiType: 'DIGITUNDER',
        usesPrediction: true,
        defaultPrediction: 7,
        defaultDurationTicks: 1,
        theoreticalWinProb: p => Math.max(0.1, Math.min(0.9, clampPredictionForContract('UNDER', p) / 10)),
    },
    {
        key: 'EVEN',
        label: 'Even',
        apiType: 'DIGITEVEN',
        usesPrediction: false,
        defaultPrediction: 2,
        defaultDurationTicks: 1,
        theoreticalWinProb: () => 0.5,
    },
    {
        key: 'ODD',
        label: 'Odd',
        apiType: 'DIGITODD',
        usesPrediction: false,
        defaultPrediction: 3,
        defaultDurationTicks: 1,
        theoreticalWinProb: () => 0.5,
    },
    {
        key: 'RISE',
        label: 'Rise',
        apiType: 'CALL',
        usesPrediction: false,
        defaultPrediction: 4,
        defaultDurationTicks: 1,
        theoreticalWinProb: () => 0.5,
    },
    {
        key: 'FALL',
        label: 'Fall',
        apiType: 'PUT',
        usesPrediction: false,
        defaultPrediction: 4,
        defaultDurationTicks: 1,
        theoreticalWinProb: () => 0.5,
    },
    {
        key: 'RESET_CALL',
        label: 'Reset Call',
        apiType: 'RESETCALL',
        usesPrediction: false,
        defaultPrediction: 4,
        defaultDurationTicks: 5,
        theoreticalWinProb: () => 0.52,
    },
    {
        key: 'RESET_PUT',
        label: 'Reset Put',
        apiType: 'RESETPUT',
        usesPrediction: false,
        defaultPrediction: 4,
        defaultDurationTicks: 5,
        theoreticalWinProb: () => 0.52,
    },
    {
        key: 'ONLY_UPS',
        label: 'Only Ups',
        apiType: 'RUNHIGH',
        usesPrediction: false,
        defaultPrediction: 4,
        defaultDurationTicks: 2,
        theoreticalWinProb: () => 0.25,
    },
    {
        key: 'ONLY_DOWNS',
        label: 'Only Downs',
        apiType: 'RUNLOW',
        usesPrediction: false,
        defaultPrediction: 4,
        defaultDurationTicks: 2,
        theoreticalWinProb: () => 0.25,
    },
];

const OVER_NET_PROFIT_RATIOS = [0.095, 0.234, 0.405, 0.642, 0.961, 1.432, 2.214, 3.8, 8.5];

export function getTickPulseContractMeta(key: TickPulseContractKey): TickPulseContractMeta {
    return TICKPULSE_CONTRACTS.find(c => c.key === key) || TICKPULSE_CONTRACTS[0];
}

export function isPredictionDigitAllowed(key: TickPulseContractKey, digit: number): boolean {
    if (key === 'OVER') return digit >= 0 && digit <= 8;
    if (key === 'UNDER') return digit >= 1 && digit <= 9;
    return false;
}

export function clampPredictionForContract(key: TickPulseContractKey, digit: number): number {
    const rounded = Math.round(Number.isFinite(digit) ? digit : 2);
    if (key === 'OVER') return Math.max(0, Math.min(8, rounded));
    if (key === 'UNDER') return Math.max(1, Math.min(9, rounded));
    return Math.max(0, Math.min(9, rounded));
}

export function formatTickPulseSelectionLabel(key: TickPulseContractKey, prediction: number): string {
    const meta = getTickPulseContractMeta(key);
    if (meta.usesPrediction) {
        return `${meta.label} ${clampPredictionForContract(key, prediction)}`;
    }
    return meta.label;
}

export function resolveTickPulseOrderSpec(
    key: TickPulseContractKey,
    prediction: number,
    requestedTicks?: number
): {
    apiContractType: string;
    duration: number;
    barrier?: number;
    displayLabel: string;
} {
    const meta = getTickPulseContractMeta(key);
    const baseTicks = Math.max(1, Math.round(Number(requestedTicks) || meta.defaultDurationTicks));

    switch (key) {
        case 'OVER': {
            const b = clampPredictionForContract('OVER', prediction);
            return {
                apiContractType: 'DIGITOVER',
                duration: Math.min(10, baseTicks),
                barrier: b,
                displayLabel: `Over ${b}`,
            };
        }
        case 'UNDER': {
            const b = clampPredictionForContract('UNDER', prediction);
            return {
                apiContractType: 'DIGITUNDER',
                duration: Math.min(10, baseTicks),
                barrier: b,
                displayLabel: `Under ${b}`,
            };
        }
        case 'EVEN':
            return { apiContractType: 'DIGITEVEN', duration: Math.min(10, baseTicks), displayLabel: 'Even' };
        case 'ODD':
            return { apiContractType: 'DIGITODD', duration: Math.min(10, baseTicks), displayLabel: 'Odd' };
        case 'RISE':
            return { apiContractType: 'CALL', duration: Math.min(10, baseTicks), displayLabel: 'Rise' };
        case 'FALL':
            return { apiContractType: 'PUT', duration: Math.min(10, baseTicks), displayLabel: 'Fall' };
        case 'RESET_CALL':
            return {
                apiContractType: 'RESETCALL',
                duration: Math.min(10, Math.max(5, baseTicks)),
                displayLabel: 'Reset Call',
            };
        case 'RESET_PUT':
            return {
                apiContractType: 'RESETPUT',
                duration: Math.min(10, Math.max(5, baseTicks)),
                displayLabel: 'Reset Put',
            };
        case 'ONLY_UPS':
            return {
                apiContractType: 'RUNHIGH',
                duration: Math.min(5, Math.max(2, baseTicks)),
                displayLabel: 'Only Ups',
            };
        case 'ONLY_DOWNS':
            return {
                apiContractType: 'RUNLOW',
                duration: Math.min(5, Math.max(2, baseTicks)),
                displayLabel: 'Only Downs',
            };
    }
}

export function estimateNetProfitRatio(key: TickPulseContractKey, prediction: number): number {
    switch (key) {
        case 'OVER': {
            const b = clampPredictionForContract('OVER', prediction);
            return OVER_NET_PROFIT_RATIOS[b] ?? 0.405;
        }
        case 'UNDER': {
            const b = clampPredictionForContract('UNDER', prediction);
            return OVER_NET_PROFIT_RATIOS[9 - b] ?? 0.405;
        }
        case 'EVEN':
        case 'ODD':
            return 0.961;
        case 'RISE':
        case 'FALL':
            return 0.953;
        case 'RESET_CALL':
        case 'RESET_PUT':
            return 0.88;
        case 'ONLY_UPS':
        case 'ONLY_DOWNS':
            return 2.86;
    }
}

export interface TickPulseRecoveryState {
    inRecovery: boolean;
    unrecoveredLoss: number;
    remainingSplits: number;
    totalSplits: TickPulseSplitCount;
}

export function createInitialRecoveryState(totalSplits: TickPulseSplitCount): TickPulseRecoveryState {
    return {
        inRecovery: false,
        unrecoveredLoss: 0,
        remainingSplits: totalSplits,
        totalSplits,
    };
}

export function computeNextTickPulseStake(params: {
    initialStake: number;
    recoveryState: TickPulseRecoveryState;
    afterNetProfitRatio: number;
}): number {
    const safeInitial = Math.max(0.35, Number(params.initialStake) || 1);
    const { recoveryState } = params;
    if (!recoveryState.inRecovery || recoveryState.unrecoveredLoss <= 0.009) {
        return Number(safeInitial.toFixed(2));
    }

    const splitsLeft = Math.max(1, Math.min(3, Math.round(recoveryState.remainingSplits || 1)));
    const safeRatio = Math.max(0.08, Number(params.afterNetProfitRatio) || 0.95);
    const targetLegProfit = recoveryState.unrecoveredLoss / splitsLeft;
    const rawStake = targetLegProfit / safeRatio;
    const roundedUp = Math.ceil(rawStake * 100) / 100;
    return Math.max(0.35, Number(roundedUp.toFixed(2)));
}

export function settleTickPulseRecoveryState(params: {
    prev: TickPulseRecoveryState;
    profit: number;
    configuredSplits: TickPulseSplitCount;
}): TickPulseRecoveryState {
    const { prev, profit, configuredSplits } = params;

    if (!prev.inRecovery) {
        if (profit >= 0) {
            return {
                inRecovery: false,
                unrecoveredLoss: 0,
                remainingSplits: configuredSplits,
                totalSplits: configuredSplits,
            };
        }
        return {
            inRecovery: true,
            unrecoveredLoss: Number(Math.abs(profit).toFixed(2)),
            remainingSplits: configuredSplits,
            totalSplits: configuredSplits,
        };
    }

    // Settling an After-loss recovery trade
    if (profit > 0) {
        const remainingLoss = Number((prev.unrecoveredLoss - profit).toFixed(2));
        if (remainingLoss <= 0.01) {
            return {
                inRecovery: false,
                unrecoveredLoss: 0,
                remainingSplits: configuredSplits,
                totalSplits: configuredSplits,
            };
        }
        return {
            inRecovery: true,
            unrecoveredLoss: remainingLoss,
            remainingSplits: Math.max(1, prev.remainingSplits - 1),
            totalSplits: configuredSplits,
        };
    }

    const accumulatedLoss = Number((prev.unrecoveredLoss + Math.abs(profit)).toFixed(2));
    return {
        inRecovery: true,
        unrecoveredLoss: accumulatedLoss,
        remainingSplits: configuredSplits,
        totalSplits: configuredSplits,
    };
}

export function extractPipDigit(price: number, pipSize = 2): number {
    const fixed = Math.abs(Number(price) || 0).toFixed(Math.max(0, pipSize));
    return Number(fixed.charAt(fixed.length - 1)) || 0;
}

export function evaluateSingleTickOutcome(params: {
    contractKey: TickPulseContractKey;
    prediction: number;
    ticks: { t: number; price: number }[];
    index: number;
    pipSize: number;
}): boolean | null {
    const { contractKey, prediction, ticks, index, pipSize } = params;
    if (index < 0 || index >= ticks.length) return null;

    const currentPrice = ticks[index].price;
    const digit = extractPipDigit(currentPrice, pipSize);

    switch (contractKey) {
        case 'OVER':
            return digit > clampPredictionForContract('OVER', prediction);
        case 'UNDER':
            return digit < clampPredictionForContract('UNDER', prediction);
        case 'EVEN':
            return digit % 2 === 0;
        case 'ODD':
            return digit % 2 === 1;
        case 'RISE':
            if (index < 1) return null;
            return currentPrice > ticks[index - 1].price;
        case 'FALL':
            if (index < 1) return null;
            return currentPrice < ticks[index - 1].price;
        case 'ONLY_UPS':
            if (index < 2) return null;
            return currentPrice > ticks[index - 1].price && ticks[index - 1].price > ticks[index - 2].price;
        case 'ONLY_DOWNS':
            if (index < 2) return null;
            return currentPrice < ticks[index - 1].price && ticks[index - 1].price < ticks[index - 2].price;
        case 'RESET_CALL': {
            if (index < 5) return null;
            const entry = ticks[index - 5].price;
            const mid = ticks[index - 3].price;
            const exit = currentPrice;
            return mid < entry ? exit > mid : exit > entry;
        }
        case 'RESET_PUT': {
            if (index < 5) return null;
            const entry = ticks[index - 5].price;
            const mid = ticks[index - 3].price;
            const exit = currentPrice;
            return mid > entry ? exit < mid : exit < entry;
        }
    }
}

export interface TickPulseDigitBadge {
    digit: number;
    matched: boolean;
}

export interface TickPulseMarketRanking {
    symbol: string;
    label: string;
    shortLabel: string;
    tickCount: number;
    hitRatePct: number;
    recentHitRatePct: number;
    edgePct: number;
    compositeScore: number;
    lastQuote: string;
    lastDigits: TickPulseDigitBadge[];
}

export function evaluateTickPulseMarket(params: {
    market: TickPulseMarketDef;
    rawTicks: { t: number; price: number }[];
    pipSize: number;
    contractKey: TickPulseContractKey;
    prediction: number;
    windowSize?: number;
}): TickPulseMarketRanking {
    const { market, rawTicks, pipSize, contractKey, prediction } = params;
    const windowSize = Math.max(20, params.windowSize || 100);
    const slice = rawTicks.slice(-windowSize);

    let wins = 0;
    let total = 0;
    let recentWins = 0;
    let recentTotal = 0;
    const recentStart = Math.max(0, slice.length - 20);

    for (let i = 0; i < slice.length; i++) {
        const outcome = evaluateSingleTickOutcome({
            contractKey,
            prediction,
            ticks: slice,
            index: i,
            pipSize,
        });
        if (outcome === null) continue;
        total += 1;
        if (outcome) wins += 1;
        if (i >= recentStart) {
            recentTotal += 1;
            if (outcome) recentWins += 1;
        }
    }

    const meta = getTickPulseContractMeta(contractKey);
    const expectedPct = meta.theoreticalWinProb(prediction) * 100;
    const hitRatePct = total > 0 ? Math.round((wins / total) * 100) : Math.round(expectedPct);
    const recentHitRatePct =
        recentTotal > 0 ? Math.round((recentWins / recentTotal) * 100) : hitRatePct;
    const blendedHitPct = total > 0 ? (wins / total) * 65 + (recentTotal > 0 ? (recentWins / recentTotal) * 35 : (wins / total) * 35) : expectedPct;
    const edgePct = Math.round(blendedHitPct - expectedPct);
    const readinessWeight = Math.min(1, slice.length / 25);
    const compositeScore = Number(((blendedHitPct - expectedPct) * readinessWeight + blendedHitPct * 0.25).toFixed(2));

    const tailStart = Math.max(0, slice.length - 8);
    const lastDigits: TickPulseDigitBadge[] = [];
    for (let i = tailStart; i < slice.length; i++) {
        const digit = extractPipDigit(slice[i].price, pipSize);
        const out = evaluateSingleTickOutcome({
            contractKey,
            prediction,
            ticks: slice,
            index: i,
            pipSize,
        });
        lastDigits.push({
            digit,
            matched: Boolean(out),
        });
    }

    const lastQuote =
        slice.length > 0 ? slice[slice.length - 1].price.toFixed(Math.max(0, pipSize)) : '—';

    return {
        symbol: market.symbol,
        label: market.label,
        shortLabel: market.shortLabel,
        tickCount: rawTicks.length,
        hitRatePct,
        recentHitRatePct,
        edgePct,
        compositeScore,
        lastQuote,
        lastDigits,
    };
}

export function rankTickPulseMarkets(params: {
    getTicks: (symbol: string) => { t: number; price: number }[];
    getPipSize: (symbol: string) => number;
    contractKey: TickPulseContractKey;
    prediction: number;
}): TickPulseMarketRanking[] {
    return TICKPULSE_MARKETS.map(market =>
        evaluateTickPulseMarket({
            market,
            rawTicks: params.getTicks(market.symbol),
            pipSize: params.getPipSize(market.symbol),
            contractKey: params.contractKey,
            prediction: params.prediction,
        })
    ).sort((a, b) => {
        if (b.compositeScore !== a.compositeScore) return b.compositeScore - a.compositeScore;
        if (b.hitRatePct !== a.hitRatePct) return b.hitRatePct - a.hitRatePct;
        return b.tickCount - a.tickCount;
    });
}

export function checkTickPulseEntryCondition(params: {
    condition: TickPulseEntryCondition;
    contractKey: TickPulseContractKey;
    prediction: number;
    rawTicks: { t: number; price: number }[];
    pipSize: number;
}): boolean {
    const { condition, contractKey, prediction, rawTicks, pipSize } = params;
    if (rawTicks.length === 0) return false;
    if (condition === 'NONE') return true;

    if (condition === 'CONFIRM_1') {
        const out = evaluateSingleTickOutcome({
            contractKey,
            prediction,
            ticks: rawTicks,
            index: rawTicks.length - 1,
            pipSize,
        });
        return out === true;
    }

    const requiredOpposite =
        condition === 'OPPOSITE_3' ? 3 : condition === 'OPPOSITE_2' ? 2 : 1;

    if (rawTicks.length < requiredOpposite + 2) return false;

    for (let offset = 0; offset < requiredOpposite; offset++) {
        const idx = rawTicks.length - 1 - offset;
        const out = evaluateSingleTickOutcome({
            contractKey,
            prediction,
            ticks: rawTicks,
            index: idx,
            pipSize,
        });
        if (out !== false) return false;
    }

    return true;
}

export function selectBestReadyTickPulseMarket(params: {
    getTicks: (symbol: string) => { t: number; price: number }[];
    getPipSize: (symbol: string) => number;
    contractKey: TickPulseContractKey;
    prediction: number;
    condition: TickPulseEntryCondition;
    lastTradedEpochs?: Record<string, number>;
    pinnedSymbol?: string | null;
}): { ranking: TickPulseMarketRanking; latestEpoch: number } | null {
    const ranked = rankTickPulseMarkets({
        getTicks: params.getTicks,
        getPipSize: params.getPipSize,
        contractKey: params.contractKey,
        prediction: params.prediction,
    });

    const candidates = params.pinnedSymbol
        ? ranked.filter(r => r.symbol === params.pinnedSymbol)
        : ranked;

    for (const candidate of candidates) {
        const rawTicks = params.getTicks(candidate.symbol);
        if (!rawTicks.length) continue;

        const latestEpoch = rawTicks[rawTicks.length - 1]?.t ?? 0;
        if (
            latestEpoch &&
            params.lastTradedEpochs &&
            params.lastTradedEpochs[candidate.symbol] === latestEpoch
        ) {
            continue;
        }

        const pipSize = params.getPipSize(candidate.symbol);
        const conditionMet = checkTickPulseEntryCondition({
            condition: params.condition,
            contractKey: params.contractKey,
            prediction: params.prediction,
            rawTicks,
            pipSize,
        });

        if (conditionMet) {
            return { ranking: candidate, latestEpoch };
        }
    }

    return null;
}

