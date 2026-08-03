import { SYMBOL_LABELS, PIP_SIZES } from './makoti-ws';
import { sendViaNewSystemWithPromise } from '@/auth/NewDerivAuth';

/* ── Types ──────────────────────────────────────────────────────────────────── */

export interface Candle {
    open: number; high: number; low: number; close: number; time: number;
}

export interface IndicatorValues {
    ema20: number; ema50: number; ema100: number;
    rsi: number;
    macd: number; macdSignal: number; macdHistogram: number;
    adx: number;
    bbUpper: number; bbMiddle: number; bbLower: number;
    atr: number;
    support: number; resistance: number;
    last70Slope: number;
    last70Strength: number;
    consecUp: number;
    consecDown: number;
    cci: number;
    slopeAccel: number;
    momentumConviction: number;
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
    minConfidence: 85,
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

/* ── Pure indicator math ────────────────────────────────────────────────────── */

function ema(values: number[], period: number): number[] {
    if (values.length < period) return [];
    const multiplier = 2 / (period + 1);
    const result: number[] = [];
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    result.push(sum / period);
    for (let i = period; i < values.length; i++) {
        result.push((values[i] - result[result.length - 1]) * multiplier + result[result.length - 1]);
    }
    return result;
}

function sma(values: number[], period: number): number[] {
    if (values.length < period) return [];
    const result: number[] = [];
    for (let i = period - 1; i < values.length; i++) {
        let sum = 0;
        for (let j = i - period + 1; j <= i; j++) sum += values[j];
        result.push(sum / period);
    }
    return result;
}

function stddev(values: number[], mean: number): number {
    const sqDiffs = values.map(v => (v - mean) ** 2);
    return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

function rsi(values: number[], period: number): number[] {
    if (values.length < period + 1) return [];
    const gains: number[] = [];
    const losses: number[] = [];
    for (let i = 1; i < values.length; i++) {
        const diff = values[i] - values[i - 1];
        gains.push(diff > 0 ? diff : 0);
        losses.push(diff < 0 ? -diff : 0);
    }
    const result: number[] = [];
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    if (avgLoss === 0) { result.push(100); } else { result.push(100 - 100 / (1 + avgGain / avgLoss)); }
    for (let i = period; i < gains.length; i++) {
        avgGain = (avgGain * (period - 1) + gains[i]) / period;
        avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
        if (avgLoss === 0) { result.push(100); } else { result.push(100 - 100 / (1 + avgGain / avgLoss)); }
    }
    return result;
}

function macd(values: number[]): { macd: number[]; signal: number[]; histogram: number[] } {
    const ema12 = ema(values, 12);
    const ema26 = ema(values, 26);
    const minLen = Math.min(ema12.length, ema26.length);
    const offset12 = ema12.length - minLen;
    const offset26 = ema26.length - minLen;
    const macdLine: number[] = [];
    for (let i = 0; i < minLen; i++) macdLine.push(ema12[offset12 + i] - ema26[offset26 + i]);
    const signal = ema(macdLine, 9);
    const sigOffset = macdLine.length - signal.length;
    const histogram: number[] = [];
    for (let i = 0; i < signal.length; i++) histogram.push(macdLine[sigOffset + i] - signal[i]);
    return { macd: macdLine, signal, histogram };
}

function adx(candles: Candle[], period: number): number {
    if (candles.length < period + 1) return 0;
    const tr: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        const upMove = h - candles[i - 1].high;
        const downMove = candles[i - 1].low - l;
        plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }
    const smoothen = (arr: number[]) => {
        let first = arr.slice(0, period).reduce((a, b) => a + b, 0);
        const smoothed = [first];
        for (let i = period; i < arr.length; i++) {
            first = first - first / period + arr[i];
            smoothed.push(first);
        }
        return smoothed;
    };
    const atrArr = smoothen(tr);
    const sdPlus = smoothen(plusDM);
    const sdMinus = smoothen(minusDM);
    const dx: number[] = [];
    for (let i = 0; i < atrArr.length; i++) {
        if (atrArr[i] === 0) continue;
        const pDI = (sdPlus[i] / atrArr[i]) * 100;
        const mDI = (sdMinus[i] / atrArr[i]) * 100;
        const sum = pDI + mDI;
        if (sum === 0) continue;
        dx.push(Math.abs(pDI - mDI) / sum * 100);
    }
    if (dx.length < period) return 0;
    return dx.slice(dx.length - period).reduce((a, b) => a + b, 0) / period;
}

function bollinger(values: number[], period: number, multiplier: number) {
    if (values.length < period) return { upper: 0, middle: 0, lower: 0 };
    const middle = values.slice(values.length - period).reduce((a, b) => a + b, 0) / period;
    const sd = stddev(values.slice(values.length - period), middle);
    return { upper: middle + multiplier * sd, middle, lower: middle - multiplier * sd };
}

function calcATR(candles: Candle[], period: number): number {
    if (candles.length < period + 1) return 0;
    const tr: number[] = [];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high, l = candles[i].low, pc = candles[i - 1].close;
        tr.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    return tr.slice(tr.length - period).reduce((a, b) => a + b, 0) / period;
}

/* ── CCI (Commodity Channel Index) ──────────────────────────────────────────── */

function cci(prices: number[], period: number): number {
    if (prices.length < period) return 0;
    const data = prices.slice(-period);
    const tp = data.map(p => p);
    const mean = tp.reduce((a, b) => a + b, 0) / period;
    const mad = tp.reduce((sum, v) => sum + Math.abs(v - mean), 0) / period;
    if (mad === 0) return 0;
    return (tp[tp.length - 1] - mean) / (0.015 * mad);
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

export function aggregateCandles(candles: Candle[], factor: number): Candle[] {
    const result: Candle[] = [];
    for (let i = 0; i < candles.length; i += factor) {
        const slice = candles.slice(i, i + factor);
        if (slice.length === 0) continue;
        result.push({
            open: slice[0].open,
            high: Math.max(...slice.map(c => c.high)),
            low: Math.min(...slice.map(c => c.low)),
            close: slice[slice.length - 1].close,
            time: slice[0].time,
        });
    }
    return result;
}

/* ── Support & Resistance ───────────────────────────────────────────────────── */

function findSR(prices: number[]): { support: number; resistance: number } {
    if (prices.length < 20) return { support: Math.min(...prices), resistance: Math.max(...prices) };
    const recent = prices.slice(-50);
    const window = 5;
    const highs: number[] = [];
    const lows: number[] = [];
    for (let i = window; i < recent.length - window; i++) {
        let isHigh = true, isLow = true;
        for (let j = i - window; j <= i + window; j++) {
            if (j === i) continue;
            if (recent[j] > recent[i]) isHigh = false;
            if (recent[j] < recent[i]) isLow = false;
        }
        if (isHigh) highs.push(recent[i]);
        if (isLow) lows.push(recent[i]);
    }
    const resistance = highs.length > 0 ? highs.reduce((a, b) => a + b, 0) / highs.length : Math.max(...recent);
    const support = lows.length > 0 ? lows.reduce((a, b) => a + b, 0) / lows.length : Math.min(...recent);
    return { support, resistance };
}

/* ── Price action patterns ──────────────────────────────────────────────────── */

function detectCandlePattern(candles: Candle[]): 'bullish_engulfing' | 'bearish_engulfing' | 'pin_bar' | 'none' {
    if (candles.length < 2) return 'none';
    const c = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const body = Math.abs(c.close - c.open);
    const upperWick = c.high - Math.max(c.open, c.close);
    const lowerWick = Math.min(c.open, c.close) - c.low;

    if (prev.close < prev.open && c.close > c.open && c.open < prev.close && c.close > prev.open) return 'bullish_engulfing';
    if (prev.close > prev.open && c.close < c.open && c.open > prev.close && c.close < prev.open) return 'bearish_engulfing';
    if (body > 0 && (upperWick > body * 2 || lowerWick > body * 2)) return 'pin_bar';
    return 'none';
}

/* ── Trend detection ────────────────────────────────────────────────────────── */

function getTrend(closes: number[], ema20: number, ema50: number, ema100: number): 'bullish' | 'bearish' | 'neutral' {
    if (ema20 > ema50 && ema50 > ema100) return 'bullish';
    if (ema20 < ema50 && ema50 < ema100) return 'bearish';
    return 'neutral';
}

/* ── Flat-tick detection (the #1 killer of Only Ups/Only Downs) ────────────── */

function calcFlatTickRate(ticks: number[], lookback: number = 20): number {
    if (ticks.length < 2) return 0;
    const recent = ticks.slice(-lookback);
    let flats = 0;
    for (let i = 1; i < recent.length; i++) {
        if (recent[i] === recent[i - 1]) flats++;
    }
    return flats / (recent.length - 1);
}

function calcMicroFluctuation(prices: number[], lookback: number = 20): number {
    if (prices.length < 2) return 0;
    const recent = prices.slice(-lookback);
    let reversals = 0;
    for (let i = 2; i < recent.length; i++) {
        const dir1 = recent[i - 1] - recent[i - 2];
        const dir2 = recent[i] - recent[i - 1];
        if (dir1 * dir2 < 0) reversals++;
    }
    return reversals / (recent.length - 2);
}

/* ── Pure momentum strength (independent of slope) ──────────────────────────── */

function calcMomentumStrength(prices: number[], lookback: number = 30): { strength: number; direction: 'up' | 'down' | 'neutral' } {
    if (prices.length < 5) return { strength: 0, direction: 'neutral' };
    const recent = prices.slice(-lookback);
    const n = recent.length;

    /* consecutive direction count */
    let consecUp = 0, consecDown = 0;
    for (let i = n - 1; i > 0; i--) {
        if (recent[i] > recent[i - 1]) { consecUp++; consecDown = 0; }
        else if (recent[i] < recent[i - 1]) { consecDown++; consecUp = 0; }
        else break;
    }

    /* recent move magnitude vs volatility */
    const range = Math.max(...recent) - Math.min(...recent);
    const avgPrice = recent.reduce((a, b) => a + b, 0) / n;
    const normalizedRange = range / avgPrice;

    /* how often price moved in the same direction in last 10 */
    const last10 = recent.slice(-10);
    let sameDir = 0;
    for (let i = 1; i < last10.length; i++) {
        if (last10[i] > last10[i - 1]) sameDir++;
    }
    const upRatio = sameDir / (last10.length - 1);

    const upStrength = (consecUp / Math.min(n, 10)) * 40 + (normalizedRange * 1000) * 30 + (upRatio) * 30;
    const downStrength = ((last10.length - 1 - sameDir) / (last10.length - 1)) * 40 + (normalizedRange * 1000) * 30 + ((1 - upRatio)) * 30;

    const strength = Math.min(100, Math.max(upStrength, downStrength));
    const direction = upStrength > downStrength ? 'up' : downStrength > upStrength ? 'down' : 'neutral';

    return { strength, direction };
}

/* ── Stochastic oscillator ──────────────────────────────────────────────────── */

function stochastic(candles: Candle[], kPeriod: number = 14, dPeriod: number = 3): { k: number; d: number } {
    if (candles.length < kPeriod) return { k: 50, d: 50 };
    const recent = candles.slice(-kPeriod);
    const highest = Math.max(...recent.map(c => c.high));
    const lowest = Math.min(...recent.map(c => c.low));
    const currentClose = candles[candles.length - 1].close;
    const k = highest === lowest ? 50 : ((currentClose - lowest) / (highest - lowest)) * 100;
    const d = k; // simplified: %D = SMA of %K, but with single candle we approximate
    return { k, d };
}

/* ── Last N ticks analysis — multi-factor direction scoring ─────────────────── */

function analyzeLast70(prices: number[]): {
    slope: number;
    direction: 'up' | 'down' | 'neutral';
    strength: number;
    ema5: number;
    ema13: number;
    ema5Above13: boolean;
    lastPeakPrice: number;
    lastDipPrice: number;
    peaks: { price: number; idx: number }[];
    dips: { price: number; idx: number }[];
    consecUp: number;
    consecDown: number;
    pullbackFromPeak: number;
    bounceFromDip: number;
    velocity: number;
    slopeAccel: number;
    momentumConviction: number;
    flatTickRate: number;
    microFluctuation: number;
} {
    const empty = {
        slope: 0, direction: 'neutral' as const, strength: 0,
        ema5: 0, ema13: 0, ema5Above13: false,
        lastPeakPrice: 0, lastDipPrice: 0,
        peaks: [] as { price: number; idx: number }[],
        dips: [] as { price: number; idx: number }[],
        consecUp: 0, consecDown: 0,
        pullbackFromPeak: 0, bounceFromDip: 0,
        velocity: 0, slopeAccel: 0, momentumConviction: 0,
        flatTickRate: 0, microFluctuation: 0,
    };

    if (prices.length < 10) return empty;

    const data = prices.slice(-70);
    const n = data.length;

    /* ── Linear regression slope on last 70 ── */
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) {
        sumX += i;
        sumY += data[i];
        sumXY += i * data[i];
        sumX2 += i * i;
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    /* ── Slope acceleration: slope of second half vs first half ── */
    const half = Math.floor(n / 2);
    let sumX1 = 0, sumY1 = 0, sumXY1 = 0, sumX21 = 0;
    for (let i = 0; i < half; i++) {
        sumX1 += i; sumY1 += data[i]; sumXY1 += i * data[i]; sumX21 += i * i;
    }
    const slope1 = (half * sumXY1 - sumX1 * sumY1) / (half * sumX21 - sumX1 * sumX1);
    const n2 = n - half;
    let sumX2_ = 0, sumY2 = 0, sumXY2 = 0, sumX22 = 0;
    for (let i = 0; i < n2; i++) {
        const idx = half + i;
        sumX2_ += i; sumY2 += data[idx]; sumXY2 += i * data[idx]; sumX22 += i * i;
    }
    const slope2 = (n2 * sumXY2 - sumX2_ * sumY2) / (n2 * sumX22 - sumX2_ * sumX2_);
    const slopeAccel = slope2 - slope1;

    /* ── Direction + strength ── */
    const direction = slope > 0.0001 ? 'up' as const : slope < -0.0001 ? 'down' as const : 'neutral' as const;
    const residuals = data.map((y, i) => Math.abs(y - (slope * i + intercept)));
    const mae = residuals.reduce((a, b) => a + b, 0) / n;
    const avgPrice = data.reduce((a, b) => a + b, 0) / n;
    const fitQuality = avgPrice > 0 ? Math.max(0, 1 - mae / (avgPrice * 0.01)) : 0;
    const slopeStrength = Math.min(1, Math.abs(slope) / 0.0005);
    const strength = Math.round(Math.min(100, (slopeStrength * 50 + fitQuality * 50)));

    /* ── EMA(5) and EMA(13) on tick prices ── */
    const ema5Arr = ema(data, 5);
    const ema13Arr = ema(data, 13);
    const ema5 = ema5Arr.length > 0 ? ema5Arr[ema5Arr.length - 1] : data[data.length - 1];
    const ema13 = ema13Arr.length > 0 ? ema13Arr[ema13Arr.length - 1] : data[data.length - 1];
    const ema5Above13 = ema5 > ema13;
    const emaGap = Math.abs(ema5 - ema13);

    /* ── Momentum conviction: how strongly ema5 and slope agree ── */
    const slopeDir = slope > 0 ? 1 : slope < 0 ? -1 : 0;
    const emaDir = ema5Above13 ? 1 : -1;
    const agreement = slopeDir === emaDir ? 1 : -1;
    const momentumConviction = agreement * Math.min(1, (Math.abs(slope) / 0.0003 + emaGap / avgPrice * 50));

    /* ── Consecutive direction count in last 10 ── */
    const last10 = data.slice(-10);
    let consecUp = 0, consecDown = 0;
    for (let i = last10.length - 1; i > 0; i--) {
        if (last10[i] > last10[i - 1]) { consecUp++; consecDown = 0; }
        else if (last10[i] < last10[i - 1]) { consecDown++; consecUp = 0; }
        else break;
    }

    /* ── Micro-peaks and dips (local extrema in last 30 ticks) ── */
    const recent30 = data.slice(-30);
    const peaks: { price: number; idx: number }[] = [];
    const dips: { price: number; idx: number }[] = [];
    const lookback = 3;
    for (let i = lookback; i < recent30.length - lookback; i++) {
        let isPeak = true, isDip = true;
        for (let j = i - lookback; j <= i + lookback; j++) {
            if (j === i) continue;
            if (recent30[j] > recent30[i]) isPeak = false;
            if (recent30[j] < recent30[i]) isDip = false;
        }
        if (isPeak) peaks.push({ price: recent30[i], idx: data.length - 30 + i });
        if (isDip) dips.push({ price: recent30[i], idx: data.length - 30 + i });
    }

    const lastPeakPrice = peaks.length > 0 ? Math.max(...peaks.map(p => p.price)) : Math.max(...data);
    const lastDipPrice = dips.length > 0 ? Math.min(...dips.map(d => d.price)) : Math.min(...data);

    /* ── Pullback / bounce from extremes ── */
    const currentPrice = data[data.length - 1];
    const pullbackFromPeak = lastPeakPrice > 0 ? ((lastPeakPrice - currentPrice) / lastPeakPrice) * 100 : 0;
    const bounceFromDip = lastDipPrice > 0 ? ((currentPrice - lastDipPrice) / lastDipPrice) * 100 : 0;

    /* ── Velocity: avg move per tick in last 10 vs prior 10 ── */
    const v10 = data.slice(-10);
    const vPrior = data.slice(-20, -10);
    const velo10 = v10.length > 1 ? Math.abs(v10[v10.length - 1] - v10[0]) / v10.length : 0;
    const veloPrior = vPrior.length > 1 ? Math.abs(vPrior[vPrior.length - 1] - vPrior[0]) / vPrior.length : 0;
    const velocity = Math.max(velo10, veloPrior);

    /* ── Flat-tick detection ── */
    const flatTickRate = calcFlatTickRate(data);
    const microFluctuation = calcMicroFluctuation(data);

    return {
        slope, direction, strength,
        ema5, ema13, ema5Above13,
        lastPeakPrice, lastDipPrice,
        peaks, dips,
        consecUp, consecDown,
        pullbackFromPeak, bounceFromDip,
        velocity, slopeAccel, momentumConviction,
        flatTickRate, microFluctuation,
    };
}

/* ── Sniper entry check — improved for Only Ups/Only Downs ──────────────────── */

export function checkSniperEntry(
    direction: 'RUNHIGH' | 'RUNLOW',
    prices: number[],
): { trigger: boolean; reason: string; entryPrice: number } {
    const l70 = analyzeLast70(prices);
    const currentPrice = prices[prices.length - 1];
    const notrigger = { trigger: false, reason: '', entryPrice: currentPrice };

    if (prices.length < 3) return notrigger;

    const prev = prices[prices.length - 2];
    const thirdLast = prices.length > 2 ? prices[prices.length - 3] : prev;

    if (direction === 'RUNHIGH') {
        /* ── Flat-tick filter: flat ticks kill RUNHIGH instantly ── */
        if (l70.flatTickRate > 0.15) return { ...notrigger, reason: `High noise ${(l70.flatTickRate * 100).toFixed(0)}%` };

        /* ── Micro-fluctuation filter: too many reversals = choppy ── */
        if (l70.microFluctuation > 0.4) return { ...notrigger, reason: `Choppy ${(l70.microFluctuation * 100).toFixed(0)}%` };

        /* ── Trend strength requirement ── */
        if (l70.direction !== 'up' || l70.strength < 15) return { ...notrigger, reason: `Weak uptrend (${l70.strength})` };
        if (l70.momentumConviction < -0.3) return { ...notrigger, reason: `Negative conviction ${l70.momentumConviction.toFixed(2)}` };

        /* ── Entry timing: want a micro-dip then resumption ── */
        const lastTickDown = currentPrice < prev;
        const secondLastDown = prev < thirdLast;

        if (lastTickDown) {
            /* Dip on last tick: good entry if momentum still strong */
            if (l70.consecUp >= 2 || l70.velocity > 0.003) {
                return { trigger: true, reason: `Dip in strong uptrend (v=${l70.velocity.toFixed(4)})`, entryPrice: currentPrice };
            }
            return { ...notrigger, reason: `Dip but weak momentum (up=${l70.consecUp})` };
        }

        /* Two consecutive down ticks: too deep, skip */
        if (secondLastDown && lastTickDown) return { ...notrigger, reason: 'Two consecutive dips' };

        /* Fresh impulse: 2+ consecutive up ticks with good velocity */
        if (l70.consecUp >= 2 && l70.velocity > 0.005 && l70.momentumConviction > 0.2) {
            return { trigger: true, reason: `Fresh impulse (up=${l70.consecUp}, v=${l70.velocity.toFixed(4)})`, entryPrice: currentPrice };
        }

        return { ...notrigger, reason: `No clear entry (up=${l70.consecUp}, v=${l70.velocity.toFixed(4)})` };
    }

    if (direction === 'RUNLOW') {
        /* ── Flat-tick filter ── */
        if (l70.flatTickRate > 0.15) return { ...notrigger, reason: `High noise ${(l70.flatTickRate * 100).toFixed(0)}%` };

        /* ── Micro-fluctuation filter ── */
        if (l70.microFluctuation > 0.4) return { ...notrigger, reason: `Choppy ${(l70.microFluctuation * 100).toFixed(0)}%` };

        /* ── Trend strength requirement ── */
        if (l70.direction !== 'down' || l70.strength < 15) return { ...notrigger, reason: `Weak downtrend (${l70.strength})` };
        if (l70.momentumConviction > 0.3) return { ...notrigger, reason: `Positive conviction ${l70.momentumConviction.toFixed(2)}` };

        /* ── Entry timing ── */
        const lastTickUp = currentPrice > prev;
        const secondLastUp = prev > thirdLast;

        if (lastTickUp) {
            if (l70.consecDown >= 2 || l70.velocity > 0.003) {
                return { trigger: true, reason: `Peak in strong downtrend (v=${l70.velocity.toFixed(4)})`, entryPrice: currentPrice };
            }
            return { ...notrigger, reason: `Peak but weak momentum (dn=${l70.consecDown})` };
        }

        if (secondLastUp && lastTickUp) return { ...notrigger, reason: 'Two consecutive peaks' };

        if (l70.consecDown >= 2 && l70.velocity > 0.005 && l70.momentumConviction < -0.2) {
            return { trigger: true, reason: `Fresh impulse (dn=${l70.consecDown}, v=${l70.velocity.toFixed(4)})`, entryPrice: currentPrice };
        }

        return { ...notrigger, reason: `No clear entry (dn=${l70.consecDown}, v=${l70.velocity.toFixed(4)})` };
    }

    return notrigger;
}

/* ── Duration calculation — adaptive based on volatility/momentum ───────────── */

export function calcDuration(atr: number, price: number, velocity?: number, slopeAccel?: number): number {
    /* Only Ups/Only Downs win rate drops fast with duration.
     * The sweet spot is 2 ticks (community standard + research).
     * For extremely strong momentum, we might use 3.
     * For weak/uncertain, stay at 2 (minimum for profit). */

    const v = velocity || 0;
    const a = slopeAccel || 0;

    /* Very strong momentum + acceleration: allow 3 ticks */
    if (v > 0.008 && a > 0.0001) return 3;

    /* Default: 2 ticks (the proven sweet spot) */
    return 2;
}

/* ── Market analysis — multi-factor confidence ──────────────────────────────── */

export function analyzeMarket(
    symbol: string,
    prices: number[],
    _candlesM1: Candle[],
): MarketScore {
    const reasons: string[] = [];
    let confidence = 0;
    let direction: 'RUNHIGH' | 'RUNLOW' | null = null;

    const l70 = analyzeLast70(prices);

    /* ── Reject noisy/choppy markets early ── */
    if (l70.flatTickRate > 0.2) {
        return { symbol, direction: null, confidence: 0, reasons: ['High flat-tick rate'], indicators: defaultIndicators(), trendM1: 'neutral', trendM5: 'neutral', trendM15: 'neutral', flatTickRate: l70.flatTickRate, momentumStrength: 0, noiseLevel: l70.flatTickRate };
    }
    if (l70.microFluctuation > 0.45) {
        return { symbol, direction: null, confidence: 0, reasons: ['Too choppy'], indicators: defaultIndicators(), trendM1: 'neutral', trendM5: 'neutral', trendM15: 'neutral', flatTickRate: l70.flatTickRate, momentumStrength: 0, noiseLevel: l70.microFluctuation };
    }

    /* ── Reject weak trends ── */
    if (l70.strength < 15) {
        return { symbol, direction: null, confidence: 0, reasons: ['Weak'], indicators: defaultIndicators(), trendM1: 'neutral', trendM5: 'neutral', trendM15: 'neutral', flatTickRate: l70.flatTickRate, momentumStrength: 0, noiseLevel: l70.microFluctuation };
    }

    const consecTotal = l70.consecUp + l70.consecDown;
    if (consecTotal > 0 && Math.abs(l70.consecUp - l70.consecDown) / consecTotal < 0.15) {
        return { symbol, direction: null, confidence: 0, reasons: ['Choppy'], indicators: defaultIndicators(), trendM1: 'neutral', trendM5: 'neutral', trendM15: 'neutral', flatTickRate: l70.flatTickRate, momentumStrength: 0, noiseLevel: l70.microFluctuation };
    }

    /* ── Factor 1: Slope strength (0-30 points) ── */
    if (l70.direction === 'up' && l70.strength >= 40) { confidence += 30; reasons.push(`Strong +${l70.strength}`); }
    else if (l70.direction === 'down' && l70.strength >= 40) { confidence += 30; reasons.push(`Strong -${l70.strength}`); }
    else if (l70.direction === 'up' && l70.strength >= 25) { confidence += 20; reasons.push(`Trend +${l70.strength}`); }
    else if (l70.direction === 'down' && l70.strength >= 25) { confidence += 20; reasons.push(`Trend -${l70.strength}`); }

    /* ── Factor 2: Momentum conviction (0-15 points) ── */
    if (Math.abs(l70.momentumConviction) > 0.3) { confidence += 15; reasons.push('Conviction'); }
    else if (Math.abs(l70.momentumConviction) > 0.15) { confidence += 8; reasons.push('Weak conviction'); }

    /* ── Factor 3: Velocity (0-15 points) ── */
    if (l70.velocity > 0.008) { confidence += 15; reasons.push('Fast'); }
    else if (l70.velocity > 0.005) { confidence += 10; reasons.push('Moving'); }
    else if (l70.velocity > 0.003) { confidence += 5; reasons.push('Slow'); }

    /* ── Factor 4: Consecutive direction (0-10 points) ── */
    if (l70.consecUp > 2 && l70.consecUp >= l70.consecDown * 3) { confidence += 10; reasons.push(`${l70.consecUp} cons up`); }
    else if (l70.consecDown > 2 && l70.consecDown >= l70.consecUp * 3) { confidence += 10; reasons.push(`${l70.consecDown} cons down`); }

    /* ── Factor 5: Slope acceleration (0-10 points) ── */
    if (Math.abs(l70.slopeAccel) > 0.00008) { confidence += 10; reasons.push('Accel'); }

    /* ── Factor 6: EMA agreement (0-10 points) ── */
    if (l70.ema5 > l70.ema13 && l70.strength > 20) { confidence += 10; reasons.push('EMA bull'); }
    else if (l70.ema5 < l70.ema13 && l70.strength > 20) { confidence += 10; reasons.push('EMA bear'); }

    /* ── Factor 7: Flat-tick bonus/penalty ── */
    if (l70.flatTickRate < 0.05) { confidence += 5; reasons.push('Clean ticks'); }
    else if (l70.flatTickRate > 0.12) { confidence -= 10; reasons.push('Noisy ticks'); }

    /* ── Factor 8: Micro-fluctuation penalty ── */
    if (l70.microFluctuation > 0.35) { confidence -= 10; reasons.push('Reversals'); }

    /* ── Direction assignment ── */
    const isBullish = l70.direction === 'up' && l70.strength >= 25 && l70.momentumConviction > 0;
    const isBearish = l70.direction === 'down' && l70.strength >= 25 && l70.momentumConviction < 0;

    const minDC = 65;
    if (isBullish && confidence >= minDC) direction = 'RUNHIGH';
    else if (isBearish && confidence >= minDC) direction = 'RUNLOW';

    confidence = Math.min(100, Math.max(0, confidence));

    /* ── Build M1 candle indicators (if available) ── */
    let trendM1: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let trendM5: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let trendM15: 'bullish' | 'bearish' | 'neutral' = 'neutral';

    if (_candlesM1.length >= 20) {
        const closes = _candlesM1.map(c => c.close);
        const ema20Arr = ema(closes, 20);
        const ema50Arr = ema(closes, Math.min(50, closes.length));
        const ema100Arr = ema(closes, Math.min(100, closes.length));
        const e20 = ema20Arr[ema20Arr.length - 1] || 0;
        const e50 = ema50Arr[ema50Arr.length - 1] || 0;
        const e100 = ema100Arr[ema100Arr.length - 1] || 0;
        trendM1 = getTrend(closes, e20, e50, e100);
    }

    /* ── Compute additional indicators for display ── */
    const candlesM1 = _candlesM1;
    const closesM1 = candlesM1.map(c => c.close);
    const rsiValues = rsi(closesM1, 14);
    const rsiVal = rsiValues.length > 0 ? rsiValues[rsiValues.length - 1] : 50;
    const macdValues = macd(closesM1);
    const macdHist = macdValues.histogram.length > 0 ? macdValues.histogram[macdValues.histogram.length - 1] : 0;
    const macdLine = macdValues.macd.length > 0 ? macdValues.macd[macdValues.macd.length - 1] : 0;
    const macdSig = macdValues.signal.length > 0 ? macdValues.signal[macdValues.signal.length - 1] : 0;
    const adxVal = adx(candlesM1, 14);
    const bb = bollinger(closesM1, 20, 2);
    const atrVal = calcATR(candlesM1, 14);
    const cciVal = cci(closesM1, 20);
    const sr = findSR(closesM1);

    return {
        symbol, direction, confidence, reasons,
        indicators: {
            ema20: 0, ema50: 0, ema100: 0,
            rsi: rsiVal,
            macd: macdLine, macdSignal: macdSig, macdHistogram: macdHist,
            adx: adxVal,
            bbUpper: bb.upper, bbMiddle: bb.middle, bbLower: bb.lower,
            atr: atrVal,
            support: sr.support, resistance: sr.resistance,
            last70Slope: l70.slope,
            last70Strength: l70.strength,
            consecUp: l70.consecUp,
            consecDown: l70.consecDown,
            cci: cciVal,
            slopeAccel: l70.slopeAccel,
            momentumConviction: l70.momentumConviction,
        },
        trendM1, trendM5, trendM15,
        flatTickRate: l70.flatTickRate,
        momentumStrength: calcMomentumStrength(prices).strength,
        noiseLevel: l70.microFluctuation,
    };
}

function defaultIndicators(): IndicatorValues {
    return {
        ema20: 0, ema50: 0, ema100: 0,
        rsi: 50,
        macd: 0, macdSignal: 0, macdHistogram: 0,
        adx: 0,
        bbUpper: 0, bbMiddle: 0, bbLower: 0,
        atr: 0,
        support: 0, resistance: 0,
        last70Slope: 0, last70Strength: 0,
        consecUp: 0, consecDown: 0,
        cci: 0, slopeAccel: 0, momentumConviction: 0,
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
