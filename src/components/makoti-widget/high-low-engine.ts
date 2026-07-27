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
}

export interface MarketScore {
    symbol: string;
    direction: 'CALL' | 'PUT' | null;
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
    direction: 'CALL' | 'PUT';
    confidence: number;
    stake: number;
    duration: number;
    entryPrice: number;
    exitPrice: number;
    profit: number;
    won: boolean;
    reasons: string[];
}

export interface EngineState {
    running: boolean;
    scanning: boolean;
    inTrade: boolean;
    currentSymbol: string;
    confidence: number;
    direction: 'CALL' | 'PUT' | null;
    status: string;
    pnl: number;
    trades: TradeRecord[];
    rankings: { symbol: string; score: number; direction: string }[];
    indicators: IndicatorValues | null;
    topMarkets: { symbol: string; score: number; direction: string }[];
    dailyProfit: number;
    consecutiveLosses: number;
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

export const HL_SYMBOLS = ['1HZ10V', '1HZ25V', '1HZ50V', '1HZ75V', '1HZ100V'];
const MAX_TICKS = 2000;
const MIN_TICKS_FOR_ANALYSIS = 200;
const SCAN_INTERVAL_MS = 3000;

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

/* ── Candle building ────────────────────────────────────────────────────────── */

export function buildCandles(ticks: number[], prices: number[]): Candle[] {
    if (prices.length < 2) return [];
    const candles: Candle[] = [];
    let current: Candle | null = null;
    const interval = 60_000;
    for (let i = 0; i < prices.length; i++) {
        const time = Math.floor(Date.now() / 60000) * 60000 - (prices.length - 1 - i) * 1000;
        const minuteStart = Math.floor(time / interval) * interval;
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

/* ── Duration calculation ───────────────────────────────────────────────────── */

export function calcDuration(atr: number, price: number): number {
    const volPct = (atr / price) * 100;
    if (volPct > 0.5) return 5;
    if (volPct > 0.3) return 7;
    if (volPct > 0.15) return 10;
    return 15;
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
    let direction: 'CALL' | 'PUT' | null = null;

    /* ── EMA ── */
    const emaVals = closes.length > 100 ? ema(closes, 100) : [];
    const ema50Arr = closes.length > 50 ? ema(closes, 50) : [];
    const ema20Arr = closes.length > 20 ? ema(closes, 20) : [];
    const ema20Val = ema20Arr.length > 0 ? ema20Arr[ema20Arr.length - 1] : 0;
    const ema50Val = ema50Arr.length > 0 ? ema50Arr[ema50Arr.length - 1] : 0;
    const ema100Val = emaVals.length > 0 ? emaVals[emaVals.length - 1] : 0;

    const m1Trend = getTrend(closesM1.length > 5 ? closesM1.slice(-5) : closesM1, ema20Val, ema50Val, ema100Val);
    const m5Trend = closesM5.length > 3 ? getTrend(closesM5, 0, 0, 0) : 'neutral';
    const m15Trend = closesM15.length > 2 ? getTrend(closesM15, 0, 0, 0) : 'neutral';

    /* ── M5/M15 trend via slope ── */
    const slopeM5 = closesM5.length > 4 ? (closesM5[closesM5.length - 1] - closesM5[closesM5.length - 5]) / 5 : 0;
    const slopeM15 = closesM15.length > 2 ? (closesM15[closesM15.length - 1] - closesM15[closesM15.length - 3]) / 3 : 0;
    const m5TrendDerived: 'bullish' | 'bearish' | 'neutral' = slopeM5 > 0 ? 'bullish' : slopeM5 < 0 ? 'bearish' : 'neutral';
    const m15TrendDerived: 'bullish' | 'bearish' | 'neutral' = slopeM15 > 0 ? 'bullish' : slopeM15 < 0 ? 'bearish' : 'neutral';

    const isBullish = m1Trend === 'bullish' || (ema20Val > ema50Val && closes[closes.length - 1] > ema20Val);
    const isBearish = m1Trend === 'bearish' || (ema20Val < ema50Val && closes[closes.length - 1] < ema20Val);
    if (closes.length > 100 && ema20Val && ema50Val && ema100Val) {
        if (ema20Val > ema50Val && ema50Val > ema100Val) { confidence += 20; reasons.push('EMA bullish alignment'); }
        else if (ema20Val < ema50Val && ema50Val < ema100Val) { confidence += 20; reasons.push('EMA bearish alignment'); }
    }

    /* ── RSI ── */
    const rsiVals = closes.length > 14 ? rsi(closes, 14) : [];
    const rsiVal = rsiVals.length > 0 ? rsiVals[rsiVals.length - 1] : 50;
    if (rsiVal > 55 && rsiVal < 75) { confidence += 15; reasons.push(`RSI ${rsiVal.toFixed(1)} — bullish strength`); }
    else if (rsiVal < 45 && rsiVal > 25) { confidence += 15; reasons.push(`RSI ${rsiVal.toFixed(1)} — bearish strength`); }
    else if (rsiVal >= 75) { reasons.push('RSI overbought — avoid buying'); }
    else if (rsiVal <= 25) { reasons.push('RSI oversold — avoid selling'); }

    /* ── MACD ── */
    const macdData = closes.length > 26 ? macd(closes) : null;
    if (macdData && macdData.histogram.length > 0) {
        const lastHist = macdData.histogram[macdData.histogram.length - 1];
        const prevHist = macdData.histogram.length > 1 ? macdData.histogram[macdData.histogram.length - 2] : 0;
        const lastMacd = macdData.macd[macdData.macd.length - 1];
        const lastSig = macdData.signal[macdData.signal.length - 1];
        if (lastMacd > lastSig && lastHist >= 0 && prevHist < 0) { confidence += 15; reasons.push('MACD bullish crossover'); }
        else if (lastMacd < lastSig && lastHist <= 0 && prevHist > 0) { confidence += 15; reasons.push('MACD bearish crossover'); }
    }

    /* ── ADX ── */
    const adxVal = candlesM1.length > 14 ? adx(candlesM1, 14) : 0;
    if (adxVal > 25) { confidence += 15; reasons.push(`ADX ${adxVal.toFixed(1)} — strong trend`); }
    else { reasons.push(`ADX ${adxVal.toFixed(1)} — weak trend`); }

    /* ── Bollinger Bands ── */
    const bb = bollinger(closes, 20, 2);
    const lastPrice = closes[closes.length - 1];
    if (bb.upper && lastPrice > bb.upper) { confidence += 5; reasons.push('Price above upper BB — bullish breakout'); }
    else if (bb.lower && lastPrice < bb.lower) { confidence += 5; reasons.push('Price below lower BB — bearish breakout'); }

    /* ── ATR ── */
    const atrVal = candlesM1.length > 14 ? calcATR(candlesM1, 14) : 0;

    /* ── Support/Resistance ── */
    const sr = findSR(prices);
    const distToResistance = sr.resistance > 0 ? ((sr.resistance - lastPrice) / lastPrice) * 100 : 99;
    const distToSupport = sr.support > 0 ? ((lastPrice - sr.support) / lastPrice) * 100 : 99;
    if (isBullish && distToResistance > 1) { confidence += 10; reasons.push(`Room to resistance ${distToResistance.toFixed(1)}%`); }
    else if (isBearish && distToSupport > 1) { confidence += 10; reasons.push(`Room to support ${distToSupport.toFixed(1)}%`); }

    /* ── Price action ── */
    const pattern = candlesM1.length > 1 ? detectCandlePattern(candlesM1) : 'none';
    if (pattern === 'bullish_engulfing' && isBullish) { confidence += 10; reasons.push('Bullish engulfing confirmation'); }
    else if (pattern === 'bearish_engulfing' && isBearish) { confidence += 10; reasons.push('Bearish engulfing confirmation'); }
    else if (pattern === 'pin_bar') { confidence += 5; reasons.push('Pin bar — potential reversal'); }

    /* ── Higher timeframe confirmation ── */
    if (m15TrendDerived === 'bullish' && m5TrendDerived === 'bullish' && isBullish) { confidence += 15; reasons.push('M1+M5+M15 alignment bullish'); }
    else if (m15TrendDerived === 'bearish' && m5TrendDerived === 'bearish' && isBearish) { confidence += 15; reasons.push('M1+M5+M15 alignment bearish'); }
    else if (m5TrendDerived === 'bullish' && isBullish) { confidence += 8; reasons.push('M1+M5 alignment bullish'); }
    else if (m5TrendDerived === 'bearish' && isBearish) { confidence += 8; reasons.push('M1+M5 alignment bearish'); }

    /* ── Last 50 ticks momentum ── */
    const last50 = prices.slice(-50);
    if (last50.length >= 10) {
        const momentum = (last50[last50.length - 1] - last50[0]) / last50[0] * 100;
        if (momentum > 0.1 && isBullish) { confidence += 5; reasons.push(`Momentum +${momentum.toFixed(2)}%`); }
        else if (momentum < -0.1 && isBearish) { confidence += 5; reasons.push(`Momentum ${momentum.toFixed(2)}%`); }
    }

    /* ── Direction decision ── */
    const isBullishFinal = isBullish && m5TrendDerived !== 'bearish';
    const isBearishFinal = isBearish && m5TrendDerived !== 'bullish';
    if (isBullishFinal && confidence >= 50) direction = 'CALL';
    else if (isBearishFinal && confidence >= 50) direction = 'PUT';

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
        },
        trendM1: m1Trend, trendM5: m5TrendDerived, trendM15: m15TrendDerived,
    };
}

/* ── Trade execution ────────────────────────────────────────────────────────── */

export async function executeHighLowTrade(
    symbol: string, direction: 'CALL' | 'PUT', stake: number, duration: number,
): Promise<{ contractId: string | null }> {
    const params = {
        amount: stake, basis: 'stake', currency: 'USD',
        duration, duration_unit: 't',
        symbol, contract_type: direction,
    };
    try {
        const response = await sendViaNewSystemWithPromise({ buy: 1, price: stake, parameters: params });
        const contractId = response?.buy?.contract_id ?? response?.contract_id;
        return { contractId: contractId ? String(contractId) : null };
    } catch {
        return { contractId: null };
    }
}

/* ── Market scan orchestrator ───────────────────────────────────────────────── */

export interface SymbolData {
    ticks: number[];
    prices: number[];
    candles: Candle[];
    ready: boolean;
}

export function runMarketScan(
    symbolData: Record<string, SymbolData>,
    config: HighLowConfig,
): { topMarkets: MarketScore[]; selected: MarketScore | null } {
    const scores: MarketScore[] = [];

    for (const sym of HL_SYMBOLS) {
        const sd = symbolData[sym];
        if (!sd || !sd.ready || sd.prices.length < MIN_TICKS_FOR_ANALYSIS) continue;

        const candles = buildCandles(sd.ticks, sd.prices);
        if (candles.length < 20) continue;

        const score = analyzeMarket(sym, sd.prices, candles);
        scores.push(score);
    }

    scores.sort((a, b) => b.confidence - a.confidence);

    const topMarkets = scores.slice(0, 5);
    const eligible = scores.filter(s => s.direction && s.confidence >= config.minConfidence);
    const selected = eligible.length > 0 ? eligible[0] : null;

    return { topMarkets, selected };
}
