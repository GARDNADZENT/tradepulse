import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
import {
    RecordTabKey,
    TabExecutionRecordPanel,
    TabSessionDockBar,
} from '@/components/tab-trade-record/tab-execution-record-panel';
import { api_base } from '@/external/bot-skeleton';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { useStore } from '@/hooks/useStore';
import { derivBus } from '@/lib/deriv/tick-bus';
import {
    executeLiveDerivTrade,
    extractDerivApiError,
    normalizeDerivContractParams,
} from '@/utils/ai-bot-xml-builder';
import './dtrader.scss';

type TickPoint = { epoch: number; quote: number; digit: number };

type DTraderGroup =
    | 'over_under'
    | 'matches_differs'
    | 'even_odd'
    | 'rise_fall'
    | 'higher_lower'
    | 'reset'
    | 'runs'
    | 'touch'
    | 'accumulators';

type TimeframeKey = '1T' | '1M' | '5M';
type OverlayMode = 'default' | 'digits';
type SeriesMode = 'line' | 'candles';

interface TradeGroupOption {
    id: DTraderGroup;
    label: string;
    supportsMinutes: boolean;
    usesDigitPrediction: boolean;
    usesBarrierOffset: boolean;
    minTicks: number;
    maxTicks: number;
}

const TRADE_GROUPS: TradeGroupOption[] = [
    {
        id: 'over_under',
        label: 'Over / Under (Digits)',
        supportsMinutes: false,
        usesDigitPrediction: true,
        usesBarrierOffset: false,
        minTicks: 1,
        maxTicks: 10,
    },
    {
        id: 'matches_differs',
        label: 'Matches / Differs (Digits)',
        supportsMinutes: false,
        usesDigitPrediction: true,
        usesBarrierOffset: false,
        minTicks: 1,
        maxTicks: 10,
    },
    {
        id: 'even_odd',
        label: 'Even / Odd (Digits)',
        supportsMinutes: false,
        usesDigitPrediction: false,
        usesBarrierOffset: false,
        minTicks: 1,
        maxTicks: 10,
    },
    {
        id: 'rise_fall',
        label: 'Rise / Fall (Up/Down)',
        supportsMinutes: true,
        usesDigitPrediction: false,
        usesBarrierOffset: false,
        minTicks: 1,
        maxTicks: 10,
    },
    {
        id: 'higher_lower',
        label: 'Higher / Lower (Up/Down)',
        supportsMinutes: true,
        usesDigitPrediction: false,
        usesBarrierOffset: true,
        minTicks: 5,
        maxTicks: 10,
    },
    {
        id: 'reset',
        label: 'Reset Call / Reset Put',
        supportsMinutes: true,
        usesDigitPrediction: false,
        usesBarrierOffset: false,
        minTicks: 5,
        maxTicks: 10,
    },
    {
        id: 'runs',
        label: 'Only Ups / Only Downs',
        supportsMinutes: false,
        usesDigitPrediction: false,
        usesBarrierOffset: false,
        minTicks: 2,
        maxTicks: 5,
    },
    {
        id: 'touch',
        label: 'Touch / No Touch (In/Out)',
        supportsMinutes: true,
        usesDigitPrediction: false,
        usesBarrierOffset: true,
        minTicks: 5,
        maxTicks: 10,
    },
    {
        id: 'accumulators',
        label: 'Accumulators (Growth)',
        supportsMinutes: false,
        usesDigitPrediction: false,
        usesBarrierOffset: false,
        minTicks: 1,
        maxTicks: 10,
    },
];

const DEFAULT_MARKETS = [
    { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ75V', name: 'Volatility 75 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ50V', name: 'Volatility 50 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ30V', name: 'Volatility 30 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ25V', name: 'Volatility 25 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ15V', name: 'Volatility 15 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ90V', name: 'Volatility 90 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: 'R_10', name: 'Volatility 10 Index', market: 'synthetic_index', pip_size: 0.001 },
    { symbol: 'R_25', name: 'Volatility 25 Index', market: 'synthetic_index', pip_size: 0.001 },
    { symbol: 'R_50', name: 'Volatility 50 Index', market: 'synthetic_index', pip_size: 0.0001 },
    { symbol: 'R_75', name: 'Volatility 75 Index', market: 'synthetic_index', pip_size: 0.0001 },
    { symbol: 'R_100', name: 'Volatility 100 Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: 'JD10', name: 'Jump 10 Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: 'JD25', name: 'Jump 25 Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: 'JD50', name: 'Jump 50 Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: 'JD75', name: 'Jump 75 Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: 'JD100', name: 'Jump 100 Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: 'BOOM500', name: 'Boom 500 Index', market: 'synthetic_index', pip_size: 0.001 },
    { symbol: 'BOOM1000', name: 'Boom 1000 Index', market: 'synthetic_index', pip_size: 0.001 },
    { symbol: 'CRASH500', name: 'Crash 500 Index', market: 'synthetic_index', pip_size: 0.001 },
    { symbol: 'CRASH1000', name: 'Crash 1000 Index', market: 'synthetic_index', pip_size: 0.001 },
];

const ZOOM_STEPS = [35, 55, 85, 130, 200, 320];
const TERMINAL_STATUSES = ['won', 'lost', 'sold', 'expired'];
const REQUEST_TIMEOUT_MS = 12000;
const OVER_RATIOS = [0.095, 0.234, 0.405, 0.642, 0.961, 1.432, 2.214, 3.8, 8.5];

function digitFromQuote(quote: number, decimals = 2): number {
    const fixed = Math.abs(quote).toFixed(Math.max(0, decimals));
    return Number(fixed.charAt(fixed.length - 1)) || 0;
}

function formatEpochTime(epochSec: number): string {
    const d = new Date(epochSec * 1000);
    return d.toTimeString().slice(0, 8);
}

function getTransport(): any {
    if (api_base?.api && (api_base.api as any).send) return api_base.api;
    if (chart_api?.api && (chart_api.api as any).send) return chart_api.api;
    return null;
}

function sendWithTimeout<T = any>(
    send: (payload: any) => Promise<T>,
    payload: any,
    timeoutMs = REQUEST_TIMEOUT_MS
): Promise<T> {
    return Promise.race([
        send(payload),
        new Promise<T>((_, reject) =>
            window.setTimeout(
                () => reject(new Error('Deriv request timed out. Check connection and retry.')),
                timeoutMs
            )
        ),
    ]);
}

interface LegDefinition {
    key: 'up' | 'down';
    contractType: string;
    title: string;
    barrier?: number | string;
    valid: boolean;
    invalidHint?: string;
    fallbackNetRatio: number;
}

