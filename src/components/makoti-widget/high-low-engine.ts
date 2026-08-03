import { SYMBOL_LABELS, PIP_SIZES } from './makoti-ws';
import { sendViaNewSystemWithPromise } from '@/auth/NewDerivAuth';

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface Candle {
    open: number; high: number; low: number; close: number; time: number;
}

export interface IndicatorValues {
    ema9: number; ema21: number; ema50: number;
    rsi: number;
    macd: number; macdSignal: number; macdHistogram: number;
    adx: number;
    bbUpper: number; bbMiddle: number; bbLower: number;
    atr: number;
    support: number; resistance: number;
    consecUp: number;
    consecDown: number;
    momentumStrength: number;
    chopLevel: number;
}

export interface MarketScore {
    symbol: string;
    direction: 'RUNHIGH' | 'RUNLOW' | null;
    confidence: number;
    reasons: string[];
    indicators: IndicatorValues;
    trendM1: 'bullish' | 'bearish' | 'neutral';
    trendM5: 'bullish' | 'bearish' | 'neutral';
    trendM15: 'bullish' | 'bearish' | 'neutral';
    flatTickRate: number;
    momentumStrength: number;
    noiseLevel: number;
}

export interface TradeRecord {
    time: string;
    symbol: string;
    direction: 'RUNHIGH' | 'RUNLOW';
    confidence: number;
    stake: number;
    duration: number;
    entryPrice: number;
    exitPrice: number;
    profit: number;
    won: boolean;
    reasons: string[];
}

export interface HighLowConfig {
    stake: number;
    minConfidence: number;
    maxConsecutiveLosses: number;
    dailyProfitTarget: number;
    dailyStopLoss: number;
    martingale: number;
    martingaleEnabled: boolean;
    useCompounding: boolean;
}

export const DEFAULT_CONFIG: HighLowConfig = {
    stake: 1,
    minConfidence: 55,
    maxConsecutiveLosses: 3,
    dailyProfitTarget: 50,
    dailyStopLoss: -25,
    martingale: 2,
    martingaleEnabled: false,
    useCompounding: false,
};

/* ── Constants ──────────────────────────────────────────────────────────────── */

export const HL_SYMBOLS = [
    'R_10', 'R_25', 'R_50', 'R_75', 'R_100',
    '1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V',
];
const MAX_TICKS = 500;
const MIN_TICKS_FOR_ANALYSIS = 30;
export const SCAN_INTERVAL_MS = 200;
export const SNIPER_CHECK_MS = 200;

/* ══════════════════════════════════════════════════════════════════════════════
   PROFESSIONAL STRATEGY: "MOMENTUM IGNITION + EXHAUSTION AVOIDANCE
   
   Core insight: For 2-tick RUNHIGH/RUNLOW, we don't need complex indicators.
   We need to predict if the NEXT 2 ticks will continue in the same direction.
   
   The edge comes from:
   1. Catching momentum BUILDING (1-3 consecutive ticks = sweet spot)
   2. AVOIDING momentum EXHAUSTION (4+ consecutive = reversal likely)
   3. AVOIDING choppy markets (flat ticks = instant death)
   4. Entering during TRENDING periods (not ranging)
   
   The "trick": Momentum Strength Ratio
   - Measures how strong current momentum is vs recent average
   - Strong momentum (>1.5x avg) = high continuation probability
   - Weak momentum (<1x avg) = low continuation probability
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── Core math ──────────────────────────────────────────────────────────────── */

function ema(values: number[], period: number): number[] {
    if (values.length < period) return [];
    const k = 2 / (period + 1);
    const result: number[] = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    result.push(sum / period);
    for (let i = period; i < values.length; i++) {
        result.push((values[i] - result[result.length - 1]) * k + result[result.length - 1]);
    }
    return result;
}

function sma(values: number[], period: number): number {
    if (values.length < period) return values.length > 0 ? values[values.length - 1] : 0;
    let sum = 0;
    for (let i = values.length - period; i < values.length; i++) sum += values[i];
    return sum / period;
}

