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
const MAX_TICKS = 1000;
const MIN_TICKS_FOR_ANALYSIS = 50;
export const SCAN_INTERVAL_MS = 500;
export const SNIPER_CHECK_MS = 500;

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

/* ── Last 70 ticks analysis — sniper-grade direction ────────────────────────── */

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
} {
    const empty = {
        slope: 0, direction: 'neutral' as const, strength: 0,
        ema5: 0, ema13: 0, ema5Above13: false,
        lastPeakPrice: 0, lastDipPrice: 0,
        peaks: [], dips: [],
        consecUp: 0, consecDown: 0,
        pullbackFromPeak: 0, bounceFromDip: 0,
        velocity: 0, slopeAccel: 0, momentumConviction: 0,
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

    return {
        slope, direction, strength,
        ema5, ema13, ema5Above13,
        lastPeakPrice, lastDipPrice,
        peaks, dips,
        consecUp, consecDown,
        pullbackFromPeak, bounceFromDip,
        velocity, slopeAccel, momentumConviction,
    };
}

/* ── Sniper entry check ─────────────────────────────────────────────────────── */

export function checkSniperEntry(
    direction: 'RUNHIGH' | 'RUNLOW',
    prices: number[],
): { trigger: boolean; reason: string; entryPrice: number } {
    const l70 = analyzeLast70(prices);
    const currentPrice = prices[prices.length - 1];
    const notrigger = { trigger: false, reason: '', entryPrice: currentPrice };

    if (prices.length < 4) return notrigger;

    const penultimatePrice = prices[prices.length - 2];
    const antepenultimatePrice = prices.length > 3 ? prices[prices.length - 3] : penultimatePrice;

    if (direction === 'RUNHIGH') {
        if (l70.direction !== 'up' || l70.strength < 30) return { ...notrigger, reason: 'Trend not strong up' };
        if (l70.ema5 <= l70.ema13) return { ...notrigger, reason: 'EMA5 below EMA13' };
        if (l70.momentumConviction < 0.2) return { ...notrigger, reason: 'Low conviction' };

        const lastTickUp = currentPrice > penultimatePrice;
        if (!lastTickUp) return { ...notrigger, reason: 'Last tick not up' };

        const nearPeak = l70.pullbackFromPeak < 0.002;
        if (!nearPeak) return { ...notrigger, reason: `Off peak ${l70.pullbackFromPeak.toFixed(3)}%` };

        const consecOk = l70.consecUp >= 1 && l70.consecUp <= 3;
        if (!consecOk) return { ...notrigger, reason: `Consec ${l70.consecUp} not ideal` };

        if (l70.slopeAccel > 0.00005 || l70.velocity > 0.003) {
            return { trigger: true, reason: `At peak +accel`, entryPrice: currentPrice };
        }

        return { ...notrigger, reason: 'Waiting up momentum' };
    }

    if (direction === 'RUNLOW') {
        if (l70.direction !== 'down' || l70.strength < 30) return { ...notrigger, reason: 'Trend not strong down' };
        if (l70.ema5 >= l70.ema13) return { ...notrigger, reason: 'EMA5 above EMA13' };
        if (l70.momentumConviction > -0.2) return { ...notrigger, reason: 'Low conviction' };

        const lastTickDown = currentPrice < penultimatePrice;
        if (!lastTickDown) return { ...notrigger, reason: 'Last tick not down' };

        const nearDip = l70.bounceFromDip < 0.002;
        if (!nearDip) return { ...notrigger, reason: `Off dip ${l70.bounceFromDip.toFixed(3)}%` };

        const consecOk = l70.consecDown >= 1 && l70.consecDown <= 3;
        if (!consecOk) return { ...notrigger, reason: `Consec ${l70.consecDown} not ideal` };

        if (l70.slopeAccel < -0.00005 || l70.velocity > 0.003) {
            return { trigger: true, reason: `At dip +accel`, entryPrice: currentPrice };
        }

        return { ...notrigger, reason: 'Waiting down momentum' };
    }

    return notrigger;
}

/* ── Duration calculation ───────────────────────────────────────────────────── */

export function calcDuration(atr: number, price: number, velocity?: number, slopeAccel?: number): number {
    const volPct = (atr / price) * 100;

    let base = 2;

    if (volPct > 0.8) base = 2;
    else if (volPct > 0.5) base = 2;
    else if (volPct > 0.2) base = 2;
    else if (volPct > 0.08) base = 3;
    else base = 3;

    if (velocity && velocity > 0.008) { base = 2; }
    else if (velocity && velocity > 0.003) { }
    else if (velocity && velocity < 0.0003) { base = Math.min(3, base + 1); }

    if (slopeAccel && Math.abs(slopeAccel) > 0.00015) base = Math.max(2, base);

    return Math.max(2, Math.min(4, base));
}

/* ── Market analysis ────────────────────────────────────────────────────────── */

export function analyzeMarket(
    symbol: string,
    prices: number[],
    candlesM1: Candle[],
): MarketScore {
    const closes = candlesM1.map(c => c.close);
    const candlesM5 = aggregateCandles(candlesM1, 5);
    const candlesM15 = aggregateCandles(candlesM1, 15);
    const closesM5 = candlesM5.map(c => c.close);
    const closesM15 = candlesM15.map(c => c.close);

    const reasons: string[] = [];
    let confidence = 0;
    let direction: 'RUNHIGH' | 'RUNLOW' | null = null;

    /* ── Last 70 ticks analysis (primary) ── */
    const l70 = analyzeLast70(prices);
    const isLast70Up = l70.direction === 'up' && l70.strength >= 25;
    const isLast70Down = l70.direction === 'down' && l70.strength >= 25;
    const isLast70StrongUp = l70.direction === 'up' && l70.strength >= 45;
    const isLast70StrongDown = l70.direction === 'down' && l70.strength >= 45;

    if (isLast70StrongUp) { confidence += 20; reasons.push(`Last70 strong + (${l70.strength})`); }
    else if (isLast70StrongDown) { confidence += 20; reasons.push(`Last70 strong - (${l70.strength})`); }
    else if (isLast70Up) { confidence += 14; reasons.push(`Last70 trend + (${l70.strength})`); }
    else if (isLast70Down) { confidence += 14; reasons.push(`Last70 trend - (${l70.strength})`); }
    else if (l70.strength >= 15) {
        if (l70.direction === 'up') { confidence += 7; reasons.push(`Last70 mild + (${l70.strength})`); }
        else if (l70.direction === 'down') { confidence += 7; reasons.push(`Last70 mild - (${l70.strength})`); }
    }

    /* ── Slope acceleration ── */
    if (l70.slopeAccel > 0.0001 && isLast70Up) { confidence += 12; reasons.push(`Accel +${l70.slopeAccel.toFixed(6)}`); }
    else if (l70.slopeAccel < -0.0001 && isLast70Down) { confidence += 12; reasons.push(`Accel ${l70.slopeAccel.toFixed(6)}`); }
    else if (l70.slopeAccel > 0.00005 && l70.direction === 'up') { confidence += 6; reasons.push('Accel up'); }
    else if (l70.slopeAccel < -0.00005 && l70.direction === 'down') { confidence += 6; reasons.push('Accel down'); }

    /* ── Momentum conviction ── */
    if (l70.momentumConviction > 0.5) { confidence += 10; reasons.push(`Conviction ${l70.momentumConviction.toFixed(2)}`); }
    else if (l70.momentumConviction < -0.5) { confidence += 10; reasons.push(`Conviction ${l70.momentumConviction.toFixed(2)}`); }
    else if (l70.momentumConviction > 0.2) { confidence += 5; reasons.push('Mild conviction'); }
    else if (l70.momentumConviction < -0.2) { confidence += 5; reasons.push('Mild conviction'); }

    /* ── Consecutive tick pressure ── */
    const consecTotal = l70.consecUp + l70.consecDown;
    const bullishPressure = l70.consecUp > 2 && l70.consecUp >= l70.consecDown * 1.5;
    const bearishPressure = l70.consecDown > 2 && l70.consecDown >= l70.consecUp * 1.5;
    if (bullishPressure) { confidence += 10; reasons.push(`${l70.consecUp}/${consecTotal} ticks up`); }
    else if (bearishPressure) { confidence += 10; reasons.push(`${l70.consecDown}/${consecTotal} ticks down`); }
    else if (l70.consecUp > 1 && l70.consecDown === 0) { confidence += 5; reasons.push(`${l70.consecUp} cons up`); }
    else if (l70.consecDown > 1 && l70.consecUp === 0) { confidence += 5; reasons.push(`${l70.consecDown} cons down`); }

    /* ── Velocity bonus ── */
    if (l70.velocity > 0.005 && isLast70Up) { confidence += 6; reasons.push(`V ${l70.velocity.toFixed(4)}`); }
    else if (l70.velocity > 0.005 && isLast70Down) { confidence += 6; reasons.push(`V ${l70.velocity.toFixed(4)}`); }

    /* ── EMA on candles ── */
    const ema100Arr = closes.length > 100 ? ema(closes, 100) : [];
    const ema50Arr = closes.length > 50 ? ema(closes, 50) : [];
    const ema20Arr = closes.length > 20 ? ema(closes, 20) : [];
    const ema20Val = ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : 0;
    const ema50Val = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : 0;
    const ema100Val = ema100Arr.length > 0 ? ema100Arr[ema100Arr.length - 1] : 0;

    const lastPrice = closes[closes.length - 1];
    const isPriceAbove20 = ema20Val > 0 && lastPrice > ema20Val;
    const isPriceBelow20 = ema20Val > 0 && lastPrice < ema20Val;
    const isEMABullish = ema20Val > 0 && ema50Val > 0 && ema20Val > ema50Val;
    const isEMABearish = ema20Val > 0 && ema50Val > 0 && ema20Val < ema50Val;

    const m1Trend = closes.length > 5 ? getTrend(closes.slice(-5), ema20Val, ema50Val, ema100Val) : 'neutral';

    const slopeM5 = closesM5.length > 4 ? (closesM5[closesM5.length - 1] - closesM5[closesM5.length - 5]) / 5 : 0;
    const slopeM15 = closesM15.length > 2 ? (closesM15[closesM15.length - 1] - closesM15[closesM15.length - 3]) / 3 : 0;
    const m5TrendDerived = slopeM5 > 0 ? 'bullish' : slopeM5 < 0 ? 'bearish' : 'neutral';
    const m15TrendDerived = slopeM15 > 0 ? 'bullish' : slopeM15 < 0 ? 'bearish' : 'neutral';

    const isBullish = m1Trend === 'bullish' || (isEMABullish && isPriceAbove20);
    const isBearish = m1Trend === 'bearish' || (isEMABearish && isPriceBelow20);

    /* ── EMA alignment (double weight when last70 agrees) ── */
    const emaBullAligned = closes.length > 100 && ema20Val > ema50Val && ema50Val > ema100Val;
    const emaBearAligned = closes.length > 100 && ema20Val < ema50Val && ema50Val < ema100Val;
    if (emaBullAligned && isLast70Up) { confidence += 16; reasons.push('EMA + tick up'); }
    else if (emaBearAligned && isLast70Down) { confidence += 16; reasons.push('EMA + tick down'); }
    else if (emaBullAligned) { confidence += 10; reasons.push('EMA bullish'); }
    else if (emaBearAligned) { confidence += 10; reasons.push('EMA bearish'); }

    /* ── RSI ── */
    const rsiVals = closes.length > 14 ? rsi(closes, 14) : [];
    const rsiVal = rsiVals.length > 0 ? rsiVals[rsiVals.length - 1] : 50;
    const rsiBullish = rsiVal > 55 && rsiVal < 80;
    const rsiBearish = rsiVal < 45 && rsiVal > 20;
    if (rsiBullish && isLast70Up) { confidence += 14; reasons.push(`RSI ${rsiVal.toFixed(1)} aligned`); }
    else if (rsiBearish && isLast70Down) { confidence += 14; reasons.push(`RSI ${rsiVal.toFixed(1)} aligned`); }
    else if (rsiBullish) { confidence += 8; reasons.push(`RSI ${rsiVal.toFixed(1)}`); }
    else if (rsiBearish) { confidence += 8; reasons.push(`RSI ${rsiVal.toFixed(1)}`); }

    /* ── CCI ── */
    const cciVal = cci(closes, 14);
    if (cciVal > 100 && isLast70Up) { confidence += 10; reasons.push(`CCI ${cciVal.toFixed(0)}`); }
    else if (cciVal < -100 && isLast70Down) { confidence += 10; reasons.push(`CCI ${cciVal.toFixed(0)}`); }
    else if (cciVal > 80) { confidence += 5; reasons.push(`CCI ${cciVal.toFixed(0)}`); }
    else if (cciVal < -80) { confidence += 5; reasons.push(`CCI ${cciVal.toFixed(0)}`); }

    /* ── MACD ── */
    const macdData = closes.length > 26 ? macd(closes) : null;
    if (macdData && macdData.histogram.length > 1) {
        const lastHist = macdData.histogram[macdData.histogram.length - 1];
        const prevHist = macdData.histogram[macdData.histogram.length - 2];
        const lastMacd = macdData.macd[macdData.macd.length - 1];
        const lastSig = macdData.signal[macdData.signal.length - 1];
        const macdCross = lastMacd > lastSig && lastHist > 0 && prevHist < 0;
        const macdCrossDown = lastMacd < lastSig && lastHist < 0 && prevHist > 0;
        if (macdCross && isLast70Up) { confidence += 14; reasons.push('MACD cross + trend'); }
        else if (macdCrossDown && isLast70Down) { confidence += 14; reasons.push('MACD cross + trend'); }
        else if (macdCross) { confidence += 10; reasons.push('MACD cross'); }
        else if (macdCrossDown) { confidence += 10; reasons.push('MACD cross'); }
        else if (lastMacd > lastSig && lastHist > prevHist) { confidence += 5; reasons.push('MACD mom'); }
        else if (lastMacd < lastSig && lastHist < prevHist) { confidence += 5; reasons.push('MACD mom'); }
    }

    /* ── ADX ── */
    const adxVal = candlesM1.length > 14 ? adx(candlesM1, 14) : 0;
    if (adxVal > 30) { confidence += 10; reasons.push(`ADX ${adxVal.toFixed(1)}`); }
    else if (adxVal > 22) { confidence += 5; reasons.push(`ADX ${adxVal.toFixed(1)}`); }

    /* ── Bollinger Bands ── */
    const bb = bollinger(closes, 20, 2);
    if (bb.upper && lastPrice > bb.upper || bb.lower && lastPrice < bb.lower) {
        confidence += 5; reasons.push('BB touch');
    }

    /* ── ATR ── */
    const atrVal = candlesM1.length > 14 ? calcATR(candlesM1, 14) : 0;

    /* ── Support/Resistance ── */
    const sr = findSR(prices);
    const distToResistance = sr.resistance > 0 ? ((sr.resistance - lastPrice) / lastPrice) * 100 : 99;
    const distToSupport = sr.support > 0 ? ((lastPrice - sr.support) / lastPrice) * 100 : 99;
    if (isBullish && distToResistance > 0.5) { confidence += 7; reasons.push(`S/R room ${distToResistance.toFixed(1)}%`); }
    else if (isBearish && distToSupport > 0.5) { confidence += 7; reasons.push(`S/R room ${distToSupport.toFixed(1)}%`); }

    /* ── Price action ── */
    const pattern = candlesM1.length > 1 ? detectCandlePattern(candlesM1) : 'none';
    if (pattern === 'bullish_engulfing' && isBullish) { confidence += 8; reasons.push('Engulfing'); }
    else if (pattern === 'bearish_engulfing' && isBearish) { confidence += 8; reasons.push('Engulfing'); }
    else if (pattern === 'pin_bar') { confidence += 4; reasons.push('Pin bar'); }

    /* ── Timeframe alignment ── */
    const tfBullAligned = m15TrendDerived === 'bullish' && m5TrendDerived === 'bullish' && isBullish;
    const tfBearAligned = m15TrendDerived === 'bearish' && m5TrendDerived === 'bearish' && isBearish;
    if (tfBullAligned && isLast70Up) { confidence += 14; reasons.push('M1+M5+M15 + tick up'); }
    else if (tfBearAligned && isLast70Down) { confidence += 14; reasons.push('M1+M5+M15 + tick down'); }
    else if (tfBullAligned) { confidence += 10; reasons.push('M1+M5+M15 up'); }
    else if (tfBearAligned) { confidence += 10; reasons.push('M1+M5+M15 down'); }
    else if (m5TrendDerived === 'bullish' && isBullish) { confidence += 5; reasons.push('M1+M5 up'); }
    else if (m5TrendDerived === 'bearish' && isBearish) { confidence += 5; reasons.push('M1+M5 down'); }

    /* ── Direction decision ── */
    let isBullishFinal = isLast70Up || (isBullish && m5TrendDerived !== 'bearish');
    let isBearishFinal = isLast70Down || (isBearish && m5TrendDerived !== 'bullish');

    /* ── Override: when conviction is extreme, follow it blindly ── */
    if (l70.momentumConviction > 0.8 && l70.slopeAccel > 0) isBullishFinal = true;
    if (l70.momentumConviction < -0.8 && l70.slopeAccel < 0) isBearishFinal = true;

    const minDirectionalConfidence = Math.max(55, Math.min(75, 75 - Math.abs(l70.momentumConviction) * 25));
    if (isBullishFinal && confidence >= minDirectionalConfidence) direction = 'RUNHIGH';
    else if (isBearishFinal && confidence >= minDirectionalConfidence) direction = 'RUNLOW';

    confidence = Math.min(100, Math.max(0, confidence));

    return {
        symbol, direction, confidence, reasons,
        indicators: {
            ema20: ema20Val, ema50: ema50Val, ema100: ema100Val,
            rsi: rsiVal,
            macd: macdData?.macd[macdData.macd.length - 1] ?? 0,
            macdSignal: macdData?.signal[macdData.signal.length - 1] ?? 0,
            macdHistogram: macdData?.histogram[macdData.histogram.length - 1] ?? 0,
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
        trendM1: m1Trend, trendM5: m5TrendDerived, trendM15: m15TrendDerived,
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