function buildDTraderPairLegs(params: {
    group: DTraderGroup;
    prediction: number;
    barrierOffset: number;
    allowEquals: boolean;
    growthRate: number;
}): LegDefinition[] {
    const { group, prediction, barrierOffset, allowEquals, growthRate } = params;
    const d = Math.max(0, Math.min(9, Math.round(prediction)));
    const safeOffset = Math.max(0.01, Math.abs(Number(barrierOffset) || 0.5));

    switch (group) {
        case 'over_under':
            return [
                {
                    key: 'up',
                    contractType: 'DIGITOVER',
                    title: `Over ${d}`,
                    barrier: d,
                    valid: d >= 0 && d <= 8,
                    invalidHint: 'Select digit 0–8 for Over',
                    fallbackNetRatio: OVER_RATIOS[Math.min(8, d)] ?? 0.405,
                },
                {
                    key: 'down',
                    contractType: 'DIGITUNDER',
                    title: `Under ${d}`,
                    barrier: d,
                    valid: d >= 1 && d <= 9,
                    invalidHint: 'Select digit 1–9 for Under',
                    fallbackNetRatio: OVER_RATIOS[Math.min(8, Math.max(0, 9 - d))] ?? 0.405,
                },
            ];
        case 'matches_differs':
            return [
                {
                    key: 'up',
                    contractType: 'DIGITMATCH',
                    title: `Matches ${d}`,
                    barrier: d,
                    valid: true,
                    fallbackNetRatio: 8.09,
                },
                {
                    key: 'down',
                    contractType: 'DIGITDIFF',
                    title: `Differs ${d}`,
                    barrier: d,
                    valid: true,
                    fallbackNetRatio: 0.098,
                },
            ];
        case 'even_odd':
            return [
                {
                    key: 'up',
                    contractType: 'DIGITEVEN',
                    title: 'Even',
                    valid: true,
                    fallbackNetRatio: 0.961,
                },
                {
                    key: 'down',
                    contractType: 'DIGITODD',
                    title: 'Odd',
                    valid: true,
                    fallbackNetRatio: 0.961,
                },
            ];
        case 'rise_fall':
            return [
                {
                    key: 'up',
                    contractType: allowEquals ? 'CALLE' : 'CALL',
                    title: allowEquals ? 'Rise =' : 'Rise',
                    valid: true,
                    fallbackNetRatio: 0.953,
                },
                {
                    key: 'down',
                    contractType: allowEquals ? 'PUTE' : 'PUT',
                    title: allowEquals ? 'Fall =' : 'Fall',
                    valid: true,
                    fallbackNetRatio: 0.953,
                },
            ];
        case 'higher_lower':
            return [
                {
                    key: 'up',
                    contractType: 'HIGHER',
                    title: `Higher (+${safeOffset})`,
                    barrier: safeOffset,
                    valid: true,
                    fallbackNetRatio: 1.35,
                },
                {
                    key: 'down',
                    contractType: 'LOWER',
                    title: `Lower (-${safeOffset})`,
                    barrier: safeOffset,
                    valid: true,
                    fallbackNetRatio: 1.35,
                },
            ];
        case 'reset':
            return [
                {
                    key: 'up',
                    contractType: 'RESETCALL',
                    title: 'Reset Call',
                    valid: true,
                    fallbackNetRatio: 0.88,
                },
                {
                    key: 'down',
                    contractType: 'RESETPUT',
                    title: 'Reset Put',
                    valid: true,
                    fallbackNetRatio: 0.88,
                },
            ];
        case 'runs':
            return [
                {
                    key: 'up',
                    contractType: 'RUNHIGH',
                    title: 'Only Ups',
                    valid: true,
                    fallbackNetRatio: 2.86,
                },
                {
                    key: 'down',
                    contractType: 'RUNLOW',
                    title: 'Only Downs',
                    valid: true,
                    fallbackNetRatio: 2.86,
                },
            ];
        case 'touch':
            return [
                {
                    key: 'up',
                    contractType: 'ONETOUCH',
                    title: `Touch (+${safeOffset})`,
                    barrier: safeOffset,
                    valid: true,
                    fallbackNetRatio: 1.15,
                },
                {
                    key: 'down',
                    contractType: 'NOTOUCH',
                    title: `No Touch (-${safeOffset})`,
                    barrier: safeOffset,
                    valid: true,
                    fallbackNetRatio: 0.72,
                },
            ];
        case 'accumulators':
            return [
                {
                    key: 'up',
                    contractType: 'ACCU',
                    title: `Buy Accumulator (${Math.round(growthRate * 100)}%)`,
                    valid: true,
                    fallbackNetRatio: growthRate,
                },
            ];
    }
}