function stddev(values: number[], mean: number): number {
    if (values.length === 0) return 0;
    const sqDiffs = values.map(v => (v - mean) ** 2);
    return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/* ── RSI (only used for display, NOT for entry decisions) ───────────────────── */

function rsi(values: number[], period: number): number {
    if (values.length < period + 1) return 50;
    const gains: number[] = [];
    const losses: number[] = [];
    for (let i = 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? -diff : 0);
    }
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    }
    if (avgLoss === 0) return 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
}

/* ── Candle building ────────────────────────────────────────────────────────── */

export function buildCandles(prices: number[], times: number[]): Candle[] {
    if (prices.length < 2 || times.length < 2) return [];
    const candles: Candle[] = [];
    let current: Candle | null = null;
    const interval = 60;
    for (let i = 0; i < prices.length; i++) {
        const t = times[i];
        if (!t) continue;
        const minuteStart = Math.floor(t / interval) * interval;
        if (!current || current.time !== minuteStart) {
            if (current) candles.push(current);
            current = { open: prices[i], high: prices[i], low: prices[i], close: prices[i], time: minuteStart };
        } else {
            current.high = Math.max(current.high, prices[i]);
            current.low = Math.min(current.low, prices[i]);
            current.close = prices[i];
        }
    }
    if (current) candles.push(current);
    return candles;
}

/* ── TICK ANALYSIS ENGINE ─────────────────────────────────────────────────────
   This is the core of the strategy. We analyze raw ticks, not candles.
   Ticks are the fundamental unit for RUNHIGH/RUNLOW contracts.
   ══════════════════════════════════════════════════════════════════════════════ */

interface TickAnalysis {
    /* Direction detection */
    lastDirection: 'up' | 'down' | 'flat';
    consecUp: number;
    consecDown: number;
    consecFlat: number;

    /* Momentum strength (THE TRICK) */
    momentumRatio: number;     // current move / average move (1.0 = average, >1.5 = strong)
    momentumRaw: number;       // absolute move magnitude
    momentumAvg: number;       // average move over lookback

    /* Chop detection */
    flatTickRate: number;      // percentage of flat ticks in last N
    reversalRate: number;      // how often direction changes
    chopScore: number;         // combined chop indicator (0-1, higher = choppier)

    /* Trend detection */
    trendDirection: 'up' | 'down' | 'neutral';
    trendStrength: number;     // 0-100
    priceVsEma9: number;       // positive = above, negative = below
    priceVsEma21: number;

    /* Volatility */
    atr: number;
    volatility: number;        // normalized volatility

    /* Exhaustion detection */
    exhaustionRisk: number;    // 0-1, higher = more likely to reverse
    moveMagnitude: number;     // how big the recent moves are vs average
}

