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
const MIN_TICKS_FOR_ANALYSIS = 15;
export const SCAN_INTERVAL_MS = 200;
export const SNIPER_CHECK_MS = 200;

/* ══════════════════════════════════════════════════════════════════════════════
   PURE TICK MOMENTUM STRATEGY
   
   For 2-tick RUNHIGH/RUNLOW, the ONLY thing that matters:
   1. Is there momentum in one direction? (last tick moved)
   2. Is the market choppy? (flat ticks = death)
   3. Is momentum exhausted? (too many consecutive)
   
   Everything else is noise. Speed is everything.
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

/* ══════════════════════════════════════════════════════════════════════════════
   FAST ENTRY — runs on EVERY tick for EVERY symbol
   No scanning, no aiming, no delay. Detect and fire.
   ══════════════════════════════════════════════════════════════════════════════ */

export interface FastSignal {
    action: 'RUNHIGH' | 'RUNLOW' | 'skip';
    confidence: number;
    reason: string;
    flatTickRate: number;
    consecCount: number;
}

export function detectFastSignal(prices: number[]): FastSignal {
    const n = prices.length;
    const skip: FastSignal = { action: 'skip', confidence: 0, reason: '', flatTickRate: 0, consecCount: 0 };

    if (n < MIN_TICKS_FOR_ANALYSIS) return { ...skip, reason: 'Not enough ticks' };

    const last = prices[n - 1];
    const prev = prices[n - 2];
    const diff = last - prev;

    /* ── FLAT TICK = instant skip (the #1 killer) ── */
    if (diff === 0) return { ...skip, reason: 'Flat tick' };

    const dir = diff > 0 ? 1 : -1;

    /* ── CHOP FILTER: count flat ticks in last 15 ── */
    const chopWindow = Math.min(15, n - 1);
    let flatCount = 0;
    for (let i = n - chopWindow; i < n; i++) {
        if (prices[i] === prices[i - 1]) flatCount++;
    }
    const flatTickRate = flatCount / chopWindow;
    if (flatTickRate > 0.2) return { ...skip, reason: `Chop ${(flatTickRate * 100).toFixed(0)}%`, flatTickRate };

    /* ── EXHAUSTION: count consecutive ticks in same direction ── */
    let consec = 0;
    for (let i = n - 1; i > 0; i--) {
        const d = prices[i] - prices[i - 1];
        if ((dir > 0 && d > 0) || (dir < 0 && d < 0)) consec++;
        else break;
    }

    /* Don't enter after 4+ consecutive — reversal likely */
    if (consec >= 4) return { ...skip, reason: `Exhausted (${consec} cons)`, flatTickRate, consecCount: consec };

    /* ── MOMENTUM: need at least 1 consecutive tick in direction ── */
    if (consec < 1) return { ...skip, reason: 'No momentum', flatTickRate, consecCount: consec };

    /* ── CONFIDENCE: based on consecutive count and chop level ── */
    let confidence = 50;
    /* Bonus for 2-3 consecutive (sweet spot) */
    if (consec === 2) confidence += 15;
    else if (consec === 3) confidence += 25;
    /* Penalty for chop */
    if (flatTickRate > 0.1) confidence -= 10;
    /* Bonus for clean ticks */
    if (flatTickRate < 0.05) confidence += 10;

    confidence = Math.min(100, Math.max(0, confidence));

    const action = dir > 0 ? 'RUNHIGH' : 'RUNLOW';
    const reason = `${dir > 0 ? 'UP' : 'DOWN'} ${consec} cons | chop ${(flatTickRate * 100).toFixed(0)}%`;

    return { action, confidence, reason, flatTickRate, consecCount: consec };
}

/* ── Sniper entry (for backward compat with aiming mode) ────────────────────── */

export function checkSniperEntry(
    direction: 'RUNHIGH' | 'RUNLOW',
    prices: number[],
): { trigger: boolean; reason: string; entryPrice: number } {
    const currentPrice = prices[prices.length - 1];
    const signal = detectFastSignal(prices);

    if (signal.action === 'skip') {
        return { trigger: false, reason: signal.reason, entryPrice: currentPrice };
    }

    if (signal.action === direction) {
        return { trigger: true, reason: signal.reason, entryPrice: currentPrice };
    }

    return { trigger: false, reason: `Direction mismatch: want ${direction}`, entryPrice: currentPrice };
}

/* ── Duration: always 2 ticks ───────────────────────────────────────────────── */

export function calcDuration(_atr: number, _price: number, _velocity?: number, _slopeAccel?: number): number {
    return 2;
}

/* ── Market analysis (for scan mode — select best symbol) ───────────────────── */

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

    const signal = detectFastSignal(prices);

    if (signal.action === 'skip') {
        return { symbol, direction: null, confidence: 0, reasons: [signal.reason], indicators: defaultIndicators(), trendM1: 'neutral', trendM5: 'neutral', trendM15: 'neutral', flatTickRate: signal.flatTickRate, momentumStrength: 0, noiseLevel: signal.flatTickRate };
    }

    direction = signal.action;
    confidence = signal.confidence;
    reasons.push(signal.reason);

    const closesM1 = _candlesM1.map(c => c.close);
    const rsiVal = rsi(closesM1.length > 0 ? closesM1 : [0], 14);
    const ema9Arr = ema(closesM1.length > 0 ? closesM1 : [0], 9);
    const ema21Arr = ema(closesM1.length > 0 ? closesM1 : [0], 21);
    const ema50Arr = ema(closesM1.length > 0 ? closesM1 : [0], 50);
    const ema9 = ema9Arr.length > 0 ? ema9Arr[ema9Arr.length - 1] : 0;
    const ema21 = ema21Arr.length > 0 ? ema21Arr[ema21Arr.length - 1] : 0;
    const ema50 = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : 0;

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

    const bbMiddle = sma(closesM1, 20);
    const bbSd = stddev(closesM1.slice(-20), bbMiddle);
    const bbUpper = bbMiddle + 2 * bbSd;
    const bbLower = bbMiddle - 2 * bbSd;

    const atrLookback = Math.min(14, prices.length - 1);
    let atrSum = 0;
    for (let i = prices.length - atrLookback; i < prices.length; i++) {
        atrSum += Math.abs(prices[i] - prices[i - 1]);
    }
    const atrVal = atrLookback > 0 ? atrSum / atrLookback : 0;

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
            consecUp: signal.action === 'RUNHIGH' ? signal.consecCount : 0,
            consecDown: signal.action === 'RUNLOW' ? signal.consecCount : 0,
            momentumStrength: signal.confidence / 100,
            chopLevel: signal.flatTickRate,
        },
        trendM1: 'neutral',
        trendM5: 'neutral',
        trendM15: 'neutral',
        flatTickRate: signal.flatTickRate,
        momentumStrength: signal.confidence / 100,
        noiseLevel: signal.flatTickRate,
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
        const score = analyzeMarket(sym, sd.prices, candles);
        scores.push(score);
    }

    scores.sort((a, b) => b.confidence - a.confidence);

    const eligible = scores.filter(s => s.direction && s.confidence >= config.minConfidence);
    const selected = eligible.length > 0 ? eligible[0] : null;

    return { selected };
}