export default observer(function DTrader() {
    const { client, transactions } = useStore();
    const [recordOpen, setRecordOpen] = useState(true);
    const [recordTab, setRecordTab] = useState<RecordTabKey>('journal');

    const [symbol, setSymbol] = useState('1HZ100V');
    const [markets, setMarkets] = useState<any[]>(DEFAULT_MARKETS);
    const [marketOpen, setMarketOpen] = useState(false);
    const [search, setSearch] = useState('');

    // Chart controls matching RiskManagers DTrader
    const [timeframe, setTimeframe] = useState<TimeframeKey>('1T');
    const [zoomIndex, setZoomIndex] = useState<number>(2); // 85 points default
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('digits');
    const [seriesMode, setSeriesMode] = useState<SeriesMode>('line');
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    const [ticks, setTicks] = useState<TickPoint[]>([]);
    const [digitWindow, setDigitWindow] = useState<number>(1000);
    const [feedState, setFeedState] = useState<'CONNECTING' | 'LIVE' | 'ERROR'>('CONNECTING');

    // Classic DTrader sidebar parameters
    const [tradeGroup, setTradeGroup] = useState<DTraderGroup>('over_under');
    const [durationUnit, setDurationUnit] = useState<'t' | 'm'>('t');
    const [duration, setDuration] = useState<number>(1);
    const [prediction, setPrediction] = useState<number>(6);
    const [barrierOffset, setBarrierOffset] = useState<number>(0.5);
    const [allowEquals, setAllowEquals] = useState<boolean>(false);
    const [growthRate, setGrowthRate] = useState<number>(0.03);
    const [accuTakeProfit, setAccuTakeProfit] = useState<string>('');
    const [basis, setBasis] = useState<'stake' | 'payout'>('stake');
    const [amount, setAmount] = useState<number>(10);

    const [proposals, setProposals] = useState<Record<string, any>>({});
    const [openContracts, setOpenContracts] = useState<any[]>([]);
    const [buyingLeg, setBuyingLeg] = useState<string | null>(null);
    const [message, setMessage] = useState<string>('');
    const buyInFlightRef = useRef(false);

    // Cross-tab prefill listener from Analysis Tool & Digits Analysis
    useEffect(() => {
        const onPrefill = (evt: Event) => {
            const detail = (evt as CustomEvent<any>).detail;
            if (!detail) return;
            if (detail.symbol) setSymbol(String(detail.symbol));
            if (typeof detail.barrier === 'number') {
                setPrediction(Math.max(0, Math.min(9, Math.round(detail.barrier))));
            }
            const ct = String(detail.contractType || '').toUpperCase();
            if (ct === 'DIGITOVER' || ct === 'DIGITUNDER') setTradeGroup('over_under');
            else if (ct === 'DIGITMATCH' || ct === 'DIGITDIFF') setTradeGroup('matches_differs');
            else if (ct === 'DIGITEVEN' || ct === 'DIGITODD') setTradeGroup('even_odd');
            else if (ct === 'CALL' || ct === 'PUT') setTradeGroup('rise_fall');
        };
        window.addEventListener('tp-dtrader-prefill', onPrefill);
        return () => window.removeEventListener('tp-dtrader-prefill', onPrefill);
    }, []);

    // Load full Deriv active symbols list
    useEffect(() => {
        let cancelled = false;
        const loadMarkets = async () => {
            try {
                if (!Array.isArray(api_base.active_symbols) || !api_base.active_symbols.length) {
                    if ((api_base as any).active_symbols_promise) {
                        await (api_base as any).active_symbols_promise;
                    } else if ((api_base as any).getActiveSymbols) {
                        await (api_base as any).getActiveSymbols();
                    }
                }
                const raw = Array.isArray(api_base.active_symbols) ? api_base.active_symbols : [];
                if (cancelled || !raw.length) return;
                const live = raw
                    .map((m: any) => ({
                        symbol: String(m.underlying_symbol || m.symbol),
                        name: String(
                            m.underlying_symbol_name ||
                                m.display_name ||
                                m.name ||
                                m.underlying_symbol ||
                                m.symbol
                        ),
                        market: String(m.market || 'synthetic_index'),
                        pip_size: Number(m.pip_size || m.pip || 0.01),
                    }))
                    .filter((m: any) => m.symbol);
                if (live.length) setMarkets(live);
            } catch {
                // keep DEFAULT_MARKETS fallback
            }
        };
        void loadMarkets();
        return () => {
            cancelled = true;
        };
    }, []);

    // Subscribe to live ticks for selected symbol
    useEffect(() => {
        let cancelled = false;
        setFeedState('CONNECTING');

        const applyHistory = (symbolName: string, history: { t: number; price: number }[]) => {
            if (cancelled || symbolName !== symbol || !history.length) return;
            const pip = derivBus.getPipSize(symbol);
            setTicks(
                history.slice(-1000).map(t => ({
                    epoch: t.t / 1000,
                    quote: Number(t.price),
                    digit: digitFromQuote(Number(t.price), pip),
                }))
            );
            setFeedState('LIVE');
        };

        const releaseHistory = derivBus.onHistory(applyHistory);
        const releaseStatus = derivBus.onStatus?.(st => {
            if (cancelled) return;
            if (st === 'error') setFeedState('ERROR');
            else if (st === 'connecting') setFeedState('CONNECTING');
            else if (st === 'live') setFeedState('LIVE');
        });
        const releaseTick = derivBus.onTick((tickSymbol, tick) => {
            if (cancelled || tickSymbol !== symbol) return;
            const pip = derivBus.getPipSize(symbol);
            setTicks(prev =>
                [
                    ...prev,
                    {
                        epoch: tick.t / 1000,
                        quote: Number(tick.price),
                        digit: digitFromQuote(Number(tick.price), pip),
                    },
                ].slice(-1000)
            );
            setFeedState('LIVE');
        });

        applyHistory(symbol, derivBus.getTicks(symbol));
        const releaseBus = derivBus.subscribe([symbol]);

        return () => {
            cancelled = true;
            releaseBus();
            releaseTick();
            releaseHistory();
            releaseStatus?.();
        };
    }, [symbol]);

    const selectedMarket = markets.find(m => m.symbol === symbol) || {
        symbol,
        name: symbol,
        pip_size: 0.01,
    };
    const decimals = selectedMarket?.pip_size
        ? Math.max(0, Math.round(-Math.log10(Number(selectedMarket.pip_size))))
        : derivBus.getPipSize(symbol);

    const isAuthorizedSession = Boolean(
        client?.is_logged_in ||
            api_base?.is_authorized ||
            (typeof window !== 'undefined' && window.localStorage?.getItem('authToken'))
    );
    const activeCurrency = client?.currency || (api_base?.account_info as any)?.currency || 'USD';

    const groupMeta = TRADE_GROUPS.find(g => g.id === tradeGroup) || TRADE_GROUPS[0];

    // Enforce valid duration unit & tick bounds when switching trade group
    useEffect(() => {
        if (!groupMeta.supportsMinutes && durationUnit === 'm') {
            setDurationUnit('t');
        }
        if (durationUnit === 't') {
            setDuration(prev => Math.min(groupMeta.maxTicks, Math.max(groupMeta.minTicks, prev)));
        }
    }, [groupMeta, durationUnit]);

    const pairLegs = useMemo(
        () =>
            buildDTraderPairLegs({
                group: tradeGroup,
                prediction,
                barrierOffset,
                allowEquals,
                growthRate,
            }),
        [tradeGroup, prediction, barrierOffset, allowEquals, growthRate]
    );

    // Fetch live Deriv proposals for BOTH legs simultaneously
    useEffect(() => {
        const transport = getTransport();
        if (!transport?.send) {
            setProposals({});
            return;
        }

        let cancelled = false;
        const timer = window.setTimeout(async () => {
            if (buyInFlightRef.current) return;
            const safeAmt = Math.max(0.35, Number(amount) || 1);

            const results = await Promise.all(
                pairLegs.map(async leg => {
                    if (!leg.valid) return [leg.key, null] as const;
                    try {
                        const spec = normalizeDerivContractParams({
                            contractType: leg.contractType,
                            duration,
                            durationUnit,
                            barrier: leg.barrier,
                        });

                        const buildReq = (useUnderlying: boolean) => {
                            if (spec.apiContractType === 'ACCU') {
                                const r: Record<string, any> = {
                                    proposal: 1,
                                    amount: safeAmt,
                                    basis: 'stake',
                                    contract_type: 'ACCU',
                                    currency: activeCurrency,
                                    growth_rate: growthRate,
                                };
                                if (useUnderlying) r.underlying_symbol = symbol;
                                else r.symbol = symbol;
                                return r;
                            }

                            const r: Record<string, any> = {
                                proposal: 1,
                                amount: safeAmt,
                                basis,
                                contract_type: spec.apiContractType,
                                currency: activeCurrency,
                                duration: spec.duration,
                                duration_unit: spec.durationUnit,
                            };
                            if (useUnderlying) r.underlying_symbol = symbol;
                            else r.symbol = symbol;
                            if (spec.barrier !== undefined) r.barrier = spec.barrier;
                            return r;
                        };

                        let res: any;
                        try {
                            res = await sendWithTimeout(transport.send.bind(transport), buildReq(true));
                            if (res?.error?.code === 'InputValidationFailed') {
                                res = await sendWithTimeout(transport.send.bind(transport), buildReq(false));
                            }
                        } catch (firstErr: any) {
                            const code = firstErr?.error?.code || firstErr?.code || '';
                            if (code === 'InputValidationFailed') {
                                res = await sendWithTimeout(transport.send.bind(transport), buildReq(false));
                            } else {
                                throw firstErr;
                            }
                        }
                        return [leg.key, res?.proposal || null] as const;
                    } catch {
                        return [leg.key, null] as const;
                    }
                })
            );

            if (!cancelled) {
                const map: Record<string, any> = {};
                for (const [k, v] of results) {
                    if (v) map[k] = v;
                }
                setProposals(map);
            }
        }, 220);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [
        symbol,
        pairLegs,
        duration,
        durationUnit,
        basis,
        amount,
        activeCurrency,
        growthRate,
        isAuthorizedSession,
    ]);

    // Digit distribution over rolling window
    const digitStats = useMemo(() => {
        const slice = ticks.slice(-digitWindow);
        const counts = new Array(10).fill(0) as number[];
        for (const t of slice) counts[t.digit] += 1;
        const n = Math.max(1, slice.length);
        const pcts = counts.map(c => (c / n) * 100);

        let highestDigit = -1;
        let lowestDigit = -1;
        if (slice.length >= 10) {
            let maxVal = -1;
            let minVal = Infinity;
            pcts.forEach((p, idx) => {
                if (p > maxVal) {
                    maxVal = p;
                    highestDigit = idx;
                }
                if (p < minVal) {
                    minVal = p;
                    lowestDigit = idx;
                }
            });
            if (highestDigit === lowestDigit) lowestDigit = -1;
        }
        const currentDigit = slice.length > 0 ? slice[slice.length - 1].digit : null;
        return { pcts, sampleCount: slice.length, highestDigit, lowestDigit, currentDigit };
    }, [ticks, digitWindow]);

    // Chart series geometry (Line + Digits bubbles OR OHLC Candles)
    const chartData = useMemo(() => {
        const visibleCount = ZOOM_STEPS[zoomIndex] || 85;
        if (ticks.length < 2) return null;

        const bucketSec = timeframe === '5M' ? 300 : timeframe === '1M' ? 60 : 0;

        if (seriesMode === 'candles' || bucketSec > 0) {
            const groupSize = bucketSec > 0 ? Math.max(4, Math.round(bucketSec / 2)) : 4;
            const rawSlice = ticks.slice(-Math.min(ticks.length, visibleCount * groupSize));
            const candles: Array<{
                epoch: number;
                open: number;
                high: number;
                low: number;
                close: number;
                digit: number;
            }> = [];

            if (bucketSec > 0) {
                for (const t of rawSlice) {
                    const bEpoch = Math.floor(t.epoch / bucketSec) * bucketSec;
                    const prev = candles[candles.length - 1];
                    if (prev && prev.epoch === bEpoch) {
                        prev.high = Math.max(prev.high, t.quote);
                        prev.low = Math.min(prev.low, t.quote);
                        prev.close = t.quote;
                        prev.digit = t.digit;
                    } else {
                        candles.push({
                            epoch: bEpoch,
                            open: t.quote,
                            high: t.quote,
                            low: t.quote,
                            close: t.quote,
                            digit: t.digit,
                        });
                    }
                }
            } else {
                for (let i = 0; i < rawSlice.length; i += groupSize) {
                    const chunk = rawSlice.slice(i, i + groupSize);
                    if (!chunk.length) continue;
                    candles.push({
                        epoch: chunk[chunk.length - 1].epoch,
                        open: chunk[0].quote,
                        high: Math.max(...chunk.map(c => c.quote)),
                        low: Math.min(...chunk.map(c => c.quote)),
                        close: chunk[chunk.length - 1].quote,
                        digit: chunk[chunk.length - 1].digit,
                    });
                }
            }

            const viewCandles = candles.slice(-Math.min(60, visibleCount));
            if (viewCandles.length < 2) return null;
            const min = Math.min(...viewCandles.map(c => c.low));
            const max = Math.max(...viewCandles.map(c => c.high));
            return {
                mode: 'candles' as const,
                candles: viewCandles,
                points: viewCandles.map(c => ({
                    epoch: c.epoch,
                    quote: c.close,
                    digit: c.digit,
                })),
                min,
                max,
            };
        }

        const slice = ticks.slice(-visibleCount);
        const min = Math.min(...slice.map(t => t.quote));
        const max = Math.max(...slice.map(t => t.quote));
        return {
            mode: 'line' as const,
            candles: [],
            points: slice,
            min,
            max,
        };
    }, [ticks, zoomIndex, timeframe, seriesMode]);

    const latestTick = ticks.length ? ticks[ticks.length - 1] : null;
    const prevTick = ticks.length >= 2 ? ticks[ticks.length - 2] : latestTick;
    const priceDelta = latestTick && prevTick ? latestTick.quote - prevTick.quote : 0;
    const priceDeltaPct =
        latestTick && prevTick && prevTick.quote !== 0
            ? (priceDelta / prevTick.quote) * 100
            : 0;

    async function connectAccount() {
        try {
            const url = await generateOAuthURL();
            if (url) window.location.replace(url);
            else setMessage('Unable to start Deriv login.');
        } catch (e: any) {
            setMessage(e?.message || 'Unable to start Deriv login.');
        }
    }

    async function handleBuyLeg(leg: LegDefinition) {
        if (!isAuthorizedSession) {
            void connectAccount();
            return;
        }
        if (!leg.valid || buyInFlightRef.current) return;

        buyInFlightRef.current = true;
        setBuyingLeg(leg.key);
        setMessage('');

        const safeAmt = Math.max(0.35, Number(amount) || 1);
        const tpNum = Number(accuTakeProfit);

        try {
            const { contractId, buyPrice, payout, longcode } = await executeLiveDerivTrade({
                symbol,
                contractType: leg.contractType,
                stake: safeAmt,
                basis,
                duration,
                durationUnit,
                barrier: leg.barrier,
                growthRate,
                takeProfit: Number.isFinite(tpNum) && tpNum > 0 ? tpNum : undefined,
                currency: activeCurrency,
                tabNamespace: 'dtrader',
                stores: { transactions },
                onContractUpdate: pc => {
                    const st = String(pc.status || (pc.is_sold ? 'sold' : 'open'));
                    const cid = Number(pc.contract_id);
                    setOpenContracts(prev =>
                        prev.map(x =>
                            x.id === cid
                                ? {
                                      ...x,
                                      status: st,
                                      profit: Number(pc.profit || 0),
                                      bid: Number(pc.bid_price || 0),
                                      payout: Number(pc.payout || x.payout || 0),
                                      isValidToSell: Boolean(pc.is_valid_to_sell),
                                  }
                                : x
                        )
                    );
                },
            });

            setRecordOpen(true);
            setOpenContracts(prev =>
                [
                    {
                        id: contractId,
                        label: leg.title,
                        status: 'open',
                        profit: 0,
                        bid: buyPrice,
                        payout,
                        isValidToSell: leg.contractType === 'ACCU' || durationUnit === 'm',
                    },
                    ...prev,
                ].slice(0, 20)
            );
            setMessage(longcode ? `Bought: ${longcode}` : `Contract purchased: #${contractId}`);
        } catch (e: any) {
            setMessage(extractDerivApiError(e, 'Purchase failed — please try again.'));
        } finally {
            buyInFlightRef.current = false;
            setBuyingLeg(null);
        }
    }

    async function sellContract(contractId: number) {
        const transport = getTransport();
        if (!transport?.send) return;
        try {
            await sendWithTimeout(transport.send.bind(transport), { sell: contractId, price: 0 });
            setMessage(`Sell order submitted for #${contractId}`);
        } catch (e: any) {
            setMessage(extractDerivApiError(e, 'Sell request failed.'));
        }
    }

    const filteredMarkets = markets.filter(m =>
        `${m.symbol} ${m.name}`.toLowerCase().includes(search.toLowerCase())
    );

    const stepAmount = (dir: -1 | 1) => {
        setAmount(prev => {
            const cur = Number(prev) || 1;
            const delta = cur <= 2 ? 0.5 : 1;
            return Math.max(0.35, Number((cur + dir * delta).toFixed(2)));
        });
    };

    // SVG coordinate constants
    const svgW = 920;
    const svgH = 380;
    const plotLeft = 14;
    const plotRight = 838;
    const plotTop = 18;
    const plotBottom = 344;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    const renderChartSvg = () => {
        if (!chartData || chartData.points.length < 2) {
            return (
                <svg viewBox={`0 0 ${svgW} ${svgH}`} className='rm-dtrader__svg'>
                    <text
                        x={svgW / 2}
                        y={svgH / 2}
                        textAnchor='middle'
                        fill='#64748b'
                        fontSize='14'
                    >
                        Streaming live market data for {selectedMarket.name}…
                    </text>
                </svg>
            );
        }

        const { min, max, points, candles, mode } = chartData;
        const pad = (max - min || 0.2) * 0.12;
        const yMin = min - pad;
        const yMax = max + pad;
        const ySpan = yMax - yMin || 1;

        const yFor = (price: number) =>
            plotBottom - ((price - yMin) / ySpan) * plotHeight;
        const xFor = (idx: number, count: number) =>
            plotLeft + (idx / Math.max(1, count - 1)) * plotWidth;

        const yTicks = Array.from({ length: 7 }, (_, i) => {
            const val = yMax - (i / 6) * ySpan;
            return { val, y: yFor(val) };
        });

        const xTickIndices = Array.from({ length: 7 }, (_, i) =>
            Math.min(points.length - 1, Math.round((i / 6) * (points.length - 1)))
        );

        const lastPt = points[points.length - 1];
        const lastY = yFor(lastPt.quote);

        const lineCoords = points.map((pt, i) => ({
            x: xFor(i, points.length),
            y: yFor(pt.quote),
            pt,
        }));
        const linePath = `M ${lineCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L ')}`;
        const areaPath = `${linePath} L ${lineCoords[lineCoords.length - 1].x.toFixed(1)},${plotBottom} L ${lineCoords[0].x.toFixed(1)},${plotBottom} Z`;

        const digitNodes =
            overlayMode === 'digits' && mode === 'line' ? lineCoords.slice(-14) : [];

        return (
            <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                preserveAspectRatio='none'
                className='rm-dtrader__svg'
                onMouseMove={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * svgW;
                    if (relX < plotLeft || relX > plotRight) {
                        setHoverIndex(null);
                        return;
                    }
                    const idx = Math.round(
                        ((relX - plotLeft) / plotWidth) * (points.length - 1)
                    );
                    setHoverIndex(Math.max(0, Math.min(points.length - 1, idx)));
                }}
                onMouseLeave={() => setHoverIndex(null)}
            >
                <defs>
                    <linearGradient id='rmDtAreaGrad' x1='0' y1='0' x2='0' y2='1'>
                        <stop offset='0%' stopColor='#0066ff' stopOpacity='0.34' />
                        <stop offset='100%' stopColor='#0066ff' stopOpacity='0.0' />
                    </linearGradient>
                </defs>

                {/* Horizontal Grid + Right Price Axis */}
                {yTicks.map((yt, idx) => (
                    <g key={`yt-${idx}`}>
                        <line
                            x1={plotLeft}
                            x2={plotRight}
                            y1={yt.y}
                            y2={yt.y}
                            stroke='#131c2e'
                            strokeWidth='1'
                        />
                        <text
                            x={plotRight + 8}
                            y={yt.y + 4}
                            fill='#64748b'
                            fontSize='11'
                            fontFamily='Inter, sans-serif'
                        >
                            {yt.val.toFixed(decimals)}
                        </text>
                    </g>
                ))}

                {/* Bottom Timestamps */}
                {xTickIndices.map((ptIdx, idx) => {
                    const x = xFor(ptIdx, points.length);
                    const ep = points[ptIdx]?.epoch;
                    return (
                        <text
                            key={`xt-${idx}`}
                            x={x}
                            y={svgH - 8}
                            textAnchor='middle'
                            fill='#64748b'
                            fontSize='10.5'
                            fontFamily='Inter, sans-serif'
                        >
                            {ep ? formatEpochTime(ep) : ''}
                        </text>
                    );
                })}

                {mode === 'candles' ? (
                    candles.map((c, idx) => {
                        const x = xFor(idx, candles.length);
                        const up = c.close >= c.open;
                        const color = up ? '#10b981' : '#ef4444';
                        const topY = yFor(Math.max(c.open, c.close));
                        const botY = yFor(Math.min(c.open, c.close));
                        const bodyH = Math.max(2, botY - topY);
                        const candleW = Math.max(4, Math.min(14, (plotWidth / candles.length) * 0.62));
                        return (
                            <g key={`cdl-${idx}`}>
                                <line
                                    x1={x}
                                    x2={x}
                                    y1={yFor(c.high)}
                                    y2={yFor(c.low)}
                                    stroke={color}
                                    strokeWidth='1.4'
                                />
                                <rect
                                    x={x - candleW / 2}
                                    y={topY}
                                    width={candleW}
                                    height={bodyH}
                                    rx='1.5'
                                    fill={color}
                                />
                            </g>
                        );
                    })
                ) : (
                    <>
                        <path d={areaPath} fill='url(#rmDtAreaGrad)' />
                        <path
                            d={linePath}
                            fill='none'
                            stroke='#2563eb'
                            strokeWidth='2.2'
                            strokeLinejoin='round'
                        />
                    </>
                )}

                {/* Current Price Guide Line & Right Tag */}
                <line
                    x1={plotLeft}
                    x2={plotRight}
                    y1={lastY}
                    y2={lastY}
                    stroke='#3b82f6'
                    strokeDasharray='4 4'
                    strokeOpacity='0.6'
                />
                <rect
                    x={plotRight + 3}
                    y={lastY - 10}
                    width={76}
                    height={20}
                    rx={4}
                    fill='#0066ff'
                />
                <text
                    x={plotRight + 41}
                    y={lastY + 4}
                    textAnchor='middle'
                    fill='#ffffff'
                    fontSize='11'
                    fontWeight='700'
                >
                    {lastPt.quote.toFixed(decimals)}
                </text>

                {/* Live Digit Bubbles on Recent Ticks (Digits Overlay Mode) */}
                {digitNodes.map((node, idx) => {
                    const isLatest = idx === digitNodes.length - 1;
                    return (
                        <g key={`dn-${idx}`}>
                            <circle
                                cx={node.x}
                                cy={node.y}
                                r={isLatest ? 10.5 : 8.5}
                                fill={isLatest ? '#0066ff' : '#1e293b'}
                                stroke={isLatest ? '#93c5fd' : '#475569'}
                                strokeWidth='1.4'
                            />
                            <text
                                x={node.x}
                                y={node.y + 3.8}
                                textAnchor='middle'
                                fill='#ffffff'
                                fontSize='10'
                                fontWeight='700'
                            >
                                {node.pt.digit}
                            </text>
                        </g>
                    );
                })}

                {/* Hover Crosshair */}
                {hoverIndex !== null && points[hoverIndex] && (
                    <line
                        x1={xFor(hoverIndex, points.length)}
                        x2={xFor(hoverIndex, points.length)}
                        y1={plotTop}
                        y2={plotBottom}
                        stroke='#94a3b8'
                        strokeDasharray='3 3'
                        strokeOpacity='0.55'
                    />
                )}
            </svg>
        );
    };

    const hoveredPoint =
        hoverIndex !== null && chartData?.points[hoverIndex] ? chartData.points[hoverIndex] : null;

    return (
        <div className='rm-dtrader' data-testid='rm-dtrader-page'>
            <div className='rm-dtrader__split'>
                {/* Left Column: Chart + 0-9 Digit Distribution */}
                <div className='rm-dtrader__left'>
                    <section className='rm-dtrader__chart-card'>
                        <div className='rm-dtrader__chart-topbar'>
                            {/* Market Selector Pill */}
                            <div className='rm-dtrader__market-wrap'>
                                <button
                                    type='button'
                                    className='rm-dtrader__market-btn'
                                    onClick={() => setMarketOpen(v => !v)}
                                    data-testid='dtrader-market-picker'
                                >
                                    <span className='rm-dtrader__market-icon'>1s</span>
                                    <span className='rm-dtrader__market-name'>
                                        {selectedMarket.name}
                                    </span>
                                    <span>·</span>
                                    <span className='rm-dtrader__market-price'>
                                        {latestTick ? latestTick.quote.toFixed(decimals) : '—'}
                                    </span>
                                    {latestTick && (
                                        <span
                                            className={`rm-dtrader__market-delta ${
                                                priceDelta >= 0
                                                    ? 'rm-dtrader__market-delta--up'
                                                    : 'rm-dtrader__market-delta--down'
                                            }`}
                                        >
                                            {priceDelta >= 0 ? '+' : '−'}
                                            {Math.abs(priceDelta).toFixed(decimals)} (
                                            {Math.abs(priceDeltaPct).toFixed(2)}%)
                                        </span>
                                    )}
                                    <span className='rm-dtrader__market-caret'>▾</span>
                                </button>

                                {marketOpen && (
                                    <div className='rm-dtrader__market-dropdown'>
                                        <div className='rm-dtrader__market-search'>
                                            <input
                                                autoFocus
                                                value={search}
                                                onChange={e => setSearch(e.target.value)}
                                                placeholder='Search Volatility, Jump, Crash/Boom…'
                                            />
                                            <button
                                                type='button'
                                                onClick={() => setMarketOpen(false)}
                                                aria-label='Close market selector'
                                            >
                                                ×
                                            </button>
                                        </div>
                                        <div className='rm-dtrader__market-list'>
                                            {filteredMarkets.slice(0, 80).map(m => (
                                                <button
                                                    key={m.symbol}
                                                    type='button'
                                                    className={`rm-dtrader__market-option${
                                                        m.symbol === symbol
                                                            ? ' rm-dtrader__market-option--selected'
                                                            : ''
                                                    }`}
                                                    onClick={() => {
                                                        setSymbol(m.symbol);
                                                        setMarketOpen(false);
                                                        setSearch('');
                                                    }}
                                                >
                                                    <span>{m.name}</span>
                                                    <small>{m.symbol}</small>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Chart Toolbar Controls matching RiskManagers DTrader */}
                            <div className='rm-dtrader__toolbar'>
                                <div className='rm-dtrader__seg' role='group' aria-label='Timeframe'>
                                    {(['1T', '1M', '5M'] as TimeframeKey[]).map(tf => (
                                        <button
                                            key={tf}
                                            type='button'
                                            className={`rm-dtrader__seg-btn${
                                                timeframe === tf ? ' rm-dtrader__seg-btn--active' : ''
                                            }`}
                                            onClick={() => setTimeframe(tf)}
                                        >
                                            {tf}
                                        </button>
                                    ))}
                                </div>

                                <div className='rm-dtrader__seg' role='group' aria-label='Zoom'>
                                    <button
                                        type='button'
                                        className='rm-dtrader__seg-btn'
                                        disabled={zoomIndex === 0}
                                        onClick={() => setZoomIndex(i => Math.max(0, i - 1))}
                                        title='Zoom in'
                                    >
                                        +
                                    </button>
                                    <button
                                        type='button'
                                        className='rm-dtrader__seg-btn'
                                        disabled={zoomIndex === ZOOM_STEPS.length - 1}
                                        onClick={() =>
                                            setZoomIndex(i => Math.min(ZOOM_STEPS.length - 1, i + 1))
                                        }
                                        title='Zoom out'
                                    >
                                        −
                                    </button>
                                </div>

                                <div className='rm-dtrader__seg' role='group' aria-label='Chart overlay'>
                                    <button
                                        type='button'
                                        className={`rm-dtrader__seg-btn${
                                            overlayMode === 'default'
                                                ? ' rm-dtrader__seg-btn--active'
                                                : ''
                                        }`}
                                        onClick={() => setOverlayMode('default')}
                                    >
                                        Default
                                    </button>
                                    <button
                                        type='button'
                                        className={`rm-dtrader__seg-btn${
                                            overlayMode === 'digits'
                                                ? ' rm-dtrader__seg-btn--active'
                                                : ''
                                        }`}
                                        onClick={() => setOverlayMode('digits')}
                                    >
                                        Digits
                                    </button>
                                </div>

                                <div className='rm-dtrader__seg' role='group' aria-label='Chart type'>
                                    <button
                                        type='button'
                                        className={`rm-dtrader__seg-btn${
                                            seriesMode === 'line'
                                                ? ' rm-dtrader__seg-btn--active'
                                                : ''
                                        }`}
                                        onClick={() => setSeriesMode('line')}
                                    >
                                        Line
                                    </button>
                                    <button
                                        type='button'
                                        className={`rm-dtrader__seg-btn${
                                            seriesMode === 'candles'
                                                ? ' rm-dtrader__seg-btn--active'
                                                : ''
                                        }`}
                                        onClick={() => setSeriesMode('candles')}
                                    >
                                        Candles
                                    </button>
                                </div>

                                <span
                                    className={`rm-dtrader__live-pill${
                                        feedState !== 'LIVE'
                                            ? ' rm-dtrader__live-pill--connecting'
                                            : ''
                                    }`}
                                >
                                    <i />
                                    {feedState === 'LIVE' ? 'Live' : 'Connecting'}
                                </span>

                                <button
                                    type='button'
                                    className={`rm-dtrader__drawer-btn${
                                        recordOpen ? ' rm-dtrader__drawer-btn--active' : ''
                                    }`}
                                    onClick={() => setRecordOpen(v => !v)}
                                    title='Toggle DTrader Positions & Record'
                                >
                                    ☷
                                </button>
                            </div>
                        </div>

                        <div className='rm-dtrader__canvas-wrap'>
                            {hoveredPoint && (
                                <div className='rm-dtrader__hover-tip'>
                                    <span>{formatEpochTime(hoveredPoint.epoch)}</span>
                                    <strong>{hoveredPoint.quote.toFixed(decimals)}</strong>
                                    <span>Digit: {hoveredPoint.digit}</span>
                                </div>
                            )}
                            {renderChartSvg()}
                        </div>
                    </section>

                    {/* Bottom 0-9 Digit Distribution Strip */}
                    <section className='rm-dtrader__digits-card'>
                        <div className='rm-dtrader__digits-head'>
                            <div className='rm-dtrader__digits-title'>
                                <span>0–9 Digit Distribution</span>
                                <span className='rm-dtrader__digits-sub'>
                                    ({digitStats.sampleCount} ticks)
                                </span>
                            </div>

                            <div className='rm-dtrader__digits-controls'>
                                <div className='rm-dtrader__seg'>
                                    {[100, 500, 1000].map(w => (
                                        <button
                                            key={w}
                                            type='button'
                                            className={`rm-dtrader__seg-btn${
                                                digitWindow === w
                                                    ? ' rm-dtrader__seg-btn--active'
                                                    : ''
                                            }`}
                                            onClick={() => setDigitWindow(w)}
                                        >
                                            {w}t
                                        </button>
                                    ))}
                                </div>
                                <span
                                    className='rm-dtrader__info-badge'
                                    title='Green marks the highest-frequency digit, red marks the lowest-frequency digit, and ▲ marks the latest tick digit.'
                                >
                                    i
                                </span>
                            </div>
                        </div>

                        <div className='rm-dtrader__digits-row'>
                            {digitStats.pcts.map((pct, d) => {
                                const isHighest = d === digitStats.highestDigit;
                                const isLowest = d === digitStats.lowestDigit;
                                const isCurrent = d === digitStats.currentDigit;
                                const isSelected =
                                    groupMeta.usesDigitPrediction && prediction === d;
                                const arcColor = isHighest
                                    ? '#10b981'
                                    : isLowest
                                      ? '#ef4444'
                                      : isCurrent
                                        ? '#3b82f6'
                                        : '#475569';
                                const clampedRatio = Math.min(1, Math.max(0.05, pct / 22));
                                const arcLen = 69.1; // pi * r (r=22)
                                const dashOffset = arcLen * (1 - clampedRatio);

                                return (
                                    <button
                                        key={d}
                                        type='button'
                                        className={
                                            'rm-dtrader__arc-item' +
                                            (isHighest ? ' rm-dtrader__arc-item--highest' : '') +
                                            (isLowest ? ' rm-dtrader__arc-item--lowest' : '') +
                                            (isSelected ? ' rm-dtrader__arc-item--selected' : '') +
                                            (isCurrent ? ' rm-dtrader__arc-item--current' : '')
                                        }
                                        onClick={() => {
                                            if (groupMeta.usesDigitPrediction) {
                                                setPrediction(d);
                                            }
                                        }}
                                    >
                                        <svg viewBox='0 0 56 34' className='rm-dtrader__arc-svg'>
                                            <path
                                                d='M 6 30 A 22 22 0 0 1 50 30'
                                                fill='none'
                                                stroke='#1e293b'
                                                strokeWidth='4.5'
                                                strokeLinecap='round'
                                            />
                                            <path
                                                d='M 6 30 A 22 22 0 0 1 50 30'
                                                fill='none'
                                                stroke={arcColor}
                                                strokeWidth='4.5'
                                                strokeLinecap='round'
                                                strokeDasharray={arcLen}
                                                strokeDashoffset={dashOffset}
                                            />
                                            <text
                                                x='28'
                                                y='29'
                                                textAnchor='middle'
                                                fill='#f8fafc'
                                                fontSize='14'
                                                fontWeight='700'
                                            >
                                                {d}
                                            </text>
                                        </svg>

                                        <span
                                            className={
                                                'rm-dtrader__arc-pct' +
                                                (isHighest ? ' rm-dtrader__arc-pct--highest' : '') +
                                                (isLowest ? ' rm-dtrader__arc-pct--lowest' : '')
                                            }
                                        >
                                            {pct.toFixed(1)}%
                                        </span>

                                        <span className='rm-dtrader__arc-cursor'>
                                            {isCurrent ? '▲' : ''}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                </div>

                {/* Right Sidebar: Authentic DTrader Trade Panel */}
                <aside className='rm-dtrader__sidebar' aria-label='DTrader trade panel'>
                    <div className='rm-dtrader__field'>
                        <span className='rm-dtrader__label'>Trade Type</span>
                        <select
                            className='rm-dtrader__select'
                            value={tradeGroup}
                            aria-label='Trade Type'
                            onChange={e => setTradeGroup(e.target.value as DTraderGroup)}
                        >
                            {TRADE_GROUPS.map(g => (
                                <option key={g.id} value={g.id}>
                                    {g.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {tradeGroup !== 'accumulators' ? (
                        <div className='rm-dtrader__field'>
                            <div className='rm-dtrader__tabs-2'>
                                <button
                                    type='button'
                                    className={durationUnit === 't' ? 'is-active' : ''}
                                    onClick={() => setDurationUnit('t')}
                                >
                                    Ticks
                                </button>
                                <button
                                    type='button'
                                    disabled={!groupMeta.supportsMinutes}
                                    className={durationUnit === 'm' ? 'is-active' : ''}
                                    onClick={() => {
                                        setDurationUnit('m');
                                        setDuration(d => Math.max(1, d));
                                    }}
                                >
                                    Minutes
                                </button>
                            </div>

                            {durationUnit === 't' ? (
                                <>
                                    <span className='rm-dtrader__label'>
                                        <span>Ticks: {duration}</span>
                                        <span className='rm-dtrader__label-muted'>
                                            {groupMeta.minTicks}–{groupMeta.maxTicks}
                                        </span>
                                    </span>
                                    <input
                                        type='range'
                                        className='rm-dtrader__slider'
                                        min={groupMeta.minTicks}
                                        max={groupMeta.maxTicks}
                                        value={duration}
                                        onChange={e => setDuration(Number(e.target.value))}
                                    />
                                    <div className='rm-dtrader__tick-pills'>
                                        {[1, 2, 3, 5, 10].map(t => (
                                            <button
                                                key={t}
                                                type='button'
                                                disabled={
                                                    t < groupMeta.minTicks || t > groupMeta.maxTicks
                                                }
                                                className={duration === t ? 'is-active' : ''}
                                                onClick={() => setDuration(t)}
                                            >
                                                {t}t
                                            </button>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <>
                                    <span className='rm-dtrader__label'>
                                        <span>Minutes</span>
                                        <span className='rm-dtrader__label-muted'>1–1440m</span>
                                    </span>
                                    <div className='rm-dtrader__stake-box'>
                                        <input
                                            type='number'
                                            min={1}
                                            max={1440}
                                            value={duration}
                                            onChange={e =>
                                                setDuration(Math.max(1, Number(e.target.value) || 1))
                                            }
                                        />
                                        <span>MIN</span>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        /* Accumulators Growth Rate & Take Profit */
                        <div className='rm-dtrader__field'>
                            <span className='rm-dtrader__label'>Growth Rate</span>
                            <div className='rm-dtrader__tick-pills'>
                                {[0.01, 0.02, 0.03, 0.04, 0.05].map(gr => (
                                    <button
                                        key={gr}
                                        type='button'
                                        className={growthRate === gr ? 'is-active' : ''}
                                        onClick={() => setGrowthRate(gr)}
                                    >
                                        {Math.round(gr * 100)}%
                                    </button>
                                ))}
                            </div>

                            <span className='rm-dtrader__label' style={{ marginTop: '0.4rem' }}>
                                <span>Take Profit (optional)</span>
                                <span className='rm-dtrader__label-muted'>{activeCurrency}</span>
                            </span>
                            <div className='rm-dtrader__stake-box'>
                                <input
                                    type='number'
                                    min={0}
                                    step='0.5'
                                    placeholder='None'
                                    value={accuTakeProfit}
                                    onChange={e => setAccuTakeProfit(e.target.value)}
                                />
                                <span>{activeCurrency}</span>
                            </div>
                        </div>
                    )}

                    {/* Last Digit Prediction 0-9 Grid */}
                    {groupMeta.usesDigitPrediction && (
                        <div className='rm-dtrader__field'>
                            <span className='rm-dtrader__label'>Last Digit Prediction</span>
                            <div
                                className='rm-dtrader__pred-grid'
                                role='group'
                                aria-label='Last Digit Prediction'
                            >
                                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
                                    <button
                                        key={d}
                                        type='button'
                                        className={prediction === d ? 'is-active' : ''}
                                        onClick={() => setPrediction(d)}
                                    >
                                        {d}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Barrier Offset Input for Higher/Lower & Touch/No Touch */}
                    {groupMeta.usesBarrierOffset && (
                        <div className='rm-dtrader__field'>
                            <span className='rm-dtrader__label'>Barrier Offset</span>
                            <div className='rm-dtrader__stake-box'>
                                <input
                                    type='number'
                                    min={0.01}
                                    step='0.1'
                                    value={barrierOffset}
                                    onChange={e =>
                                        setBarrierOffset(Math.max(0.01, Number(e.target.value) || 0.5))
                                    }
                                />
                                <span>±SPOT</span>
                            </div>
                        </div>
                    )}

                    {/* Allow Equals for Rise/Fall */}
                    {tradeGroup === 'rise_fall' && (
                        <label className='rm-dtrader__equals-check'>
                            <input
                                type='checkbox'
                                checked={allowEquals}
                                onChange={e => setAllowEquals(e.target.checked)}
                            />
                            <span>Allow equals</span>
                        </label>
                    )}

                    {/* Stake | Payout Toggle + Stepper */}
                    <div className='rm-dtrader__field'>
                        {tradeGroup !== 'accumulators' && (
                            <div className='rm-dtrader__tabs-2'>
                                <button
                                    type='button'
                                    className={basis === 'stake' ? 'is-active' : ''}
                                    onClick={() => setBasis('stake')}
                                >
                                    Stake
                                </button>
                                <button
                                    type='button'
                                    className={basis === 'payout' ? 'is-active' : ''}
                                    onClick={() => setBasis('payout')}
                                >
                                    Payout
                                </button>
                            </div>
                        )}

                        <div className='rm-dtrader__stepper'>
                            <button
                                type='button'
                                onClick={() => stepAmount(-1)}
                                aria-label='Decrease stake'
                            >
                                −
                            </button>
                            <div className='rm-dtrader__stake-box'>
                                <input
                                    type='number'
                                    min={0.35}
                                    step='0.01'
                                    value={amount}
                                    aria-label='Stake amount'
                                    onChange={e =>
                                        setAmount(Math.max(0.35, Number(e.target.value) || 0.35))
                                    }
                                />
                                <span>{activeCurrency}</span>
                            </div>
                            <button
                                type='button'
                                onClick={() => stepAmount(1)}
                                aria-label='Increase stake'
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Dual Live DTrader Purchase Buttons */}
                    <div className='rm-dtrader__purchase-stack'>
                        {pairLegs.map(leg => {
                            const prop = proposals[leg.key];
                            const safeAmt = Math.max(0.35, Number(amount) || 1);
                            const liveAsk =
                                prop?.ask_price != null ? Number(prop.ask_price) : safeAmt;
                            const livePayout =
                                prop?.payout != null
                                    ? Number(prop.payout)
                                    : basis === 'payout'
                                      ? safeAmt
                                      : safeAmt * (1 + leg.fallbackNetRatio);
                            const netPct =
                                liveAsk > 0 ? ((livePayout - liveAsk) / liveAsk) * 100 : 0;

                            return (
                                <button
                                    key={leg.key}
                                    type='button'
                                    disabled={!leg.valid || buyingLeg !== null}
                                    className={`rm-dtrader__buy-card rm-dtrader__buy-card--${leg.key}`}
                                    onClick={() => void handleBuyLeg(leg)}
                                    data-testid={`dtrader-buy-${leg.key}`}
                                >
                                    <span className='rm-dtrader__buy-title'>
                                        {buyingLeg === leg.key
                                            ? `Buying ${leg.title}…`
                                            : `${leg.title} — Payout`}
                                    </span>
                                    <span className='rm-dtrader__buy-sub'>
                                        {!leg.valid
                                            ? leg.invalidHint
                                            : leg.contractType === 'ACCU'
                                              ? `Stake ${safeAmt.toFixed(2)} ${activeCurrency} · +${Math.round(
                                                    growthRate * 100
                                                )}%/tick`
                                              : `${livePayout.toFixed(2)} ${activeCurrency} (+${netPct.toFixed(
                                                    1
                                                )}%)`}
                                    </span>
                                </button>
                            );
                        })}

                        {!isAuthorizedSession && (
                            <button
                                type='button'
                                className='rm-dtrader__login-cta'
                                onClick={() => void connectAccount()}
                            >
                                Log in with Deriv to Trade Live
                            </button>
                        )}
                    </div>

                    {message && <div className='rm-dtrader__status-note'>{message}</div>}

                    {/* Open Positions Box */}
                    <div className='rm-dtrader__positions-box'>
                        <div className='rm-dtrader__positions-head'>
                            <span>Open Positions ({openContracts.filter(c => !TERMINAL_STATUSES.includes(c.status)).length})</span>
                            {openContracts.length > 0 && (
                                <button
                                    type='button'
                                    className='rm-dtrader__sell-btn'
                                    onClick={() => {
                                        setRecordOpen(true);
                                        setRecordTab('transactions');
                                    }}
                                >
                                    View All
                                </button>
                            )}
                        </div>

                        {openContracts.slice(0, 4).map(oc => {
                            const statusText = String(oc?.status || 'open');
                            const resolved = TERMINAL_STATUSES.includes(statusText);
                            const pl = Number(oc.profit || 0);
                            return (
                                <div
                                    key={oc.id}
                                    className={
                                        'rm-dtrader__pos-item' +
                                        (resolved ? ` rm-dtrader__pos-item--${statusText}` : '')
                                    }
                                >
                                    <div className='rm-dtrader__pos-top'>
                                        <span>
                                            {resolved
                                                ? `CONTRACT ${statusText.toUpperCase()}`
                                                : 'OPEN CONTRACT'}{' '}
                                            · {oc.label}
                                        </span>
                                        <span
                                            style={{
                                                color: pl >= 0 ? '#10b981' : '#ef4444',
                                            }}
                                        >
                                            {pl >= 0 ? '+' : ''}
                                            {pl.toFixed(2)} {activeCurrency}
                                        </span>
                                    </div>
                                    <div className='rm-dtrader__pos-meta'>
                                        <span>#{oc.id}</span>
                                        <button
                                            type='button'
                                            className='rm-dtrader__sell-btn'
                                            disabled={resolved}
                                            onClick={() => void sellContract(oc.id)}
                                        >
                                            {resolved ? 'SETTLED' : 'SELL NOW'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </aside>
            </div>

            <TabExecutionRecordPanel
                namespace='dtrader'
                title='DTRADER RECORD'
                previewTitle='DTrader Transactions (Preview)'
                resetLabel='Reset DTrader'
                emptyHint='Place a trade on the DTrader panel to stream live DTrader Journal logs and Transactions records here.'
                variant='dtrader'
                activeTab={recordTab}
                onActiveTabChange={setRecordTab}
                isOpen={recordOpen}
                onToggleOpen={setRecordOpen}
                currencyFallback={activeCurrency}
            />

            <TabSessionDockBar
                namespace='dtrader'
                resetLabel='Reset DTrader'
                activeTab={recordTab}
                isOpen={recordOpen}
                onSelectTab={tab => {
                    setRecordOpen(true);
                    setRecordTab(tab);
                }}
                currencyFallback={activeCurrency}
            />
        </div>
    );
});