function analyzeTicks(prices: number[], _times: number[]): TickAnalysis {
    const n = prices.length;
    const empty: TickAnalysis = {
        lastDirection: 'flat', consecUp: 0, consecDown: 0, consecFlat: 0,
        momentumRatio: 0, momentumRaw: 0, momentumAvg: 0,
        flatTickRate: 0, reversalRate: 0, chopScore: 0,
        trendDirection: 'neutral', trendStrength: 0, priceVsEma9: 0, priceVsEma21: 0,
        atr: 0, volatility: 0, exhaustionRisk: 0, moveMagnitude: 0,
    };
    if (n < 10) return empty;

    /* ── 1. Direction detection (last tick) ── */
    const lastDiff = prices[n - 1] - prices[n - 2];
    const lastDirection: 'up' | 'down' | 'flat' = lastDiff > 0 ? 'up' : lastDiff < 0 ? 'down' : 'flat';

    /* ── 2. Consecutive direction count ── */
    let consecUp = 0, consecDown = 0, consecFlat = 0;
    for (let i = n - 1; i > 0; i--) {
        const diff = prices[i] - prices[i - 1];
        if (diff > 0) { consecUp++; consecDown = 0; consecFlat = 0; }
        else if (diff < 0) { consecDown++; consecUp = 0; consecFlat = 0; }
        else { consecFlat++; consecUp = 0; consecDown = 0; }
        if (i < n - 10) break; /* only count last 10 */
    }

    /* ── 3. Momentum strength ratio (THE TRICK) ── */
    const lookback = Math.min(30, n - 1);
    const recentMoves: number[] = [];
    for (let i = n - lookback; i < n; i++) {
        recentMoves.push(Math.abs(prices[i] - prices[i - 1]));
    }
    const momentumAvg = recentMoves.reduce((a, b) => a + b, 0) / recentMoves.length;
    const momentumRaw = Math.abs(lastDiff);
    const momentumRatio = momentumAvg > 0 ? momentumRaw / momentumAvg : 0;

    /* ── 4. Flat-tick detection ── */
    const flatLookback = Math.min(25, n - 1);
    let flatCount = 0;
    for (let i = n - flatLookback; i < n; i++) {
        if (prices[i] === prices[i - 1]) flatCount++;
    }
    const flatTickRate = flatCount / flatLookback;

    /* ── 5. Reversal rate (choppiness) ── */
    let reversals = 0;
    for (let i = n - flatLookback + 1; i < n; i++) {
        const prev = prices[i - 1] - prices[i - 2];
        const curr = prices[i] - prices[i - 1];
        if (prev * curr < 0 && prev !== 0 && curr !== 0) reversals++;
    }
    const reversalRate = flatLookback > 1 ? reversals / (flatLookback - 1) : 0;

    /* ── 6. Combined chop score ── */
    const chopScore = Math.min(1, (flatTickRate * 3 + reversalRate * 2) / 2);

    /* ── 7. Trend detection (EMA-based) ── */
    const ema9Arr = ema(prices, 9);
    const ema21Arr = ema(prices, 21);
    const ema9 = ema9Arr.length > 0 ? ema9Arr[ema9Arr.length - 1] : prices[n - 1];
    const ema21 = ema21Arr.length > 0 ? ema21Arr[ema21Arr.length - 1] : prices[n - 1];

    const priceVsEma9 = prices[n - 1] - ema9;
    const priceVsEma21 = prices[n - 1] - ema21;

    let trendDirection: 'up' | 'down' | 'neutral' = 'neutral';
    if (ema9 > ema21 && prices[n - 1] > ema9) trendDirection = 'up';
    else if (ema9 < ema21 && prices[n - 1] < ema9) trendDirection = 'down';

    /* ── 8. Trend strength ── */
    const emaGap = Math.abs(ema9 - ema21);
    const avgPrice = prices.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, n);
    const normalizedGap = avgPrice > 0 ? emaGap / avgPrice : 0;
    const trendStrength = Math.min(100, normalizedGap * 5000);

    /* ── 9. Volatility (ATR) ── */
    const atrLookback = Math.min(14, lookback);
    const moves: number[] = [];
    for (let i = n - atrLookback; i < n; i++) {
        moves.push(Math.abs(prices[i] - prices[i - 1]));
    }
    const atr = moves.reduce((a, b) => a + b, 0) / moves.length;
    const volatility = avgPrice > 0 ? atr / avgPrice : 0;

    /* ── 10. Exhaustion detection ── */
    const totalConsec = Math.max(consecUp, consecDown);
    const consecutiveMoves: number[] = [];
    for (let i = n - 1; i > Math.max(0, n - 8); i--) {
        consecutiveMoves.push(Math.abs(prices[i] - prices[i - 1]));
    }
    const avgRecentMove = consecutiveMoves.length > 0
        ? consecutiveMoves.reduce((a, b) => a + b, 0) / consecutiveMoves.length
        : 0;
    const moveMagnitude = momentumAvg > 0 ? avgRecentMove / momentumAvg : 0;

    /* Exhaustion increases with consecutive ticks AND decreasing move size */
    let exhaustionRisk = 0;
    if (totalConsec >= 5) exhaustionRisk = 0.9;
    else if (totalConsec >= 4) exhaustionRisk = 0.7;
    else if (totalConsec >= 3) exhaustionRisk = 0.4;
    if (moveMagnitude < 0.7 && totalConsec >= 2) exhaustionRisk += 0.2;
    exhaustionRisk = Math.min(1, exhaustionRisk);

    return {
        lastDirection, consecUp, consecDown, consecFlat,
        momentumRatio, momentumRaw, momentumAvg,
        flatTickRate, reversalRate, chopScore,
        trendDirection, trendStrength, priceVsEma9, priceVsEma21,
        atr, volatility, exhaustionRisk, moveMagnitude,
    };
}

/* ── ENTRY DECISION ENGINE ────────────────────────────────────────────────────
   This is where the professional strategy is applied.
   
   The logic:
   1. FILTER: Is the market tradeable? (no chop, trending)
   2. SIGNAL: Is momentum building? (consecutive ticks, strength ratio)
   3. TIMING: Is it the right moment? (not exhausted, not overextended)
   4. CONFIRM: Multiple conditions must align
   ══════════════════════════════════════════════════════════════════════════════ */

export function checkSniperEntry(
    direction: 'RUNHIGH' | 'RUNLOW',
    prices: number[],
): { trigger: boolean; reason: string; entryPrice: number } {
    const currentPrice = prices[prices.length - 1];
    const notrigger = { trigger: false, reason: '', entryPrice: currentPrice };

    if (prices.length < 15) return notrigger;

    const t = analyzeTicks(prices, []);

    /* ════════════════════════════════════════════════════════════════════════
       FILTER LAYER 1: CHOP AVOIDANCE (the #1 killer)
       If market is choppy, DO NOT TRADE. Period.
       ════════════════════════════════════════════════════════════════════════ */

    if (t.flatTickRate > 0.15) {
        return { ...notrigger, reason: `Chop: ${(t.flatTickRate * 100).toFixed(0)}% flat ticks` };
    }
    if (t.chopScore > 0.4) {
        return { ...notrigger, reason: `Choppy: ${(t.chopScore * 100).toFixed(0)}%` };
    }
    if (t.reversalRate > 0.35) {
        return { ...notrigger, reason: `Reversals: ${(t.reversalRate * 100).toFixed(0)}%` };
    }

    /* ════════════════════════════════════════════════════════════════════════
       FILTER LAYER 2: EXHAUSTION AVOIDANCE
       If momentum is exhausted (too many consecutive ticks), DON'T TRADE.
       ════════════════════════════════════════════════════════════════════════ */

    if (t.exhaustionRisk > 0.6) {
        return { ...notrigger, reason: `Exhausted: risk ${(t.exhaustionRisk * 100).toFixed(0)}%` };
    }

    if (direction === 'RUNHIGH') {
        /* For RUNHIGH: don't enter after 4+ consecutive UP ticks */
        if (t.consecUp >= 4) {
            return { ...notrigger, reason: `${t.consecUp} up in a row - exhaustion` };
        }
        /* Don't enter if last tick was DOWN (momentum broken) */
        if (t.lastDirection === 'down') {
            return { ...notrigger, reason: 'Last tick down - no momentum' };
        }
        /* Must have some upward momentum */
        if (t.consecUp < 1 && t.lastDirection !== 'up') {
            return { ...notrigger, reason: 'No upward momentum' };
        }
    }

    if (direction === 'RUNLOW') {
        if (t.consecDown >= 4) {
            return { ...notrigger, reason: `${t.consecDown} down in a row - exhaustion` };
        }
        if (t.lastDirection === 'up') {
            return { ...notrigger, reason: 'Last tick up - no momentum' };
        }
        if (t.consecDown < 1 && t.lastDirection !== 'down') {
            return { ...notrigger, reason: 'No downward momentum' };
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
       FILTER LAYER 3: TREND CONFIRMATION
       Price should be on the right side of EMAs.
       ════════════════════════════════════════════════════════════════════════ */

    if (direction === 'RUNHIGH') {
        /* Price should be above EMA9 or at least EMA9 > EMA21 */
        if (t.priceVsEma9 < -t.atr * 0.5 && t.trendDirection !== 'up') {
            return { ...notrigger, reason: `Price below EMA9 (${t.priceVsEma9.toFixed(4)})` };
        }
    }

    if (direction === 'RUNLOW') {
        if (t.priceVsEma9 > t.atr * 0.5 && t.trendDirection !== 'down') {
            return { ...notrigger, reason: `Price above EMA9 (${t.priceVsEma9.toFixed(4)})` };
        }
    }

    /* ════════════════════════════════════════════════════════════════════════
       SIGNAL: MOMENTUM STRENGTH CHECK
       The momentum must be strong enough to justify entry.
       ════════════════════════════════════════════════════════════════════════ */

    if (t.momentumRatio < 0.5) {
        return { ...notrigger, reason: `Weak momentum (${t.momentumRatio.toFixed(2)}x)` };
    }

    /* ════════════════════════════════════════════════════════════════════════
       ENTRY: ALL FILTERS PASSED
       ════════════════════════════════════════════════════════════════════════ */

    const reason = `Entry: consec=${direction === 'RUNHIGH' ? t.consecUp : t.consecDown} mom=${t.momentumRatio.toFixed(1)}x chop=${(t.chopScore * 100).toFixed(0)}%`;
    return { trigger: true, reason, entryPrice: currentPrice };
}

/* ── Duration: always 2 ticks (the proven sweet spot) ───────────────────────── */

export function calcDuration(_atr: number, _price: number, _velocity?: number, _slopeAccel?: number): number {
    return 2;
}

/* ── Market analysis ────────────────────────────────────────────────────────── */

export function analyzeMarket(
    symbol: string,
    prices: number[],
    _candlesM1: Candle[],
): MarketScore {
    const reasons: string[] = [];
    let confidence = 0;
    let direction: 'RUNHIGH' | 'RUNLOW' | null = null;

    if (prices.length < MIN_TICKS_FOR_ANALYSIS) {
        return { symbol, direction: null, confidence: 0, reasons: ['Not enough data'], indicators: defaultIndicators(), trendM1: 'neutral', trendM5: 'neutral', trendM15: 'neutral', flatTickRate: 0, momentumStrength: 0, noiseLevel: 0 };
    }

    const t = analyzeTicks(prices, []);

    /* ════════════════════════════════════════════════════════════════════════
       FILTER 1: CHOP AVOIDANCE
       ════════════════════════════════════════════════════════════════════════ */

    if (t.flatTickRate > 0.2) {
        reasons.push(`High flat rate ${(t.flatTickRate * 100).toFixed(0)}%`);
        return buildScore(symbol, null, 0, reasons, t, _candlesM1);
    }
    if (t.chopScore > 0.5) {
        reasons.push(`Too choppy ${(t.chopScore * 100).toFixed(0)}%`);
        return buildScore(symbol, null, 0, reasons, t, _candlesM1);
    }
    if (t.reversalRate > 0.4) {
        reasons.push(`High reversals ${(t.reversalRate * 100).toFixed(0)}%`);
        return buildScore(symbol, null, 0, reasons, t, _candlesM1);
    }

    /* ════════════════════════════════════════════════════════════════════════
       FILTER 2: EXHAUSTION AVOIDANCE
       ════════════════════════════════════════════════════════════════════════ */

    if (t.exhaustionRisk > 0.7) {
        reasons.push(`Exhausted ${(t.exhaustionRisk * 100).toFixed(0)}%`);
        return buildScore(symbol, null, 0, reasons, t, _candlesM1);
    }

    /* ════════════════════════════════════════════════════════════════════════
       SCORING: Build confidence based on multiple factors
       ════════════════════════════════════════════════════════════════════════ */

    /* Factor 1: Trend alignment (0-25 points) */
    if (t.trendDirection === 'up') { confidence += 25; reasons.push('EMA bull'); }
    else if (t.trendDirection === 'down') { confidence += 25; reasons.push('EMA bear'); }
    else if (t.priceVsEma9 > 0) { confidence += 10; reasons.push('Above EMA9'); }
    else if (t.priceVsEma9 < 0) { confidence += 10; reasons.push('Below EMA9'); }

    /* Factor 2: Momentum strength (0-25 points) — THE TRICK */
    if (t.momentumRatio > 2.0) { confidence += 25; reasons.push(`Strong mom ${t.momentumRatio.toFixed(1)}x`); }
    else if (t.momentumRatio > 1.5) { confidence += 20; reasons.push(`Good mom ${t.momentumRatio.toFixed(1)}x`); }
    else if (t.momentumRatio > 1.0) { confidence += 12; reasons.push(`Avg mom ${t.momentumRatio.toFixed(1)}x`); }
    else if (t.momentumRatio > 0.7) { confidence += 5; reasons.push(`Weak mom ${t.momentumRatio.toFixed(1)}x`); }

    /* Factor 3: Consecutive direction (0-20 points) — sweet spot is 2-3 */
    if (direction === null) {
        /* Determine direction from momentum */
        if (t.consecUp >= 1 && t.consecUp <= 3 && t.lastDirection === 'up') {
            confidence += 15;
            reasons.push(`${t.consecUp} cons up`);
        }
        if (t.consecDown >= 1 && t.consecDown <= 3 && t.lastDirection === 'down') {
            confidence += 15;
            reasons.push(`${t.consecDown} cons down`);
        }
    }

    /* Factor 4: Chop avoidance bonus (0-15 points) */
    if (t.flatTickRate < 0.05) { confidence += 15; reasons.push('Clean ticks'); }
    else if (t.flatTickRate < 0.1) { confidence += 10; reasons.push('Low flat'); }
    else if (t.flatTickRate < 0.15) { confidence += 5; reasons.push('OK flat'); }

    /* Factor 5: Low exhaustion (0-15 points) */
    if (t.exhaustionRisk < 0.2) { confidence += 15; reasons.push('Fresh momentum'); }
    else if (t.exhaustionRisk < 0.4) { confidence += 10; reasons.push('Moderate'); }

    /* Penalty: chop */
    if (t.chopScore > 0.3) { confidence -= 15; reasons.push('Chop penalty'); }
    if (t.reversalRate > 0.3) { confidence -= 10; reasons.push('Reversal penalty'); }

    /* ════════════════════════════════════════════════════════════════════════
       DIRECTION ASSIGNMENT
       ════════════════════════════════════════════════════════════════════════ */

    confidence = Math.min(100, Math.max(0, confidence));

    if (confidence >= 40) {
        if (t.trendDirection === 'up' || (t.consecUp >= 2 && t.lastDirection === 'up')) {
            direction = 'RUNHIGH';
        } else if (t.trendDirection === 'down' || (t.consecDown >= 2 && t.lastDirection === 'down')) {
            direction = 'RUNLOW';
        } else if (t.lastDirection === 'up') {
            direction = 'RUNHIGH';
        } else if (t.lastDirection === 'down') {
            direction = 'RUNLOW';
        }
    }

    return buildScore(symbol, direction, confidence, reasons, t, _candlesM1);
}

function buildScore(
    symbol: string,
    direction: 'RUNHIGH' | 'RUNLOW' | null,
    confidence: number,
    reasons: string[],
    t: TickAnalysis,
    _candlesM1: Candle[],
): MarketScore {
    /* Compute display indicators */
    const closesM1 = _candlesM1.map(c => c.close);
    const rsiVal = rsi(closesM1, 14);
    const ema9Arr = ema(closesM1.length > 0 ? closesM1 : [0], 9);
    const ema21Arr = ema(closesM1.length > 0 ? closesM1 : [0], 21);
    const ema50Arr = ema(closesM1.length > 0 ? closesM1 : [0], 50);
    const ema9 = ema9Arr.length > 0 ? ema9Arr[ema9Arr.length - 1] : 0;
    const ema21 = ema21Arr.length > 0 ? ema21Arr[ema21Arr.length - 1] : 0;
    const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : 0;

    /* Simple ADX approximation from price data */
    const n = closesM1.length;
    let plusDM = 0, minusDM = 0, trSum = 0;
    for (let i = Math.max(1, n - 14); i < n; i++) {
        const up = closesM1[i] - closesM1[i - 1];
        const down = closesM1[i - 1] - closesM1[i];
        if (up > down && up > 0) plusDM += up;
        else if (down > up && down > 0) minusDM += down;
        trSum += Math.abs(closesM1[i] - closesM1[i - 1]);
    }
    const adxVal = trSum > 0 ? Math.abs(plusDM - minusDM) / trSum * 100 : 0;

    /* Bollinger */
    const bbMiddle = sma(closesM1, 20);
    const bbSd = stddev(closesM1.slice(-20), bbMiddle);
    const bbUpper = bbMiddle + 2 * bbSd;
    const bbLower = bbMiddle - 2 * bbSd;

    /* ATR */
    const atrVal = t.atr;

    /* S/R */
    const recent50 = closesM1.length > 0 ? closesM1.slice(-50) : [0];
    const support = Math.min(...recent50);
    const resistance = Math.max(...recent50);

    return {
        symbol, direction, confidence, reasons,
        indicators: {
            ema9, ema21, ema50,
            rsi: rsiVal,
            macd: 0, macdSignal: 0, macdHistogram: 0,
            adx: adxVal,
            bbUpper, bbMiddle, bbLower,
            atr: atrVal,
            support, resistance,
            consecUp: t.consecUp,
            consecDown: t.consecDown,
            momentumStrength: t.momentumRatio,
            chopLevel: t.chopScore,
        },
        trendM1: t.trendDirection === 'up' ? 'bullish' : t.trendDirection === 'down' ? 'bearish' : 'neutral',
        trendM5: 'neutral',
        trendM15: 'neutral',
        flatTickRate: t.flatTickRate,
        momentumStrength: t.momentumRatio,
        noiseLevel: t.chopScore,
    };
}

function defaultIndicators(): IndicatorValues {
    return {
        ema9: 0, ema21: 0, ema50: 0,
        rsi: 50,
        macd: 0, macdSignal: 0, macdHistogram: 0,
        adx: 0,
        bbUpper: 0, bbMiddle: 0, bbLower: 0,
        atr: 0,
        support: 0, resistance: 0,
        consecUp: 0, consecDown: 0,
        momentumStrength: 0,
        chopLevel: 0,
    };
}

/* ── Trade execution ────────────────────────────────────────────────────────── */

export async function executeHighLowTrade(
    symbol: string, direction: 'RUNHIGH' | 'RUNLOW', stake: number, duration: number,
): Promise<{ contractId: string | null }> {
    const safeStake = Math.max(0.35, stake);
    const params = {
        amount: safeStake, basis: 'stake', currency: 'USD',
        duration, duration_unit: 't',
        symbol, contract_type: direction,
    };
    try {
        const response = await sendViaNewSystemWithPromise({ buy: 1, price: safeStake, parameters: params });
        if (response?.error) {
            console.warn('[HL] Trade error:', response.error);
            return { contractId: null };
        }
        const contractId = response?.buy?.contract_id ?? response?.contract_id;
        return { contractId: contractId ? String(contractId) : null };
    } catch (e: any) {
        console.warn('[HL] Trade exception:', e?.error || e?.message || e);
        return { contractId: null };
    }
}

/* ── Market scan orchestrator ───────────────────────────────────────────────── */

export interface SymbolData {
    ticks: number[];
    prices: number[];
    times: number[];
    candles: Candle[];
    ready: boolean;
}

export function runMarketScan(
    symbolData: Record<string, SymbolData>,
    config: HighLowConfig,
): { selected: MarketScore | null } {
    const scores: MarketScore[] = [];

    for (const sym of HL_SYMBOLS) {
        const sd = symbolData[sym];
        if (!sd || !sd.ready || sd.prices.length < MIN_TICKS_FOR_ANALYSIS) continue;

        const candles = buildCandles(sd.prices, sd.times);
        if (candles.length < 2) continue;

        const score = analyzeMarket(sym, sd.prices, candles);
        scores.push(score);
    }

    scores.sort((a, b) => b.confidence - a.confidence);

    const eligible = scores.filter(s => s.direction && s.confidence >= config.minConfidence);
    const selected = eligible.length > 0 ? eligible[0] : null;

    return { selected };
}
