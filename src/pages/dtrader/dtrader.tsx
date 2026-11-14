import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
import { autoDockRunPanel, triggerTpSlModal } from '@/components/tp-sl-modal';
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
    | 'matches_differs'
    | 'over_under'
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
type TriggerMode = 'instant' | 'adaptive' | 'opp1' | 'opp2';
type LoopMode = 'single' | 'continuous';

interface TradeGroupOption {
    id: DTraderGroup;
    label: string;
    categoryBadge: string;
    supportsMinutes: boolean;
    usesDigitPrediction: boolean;
    usesBarrierOffset: boolean;
    minTicks: number;
    maxTicks: number;
}

const TRADE_GROUPS: TradeGroupOption[] = [
    {
        id: 'matches_differs',
        label: 'Matches/Differs',
        categoryBadge: 'Digits',
        supportsMinutes: false,
        usesDigitPrediction: true,
        usesBarrierOffset: false,
        minTicks: 1,
        maxTicks: 10,
    },
    {
        id: 'over_under',
        label: 'Over/Under',
        categoryBadge: 'Digits',
        supportsMinutes: false,
        usesDigitPrediction: true,
        usesBarrierOffset: false,
        minTicks: 1,
        maxTicks: 10,
    },
    {
        id: 'even_odd',
        label: 'Even/Odd',
        categoryBadge: 'Digits',
        supportsMinutes: false,
        usesDigitPrediction: false,
        usesBarrierOffset: false,
        minTicks: 1,
        maxTicks: 10,
    },
    {
        id: 'rise_fall',
        label: 'Rise/Fall',
        categoryBadge: 'Up/Down',
        supportsMinutes: true,
        usesDigitPrediction: false,
        usesBarrierOffset: false,
        minTicks: 1,
        maxTicks: 10,
    },
    {
        id: 'higher_lower',
        label: 'Higher/Lower',
        categoryBadge: 'Up/Down',
        supportsMinutes: true,
        usesDigitPrediction: false,
        usesBarrierOffset: true,
        minTicks: 5,
        maxTicks: 10,
    },
    {
        id: 'reset',
        label: 'Reset Call/Put',
        categoryBadge: 'Reset',
        supportsMinutes: true,
        usesDigitPrediction: false,
        usesBarrierOffset: false,
        minTicks: 5,
        maxTicks: 10,
    },
    {
        id: 'runs',
        label: 'Only Ups/Downs',
        categoryBadge: 'Runs',
        supportsMinutes: false,
        usesDigitPrediction: false,
        usesBarrierOffset: false,
        minTicks: 2,
        maxTicks: 5,
    },
    {
        id: 'touch',
        label: 'Touch/No Touch',
        categoryBadge: 'In/Out',
        supportsMinutes: true,
        usesDigitPrediction: false,
        usesBarrierOffset: true,
        minTicks: 5,
        maxTicks: 10,
    },
    {
        id: 'accumulators',
        label: 'Accumulators',
        categoryBadge: 'Growth',
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

function formatEpochFull(epochSec: number): string {
    const d = new Date(epochSec * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hhmmss = d.toTimeString().slice(0, 8);
    return `${yyyy}-${mm}-${dd} ${hhmmss}`;
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

function parseMarketBadge(symbolCode: string): { num: string; is1s: boolean } {
    const m1s = /^1HZ(\d+)V$/i.exec(symbolCode);
    if (m1s) return { num: m1s[1], is1s: true };
    const mVol = /^R_(\d+)$/i.exec(symbolCode);
    if (mVol) return { num: mVol[1], is1s: false };
    const mJump = /^JD(\d+)$/i.exec(symbolCode);
    if (mJump) return { num: `J${mJump[1]}`, is1s: false };
    return { num: symbolCode.slice(0, 3).toUpperCase(), is1s: false };
}

interface LegDefinition {
    key: 'up' | 'down';
    contractType: string;
    shortTitle: string;
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
        case 'matches_differs':
            return [
                {
                    key: 'up',
                    contractType: 'DIGITMATCH',
                    shortTitle: 'Matches',
                    title: `Matches ${d}`,
                    barrier: d,
                    valid: true,
                    fallbackNetRatio: 7.95,
                },
                {
                    key: 'down',
                    contractType: 'DIGITDIFF',
                    shortTitle: 'Differs',
                    title: `Differs ${d}`,
                    barrier: d,
                    valid: true,
                    fallbackNetRatio: 0.088,
                },
            ];
        case 'over_under':
            return [
                {
                    key: 'up',
                    contractType: 'DIGITOVER',
                    shortTitle: 'Over',
                    title: `Over ${d}`,
                    barrier: d,
                    valid: d >= 0 && d <= 8,
                    invalidHint: 'Select digit 0–8 for Over',
                    fallbackNetRatio: OVER_RATIOS[Math.min(8, d)] ?? 0.405,
                },
                {
                    key: 'down',
                    contractType: 'DIGITUNDER',
                    shortTitle: 'Under',
                    title: `Under ${d}`,
                    barrier: d,
                    valid: d >= 1 && d <= 9,
                    invalidHint: 'Select digit 1–9 for Under',
                    fallbackNetRatio: OVER_RATIOS[Math.min(8, Math.max(0, 9 - d))] ?? 0.405,
                },
            ];
        case 'even_odd':
            return [
                {
                    key: 'up',
                    contractType: 'DIGITEVEN',
                    shortTitle: 'Even',
                    title: 'Even',
                    valid: true,
                    fallbackNetRatio: 0.961,
                },
                {
                    key: 'down',
                    contractType: 'DIGITODD',
                    shortTitle: 'Odd',
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
                    shortTitle: allowEquals ? 'Rise =' : 'Rise',
                    title: allowEquals ? 'Rise =' : 'Rise',
                    valid: true,
                    fallbackNetRatio: 0.953,
                },
                {
                    key: 'down',
                    contractType: allowEquals ? 'PUTE' : 'PUT',
                    shortTitle: allowEquals ? 'Fall =' : 'Fall',
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
                    shortTitle: 'Higher',
                    title: `Higher (+${safeOffset})`,
                    barrier: safeOffset,
                    valid: true,
                    fallbackNetRatio: 1.35,
                },
                {
                    key: 'down',
                    contractType: 'LOWER',
                    shortTitle: 'Lower',
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
                    shortTitle: 'Reset Call',
                    title: 'Reset Call',
                    valid: true,
                    fallbackNetRatio: 0.88,
                },
                {
                    key: 'down',
                    contractType: 'RESETPUT',
                    shortTitle: 'Reset Put',
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
                    shortTitle: 'Only Ups',
                    title: 'Only Ups',
                    valid: true,
                    fallbackNetRatio: 2.86,
                },
                {
                    key: 'down',
                    contractType: 'RUNLOW',
                    shortTitle: 'Only Downs',
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
                    shortTitle: 'Touch',
                    title: `Touch (+${safeOffset})`,
                    barrier: safeOffset,
                    valid: true,
                    fallbackNetRatio: 1.15,
                },
                {
                    key: 'down',
                    contractType: 'NOTOUCH',
                    shortTitle: 'No Touch',
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
                    shortTitle: 'Buy Accumulator',
                    title: `Buy Accumulator (${Math.round(growthRate * 100)}%)`,
                    valid: true,
                    fallbackNetRatio: growthRate,
                },
            ];
    }
}

export default observer(function DTrader() {
    const store = useStore();
    const { client, journal, transactions, summary_card, run_panel } = store || ({} as any);

    const [symbol, setSymbol] = useState('1HZ100V');
    const [markets, setMarkets] = useState<any[]>(DEFAULT_MARKETS);
    const [marketOpen, setMarketOpen] = useState(false);
    const [search, setSearch] = useState('');

    // SmartCharts-style controls matching logged-in DTrader reference
    const [timeframe, setTimeframe] = useState<TimeframeKey>('1T');
    const [zoomIndex, setZoomIndex] = useState<number>(2);
    const [overlayMode, setOverlayMode] = useState<OverlayMode>('digits');
    const [seriesMode, setSeriesMode] = useState<SeriesMode>('candles');
    const [showSma, setShowSma] = useState<boolean>(false);
    const [denseGrid, setDenseGrid] = useState<boolean>(true);
    const [crosshairEnabled, setCrosshairEnabled] = useState<boolean>(true);
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);

    const [ticks, setTicks] = useState<TickPoint[]>([]);

    // Floating Right Execution & Auto-Bot Card state
    const [tradeGroup, setTradeGroup] = useState<DTraderGroup>('matches_differs');
    const [durationUnit, setDurationUnit] = useState<'t' | 'm'>('t');
    const [duration, setDuration] = useState<number>(1);
    const [triggerMode, setTriggerMode] = useState<TriggerMode>('instant');
    const [prediction, setPrediction] = useState<number>(1);
    const [barrierOffset, setBarrierOffset] = useState<number>(0.5);
    const [allowEquals, setAllowEquals] = useState<boolean>(false);
    const [growthRate, setGrowthRate] = useState<number>(0.03);
    const [stakeInput, setStakeInput] = useState<string>('0.35');
    const [loopMode, setLoopMode] = useState<LoopMode>('single');
    const [tpInput, setTpInput] = useState<string>('2.5');
    const [slInput, setSlInput] = useState<string>('50');
    const [martingaleInput, setMartingaleInput] = useState<string>('1.2');

    const [proposals, setProposals] = useState<Record<string, any>>({});
    const [openContracts, setOpenContracts] = useState<any[]>([]);
    const [buyingLeg, setBuyingLeg] = useState<string | null>(null);
    const [autoRunning, setAutoRunning] = useState<boolean>(false);
    const [statusLine, setStatusLine] = useState<string>('Ready.');
    const [statusTone, setStatusTone] = useState<'neutral' | 'won' | 'lost' | 'running'>('neutral');

    const buyInFlightRef = useRef(false);
    const autoRunningRef = useRef(false);
    const sessionPLRef = useRef<number>(0);
    const currentAutoStakeRef = useRef<number>(0.35);
    const lastAutoEpochRef = useRef<number>(0);

    const baseStake = Math.max(0.35, Number(stakeInput) || 0.35);
    const parsedTP = Math.max(0.1, Number(tpInput) || 2.5);
    const parsedSL = Math.max(0.1, Number(slInput) || 50);
    const parsedMartingale = Math.max(0.1, Number(martingaleInput) || 1.2);

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
        };

        const releaseHistory = derivBus.onHistory(applyHistory);
        const releaseTick = derivBus.onTick((tickSymbol: any, tick?: any) => {
            // Support both (symbol, tick) and ({ symbol, price, t }) signatures
            const sym = typeof tickSymbol === 'string' ? tickSymbol : tickSymbol?.symbol;
            const payload = tick || tickSymbol;
            if (cancelled || sym !== symbol || !payload) return;
            const pip = derivBus.getPipSize(symbol);
            const epoch = Number(payload.t || Date.now()) / 1000;
            const quote = Number(payload.price);
            if (!Number.isFinite(quote)) return;
            const nextPt = {
                epoch,
                quote,
                digit: digitFromQuote(quote, pip),
            };
            setTicks(prev => [...prev, nextPt].slice(-1000));
            void onAutoTickRef.current?.(nextPt);
        });

        applyHistory(symbol, derivBus.getTicks(symbol));
        const releaseBus = derivBus.subscribe([symbol]);

        return () => {
            cancelled = true;
            releaseBus();
            releaseTick();
            releaseHistory();
        };
    }, [symbol]);

    useEffect(() => {
        return () => {
            autoRunningRef.current = false;
        };
    }, []);

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
            const safeAmt = baseStake;

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
                                basis: 'stake',
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
        }, 200);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [
        symbol,
        pairLegs,
        duration,
        durationUnit,
        baseStake,
        activeCurrency,
        growthRate,
        isAuthorizedSession,
    ]);

    // 0-9 circular digit distribution over rolling 1000-tick window
    const digitStats = useMemo(() => {
        const slice = ticks.slice(-1000);
        const counts = new Array(10).fill(0) as number[];
        for (const t of slice) counts[t.digit] += 1;
        const n = slice.length;
        const pcts = counts.map(c => (n > 0 ? (c / n) * 100 : 0));

        let highestDigit = -1;
        let lowestDigit = -1;
        if (slice.length >= 5) {
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
    }, [ticks]);

    // Chart series geometry (Candles OR Line + Digits bubbles)
    const chartData = useMemo(() => {
        const visibleCount = ZOOM_STEPS[zoomIndex] || 85;
        if (ticks.length < 2) return null;

        const bucketSec = timeframe === '5M' ? 300 : timeframe === '1M' ? 60 : 0;

        if (seriesMode === 'candles' || bucketSec > 0) {
            const groupSize = bucketSec > 0 ? Math.max(4, Math.round(bucketSec / 2)) : 3;
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

    const stopAllLoops = useCallback((reason = 'Stopped.', tone: 'neutral' | 'won' | 'lost' = 'neutral') => {
        autoRunningRef.current = false;
        setAutoRunning(false);
        currentAutoStakeRef.current = Math.max(0.35, Number(stakeInput) || 0.35);
        setStatusLine(reason);
        setStatusTone(tone);
    }, [stakeInput]);

    const connectAccount = useCallback(async () => {
        try {
            const url = await generateOAuthURL();
            if (url) window.location.replace(url);
            else setStatusLine('Unable to start Deriv login.');
        } catch (e: any) {
            setStatusLine(e?.message || 'Unable to start Deriv login.');
        }
    }, []);

    const checkSessionLimitsAndNotify = useCallback(
        (nextPL: number): boolean => {
            if (nextPL >= parsedTP) {
                sessionPLRef.current = 0;
                stopAllLoops(`Take Profit Hit (+${nextPL.toFixed(2)} ${activeCurrency})`, 'won');
                triggerTpSlModal({
                    type: 'tp',
                    amount: nextPL,
                    currency: activeCurrency,
                    source: 'dtrader',
                });
                return true;
            }
            if (nextPL <= -Math.abs(parsedSL)) {
                sessionPLRef.current = 0;
                stopAllLoops(`Stop Loss Hit (${nextPL.toFixed(2)} ${activeCurrency})`, 'lost');
                triggerTpSlModal({
                    type: 'sl',
                    amount: nextPL,
                    currency: activeCurrency,
                    source: 'dtrader',
                });
                return true;
            }
            return false;
        },
        [parsedTP, parsedSL, activeCurrency, stopAllLoops]
    );

    const executeOneLeg = useCallback(
        async (leg: LegDefinition, overrideStake?: number, isAutoCycle = false) => {
            if (!isAuthorizedSession) {
                void connectAccount();
                return;
            }
            if (!leg.valid) {
                setStatusLine(leg.invalidHint || 'Invalid contract barrier.');
                setStatusTone('lost');
                return;
            }

            autoDockRunPanel(run_panel, 1);
            const stakeToUse = Math.max(0.35, Number((overrideStake ?? baseStake).toFixed(2)));
            const tpOrder =
                leg.contractType === 'ACCU' && Number.isFinite(parsedTP) && parsedTP > 0
                    ? parsedTP
                    : undefined;

            let settled = false;

            const { contractId, buyPrice, payout, longcode } = await executeLiveDerivTrade({
                symbol,
                contractType: leg.contractType,
                stake: stakeToUse,
                basis: 'stake',
                duration,
                durationUnit,
                barrier: leg.barrier,
                growthRate,
                takeProfit: tpOrder,
                currency: activeCurrency,
                stores: { journal, transactions, summary_card, run_panel },
                onContractUpdate: (pc, isTerminal) => {
                    const st = String(pc.status || (pc.is_sold ? 'sold' : 'open'));
                    const cid = Number(pc.contract_id);
                    const profit = Number(pc.profit || 0);

                    setOpenContracts(prev =>
                        prev
                            .map(x =>
                                x.id === cid
                                    ? {
                                          ...x,
                                          status: st,
                                          profit,
                                          bid: Number(pc.bid_price || 0),
                                          payout: Number(pc.payout || x.payout || 0),
                                          isValidToSell: Boolean(pc.is_valid_to_sell) && !isTerminal,
                                      }
                                    : x
                            )
                            .filter(x => x.status === 'open' || x.id === cid)
                    );

                    if (isTerminal && !settled) {
                        settled = true;
                        const nextPL = Number((sessionPLRef.current + profit).toFixed(2));
                        sessionPLRef.current = nextPL;

                        if (profit >= 0) {
                            currentAutoStakeRef.current = baseStake;
                            setStatusLine(
                                `CONTRACT WON: ${leg.title} (+${profit.toFixed(2)} ${activeCurrency})`
                            );
                            setStatusTone('won');
                        } else {
                            currentAutoStakeRef.current = Math.max(
                                0.35,
                                Number((stakeToUse * parsedMartingale).toFixed(2))
                            );
                            setStatusLine(
                                `CONTRACT LOST: ${leg.title} (${profit.toFixed(2)} ${activeCurrency})`
                            );
                            setStatusTone('lost');
                        }

                        const hitLimit = checkSessionLimitsAndNotify(nextPL);
                        if (!hitLimit && (isAutoCycle || loopMode === 'continuous') && autoRunningRef.current) {
                            buyInFlightRef.current = false;
                        }
                    }
                },
            });

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
                    ...prev.filter(x => x.status === 'open'),
                ].slice(0, 8)
            );

            setStatusLine(longcode ? `Bought: ${longcode}` : `OPEN CONTRACT #${contractId}`);
            setStatusTone('running');
        },
        [
            isAuthorizedSession,
            connectAccount,
            run_panel,
            baseStake,
            parsedTP,
            symbol,
            duration,
            durationUnit,
            growthRate,
            activeCurrency,
            journal,
            transactions,
            summary_card,
            parsedMartingale,
            checkSessionLimitsAndNotify,
            loopMode,
        ]
    );

    const handleBuySingle = async (leg: LegDefinition) => {
        if (buyInFlightRef.current) return;
        buyInFlightRef.current = true;
        setBuyingLeg(leg.key);
        if (loopMode === 'continuous') {
            autoRunningRef.current = true;
            setAutoRunning(true);
            currentAutoStakeRef.current = baseStake;
        }
        try {
            await executeOneLeg(leg, baseStake, loopMode === 'continuous');
        } catch (e: any) {
            setStatusLine(extractDerivApiError(e, 'Purchase failed — please try again.'));
            setStatusTone('lost');
            autoRunningRef.current = false;
            setAutoRunning(false);
        } finally {
            buyInFlightRef.current = false;
            setBuyingLeg(null);
        }
    };

    const handleBuyBoth = async () => {
        if (pairLegs.length < 2 || buyInFlightRef.current) return;
        if (!isAuthorizedSession) {
            void connectAccount();
            return;
        }
        const [legA, legB] = pairLegs;
        if (!legA.valid || !legB.valid) {
            setStatusLine(legA.invalidHint || legB.invalidHint || 'Adjust digit 1–8 to hedge Both.');
            setStatusTone('lost');
            return;
        }

        buyInFlightRef.current = true;
        setBuyingLeg('both');
        autoDockRunPanel(run_panel, 1);

        try {
            await Promise.all([
                executeOneLeg(legA, baseStake, false),
                executeOneLeg(legB, baseStake, false),
            ]);
            setStatusLine(`Bought Both: ${legA.title} + ${legB.title}`);
            setStatusTone('running');
        } catch (e: any) {
            setStatusLine(extractDerivApiError(e, 'Dual purchase failed — please try again.'));
            setStatusTone('lost');
        } finally {
            buyInFlightRef.current = false;
            setBuyingLeg(null);
        }
    };

    // Choose smartest leg in AUTO Adaptive mode
    const pickAdaptiveAutoLeg = useCallback((): LegDefinition => {
        const legA = pairLegs[0];
        const legB = pairLegs[1];
        if (!legB) return legA;

        if (triggerMode !== 'adaptive') {
            return legA.valid ? legA : legB;
        }

        if (tradeGroup === 'matches_differs') {
            // Differs has ~90% win rate when predicted digit isn't spiking
            return legB;
        }

        if (tradeGroup === 'over_under') {
            const d = Math.max(0, Math.min(9, Math.round(prediction)));
            const overProb = digitStats.pcts.slice(d + 1).reduce((a, b) => a + b, 0);
            const underProb = digitStats.pcts.slice(0, d).reduce((a, b) => a + b, 0);
            if (overProb >= underProb && legA.valid) return legA;
            if (legB.valid) return legB;
            return legA;
        }

        if (tradeGroup === 'even_odd') {
            const evenSum = [0, 2, 4, 6, 8].reduce((s, d) => s + (digitStats.pcts[d] || 0), 0);
            return evenSum >= 50 ? legA : legB;
        }

        if (ticks.length >= 3) {
            const last = ticks[ticks.length - 1].quote;
            const prev = ticks[ticks.length - 3].quote;
            return last >= prev ? legA : legB;
        }

        return legA;
    }, [pairLegs, triggerMode, tradeGroup, prediction, digitStats.pcts, ticks]);

    const runAutoCycleTick = useCallback(
        async (incomingPt?: TickPoint) => {
            if (!autoRunningRef.current || buyInFlightRef.current) return;
            const pt = incomingPt || (ticks.length ? ticks[ticks.length - 1] : null);
            if (pt && pt.epoch === lastAutoEpochRef.current) return;

            if (triggerMode === 'opp1' || triggerMode === 'opp2') {
                const need = triggerMode === 'opp2' ? 2 : 1;
                if (ticks.length < need + 1) return;
                const tail = ticks.slice(-need);
                const d = Math.max(0, Math.min(9, Math.round(prediction)));
                if (tradeGroup === 'over_under' && !tail.every(t => t.digit <= d)) return;
                if (tradeGroup === 'even_odd' && !tail.every(t => t.digit % 2 === 1)) return;
            }

            const chosenLeg = pickAdaptiveAutoLeg();
            if (!chosenLeg?.valid) return;

            if (pt) lastAutoEpochRef.current = pt.epoch;
            buyInFlightRef.current = true;
            setBuyingLeg('auto');
            try {
                await executeOneLeg(chosenLeg, currentAutoStakeRef.current, true);
            } catch (e: any) {
                stopAllLoops(extractDerivApiError(e, 'AUTO stopped due to trade error.'), 'lost');
            } finally {
                buyInFlightRef.current = false;
                setBuyingLeg(null);
            }
        },
        [ticks, triggerMode, prediction, tradeGroup, pickAdaptiveAutoLeg, executeOneLeg, stopAllLoops]
    );

    const onAutoTickRef = useRef(runAutoCycleTick);
    onAutoTickRef.current = runAutoCycleTick;

    const handleToggleAuto = useCallback(() => {
        if (autoRunningRef.current) {
            stopAllLoops('Stopped.');
            return;
        }
        if (!isAuthorizedSession) {
            void connectAccount();
            return;
        }
        sessionPLRef.current = 0;
        currentAutoStakeRef.current = baseStake;
        autoRunningRef.current = true;
        setAutoRunning(true);
        if (run_panel) {
            run_panel.run_id = `dtrader-auto-${Date.now()}`;
        }
        autoDockRunPanel(run_panel, 1);
        setStatusLine('Running AUTO (Adaptive)…');
        setStatusTone('running');
        void runAutoCycleTick();
    }, [isAuthorizedSession, connectAccount, baseStake, run_panel, runAutoCycleTick, stopAllLoops]);

    // Connect bottom RunStrategy '▶ Run' button on DTrader tab to handleToggleAuto
    useEffect(() => {
        const onRunBar = () => {
            handleToggleAuto();
        };
        window.addEventListener('tp-dtrader-run-bar', onRunBar);
        return () => window.removeEventListener('tp-dtrader-run-bar', onRunBar);
    }, [handleToggleAuto]);

    async function sellContract(contractId: number) {
        const transport = getTransport();
        if (!transport?.send) return;
        try {
            await sendWithTimeout(transport.send.bind(transport), { sell: contractId, price: 0 });
            setStatusLine(`Sold contract #${contractId}`);
        } catch (e: any) {
            setStatusLine(extractDerivApiError(e, 'Sell request failed.'));
        }
    }

    const cycleGroup = (dir: -1 | 1) => {
        const idx = TRADE_GROUPS.findIndex(g => g.id === tradeGroup);
        const nextIdx = (idx + dir + TRADE_GROUPS.length) % TRADE_GROUPS.length;
        setTradeGroup(TRADE_GROUPS[nextIdx].id);
    };

    const cycleTimeframe = () => {
        setTimeframe(prev => (prev === '1T' ? '1M' : prev === '1M' ? '5M' : '1T'));
    };

    const exportSnapshotCsv = () => {
        if (!ticks.length || typeof document === 'undefined') return;
        const rows = ['epoch,quote,digit', ...ticks.slice(-200).map(t => `${t.epoch},${t.quote},${t.digit}`)];
        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${symbol}-ticks.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const filteredMarkets = markets.filter(m =>
        `${m.symbol} ${m.name}`.toLowerCase().includes(search.toLowerCase())
    );
    const badge = parseMarketBadge(symbol);

    const legA = pairLegs[0];
    const legB = pairLegs[1];
    const payoutA = Number(
        proposals.up?.payout ?? baseStake * (1 + (legA?.fallbackNetRatio ?? 0.9))
    );
    const payoutB = legB
        ? Number(proposals.down?.payout ?? baseStake * (1 + (legB?.fallbackNetRatio ?? 0.9)))
        : 0;
    const totalBothStake = baseStake * (legB ? 2 : 1);

    // SVG Chart Coordinates
    const svgW = 900;
    const svgH = 500;
    const plotLeft = 58;
    const plotRight = 830;
    const plotTop = 58;
    const plotBottom = 468;
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
        const pad = (max - min || 0.2) * 0.14;
        const yMin = min - pad;
        const yMax = max + pad;
        const ySpan = yMax - yMin || 1;

        const yFor = (price: number) => plotBottom - ((price - yMin) / ySpan) * plotHeight;
        const xFor = (idx: number, count: number) =>
            plotLeft + (idx / Math.max(1, count - 1)) * (plotWidth - 28);

        const gridSteps = denseGrid ? 8 : 5;
        const yTicks = Array.from({ length: gridSteps }, (_, i) => {
            const val = yMax - (i / (gridSteps - 1)) * ySpan;
            return { val, y: yFor(val) };
        });

        const xTickIndices = Array.from({ length: 8 }, (_, i) =>
            Math.min(points.length - 1, Math.round((i / 7) * (points.length - 1)))
        );

        const lastIdx = points.length - 1;
        const lastPt = points[lastIdx];
        const lastX = xFor(lastIdx, points.length);
        const lastY = yFor(lastPt.quote);

        const lineCoords = points.map((pt, i) => ({
            x: xFor(i, points.length),
            y: yFor(pt.quote),
            pt,
        }));
        const linePath = `M ${lineCoords.map(c => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L ')}`;

        const smaPath = showSma
            ? (() => {
                  const smaPts: string[] = [];
                  for (let i = 0; i < points.length; i++) {
                      const win = points.slice(Math.max(0, i - 9), i + 1);
                      const avg = win.reduce((s, p) => s + p.quote, 0) / win.length;
                      smaPts.push(
                          `${i === 0 ? 'M' : 'L'}${xFor(i, points.length).toFixed(1)},${yFor(avg).toFixed(1)}`
                      );
                  }
                  return smaPts.join(' ');
              })()
            : '';

        const digitNodes =
            overlayMode === 'digits' && mode === 'line' ? lineCoords.slice(-14) : [];

        const safeHover =
            crosshairEnabled && hoverIndex !== null && hoverIndex >= 0 && hoverIndex < points.length
                ? hoverIndex
                : null;
        const hoverPt = safeHover !== null ? points[safeHover] : null;
        const hoverX = safeHover !== null ? xFor(safeHover, points.length) : 0;
        const hoverY = hoverPt ? yFor(hoverPt.quote) : 0;

        return (
            <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                preserveAspectRatio='none'
                className='rm-dtrader__svg'
                onMouseMove={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * svgW;
                    const ratio = (relX - plotLeft) / Math.max(1, plotWidth - 28);
                    const idx = Math.max(
                        0,
                        Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))
                    );
                    setHoverIndex(idx);
                }}
                onMouseLeave={() => setHoverIndex(null)}
            >
                {/* Subtle SmartCharts Horizontal & Vertical Grid */}
                {yTicks.map((yt, idx) => (
                    <g key={`y-${idx}`}>
                        <line
                            x1={plotLeft}
                            x2={plotRight}
                            y1={yt.y}
                            y2={yt.y}
                            stroke='#f1f5f9'
                            strokeWidth='1'
                        />
                        <text
                            x={plotRight + 8}
                            y={yt.y + 4}
                            fill='#475569'
                            fontSize='10.5'
                            fontFamily='monospace'
                        >
                            {yt.val.toFixed(decimals)}
                        </text>
                    </g>
                ))}

                {xTickIndices.map((ptIdx, idx) => {
                    const pt = points[ptIdx];
                    const x = xFor(ptIdx, points.length);
                    return (
                        <g key={`x-${idx}`}>
                            <line
                                x1={x}
                                x2={x}
                                y1={plotTop}
                                y2={plotBottom}
                                stroke='#f8fafc'
                                strokeWidth='1'
                            />
                            <text
                                x={x}
                                y={svgH - 10}
                                textAnchor='middle'
                                fill='#64748b'
                                fontSize='10'
                                fontFamily='monospace'
                            >
                                {formatEpochTime(pt.epoch)}
                            </text>
                        </g>
                    );
                })}

                {/* Candlesticks OR Line Series */}
                {mode === 'candles' ? (
                    candles.map((c, idx) => {
                        const x = xFor(idx, candles.length);
                        const bull = c.close >= c.open;
                        const color = bull ? '#2a9d8f' : '#e75550';
                        const yOpen = yFor(c.open);
                        const yClose = yFor(c.close);
                        const yHigh = yFor(c.high);
                        const yLow = yFor(c.low);
                        const bodyTop = Math.min(yOpen, yClose);
                        const bodyH = Math.max(2.5, Math.abs(yClose - yOpen));
                        const candleW = Math.max(4, Math.min(11, (plotWidth / candles.length) * 0.56));
                        return (
                            <g key={`c-${idx}`}>
                                <line
                                    x1={x}
                                    x2={x}
                                    y1={yHigh}
                                    y2={yLow}
                                    stroke={color}
                                    strokeWidth='1.35'
                                />
                                <rect
                                    x={x - candleW / 2}
                                    y={bodyTop}
                                    width={candleW}
                                    height={bodyH}
                                    fill={color}
                                    rx='1'
                                />
                            </g>
                        );
                    })
                ) : (
                    <path
                        d={linePath}
                        fill='none'
                        stroke='#1e293b'
                        strokeWidth='2'
                        strokeLinejoin='round'
                    />
                )}

                {showSma && smaPath && (
                    <path
                        d={smaPath}
                        fill='none'
                        stroke='#0066ff'
                        strokeWidth='1.6'
                        strokeDasharray='4 2'
                    />
                )}

                {/* Digit Bubbles along Line when Line + Digits is selected */}
                {digitNodes.map((node, idx) => {
                    const isEven = node.pt.digit % 2 === 0;
                    const isLast = idx === digitNodes.length - 1;
                    return (
                        <g key={`d-${idx}`} transform={`translate(${node.x}, ${node.y - 14})`}>
                            <circle
                                r={isLast ? 10 : 8.5}
                                fill={isLast ? '#0f172a' : isEven ? '#ecfdf5' : '#fef2f2'}
                                stroke={isLast ? '#0066ff' : isEven ? '#10b981' : '#ef4444'}
                                strokeWidth='1.4'
                            />
                            <text
                                y='3.5'
                                textAnchor='middle'
                                fill={isLast ? '#ffffff' : isEven ? '#047857' : '#b91c1c'}
                                fontSize='9.5'
                                fontWeight='800'
                            >
                                {node.pt.digit}
                            </text>
                        </g>
                    );
                })}

                {/* Live Spot Dot + Dashed Guide + Solid Black Right-Axis Callout */}
                <line
                    x1={lastX}
                    x2={plotRight}
                    y1={lastY}
                    y2={lastY}
                    stroke='#0f172a'
                    strokeDasharray='3 3'
                    strokeWidth='1.1'
                />
                <circle cx={lastX} cy={lastY} r='4' fill='#0f172a' stroke='#ffffff' strokeWidth='1.5' />
                <g transform={`translate(${plotRight + 2}, ${lastY - 10})`}>
                    <rect width='64' height='20' rx='3' fill='#0f172a' />
                    <text
                        x='32'
                        y='13.5'
                        textAnchor='middle'
                        fill='#ffffff'
                        fontSize='10.5'
                        fontWeight='700'
                        fontFamily='monospace'
                    >
                        {lastPt.quote.toFixed(decimals)}
                    </text>
                </g>

                {/* Hover Crosshair & Timestamp/Quote Tooltip */}
                {hoverPt && (
                    <g pointerEvents='none'>
                        <line
                            x1={hoverX}
                            x2={hoverX}
                            y1={plotTop}
                            y2={plotBottom}
                            stroke='#94a3b8'
                            strokeDasharray='3 3'
                            strokeWidth='1'
                        />
                        <line
                            x1={plotLeft}
                            x2={plotRight}
                            y1={hoverY}
                            y2={hoverY}
                            stroke='#94a3b8'
                            strokeDasharray='3 3'
                            strokeWidth='1'
                        />
                        <g
                            transform={`translate(${Math.min(
                                plotRight - 140,
                                Math.max(plotLeft + 8, hoverX + 10)
                            )}, ${Math.max(plotTop + 10, hoverY - 38)})`}
                        >
                            <rect
                                width='132'
                                height='36'
                                rx='4'
                                fill='rgba(226, 232, 240, 0.95)'
                                stroke='#cbd5e1'
                            />
                            <text x='8' y='14' fill='#334155' fontSize='9.5' fontFamily='monospace'>
                                {formatEpochFull(hoverPt.epoch)}
                            </text>
                            <text
                                x='8'
                                y='28'
                                fill='#0f172a'
                                fontSize='11'
                                fontWeight='800'
                                fontFamily='monospace'
                            >
                                {hoverPt.quote.toFixed(decimals)}
                            </text>
                        </g>
                    </g>
                )}
            </svg>
        );
    };

    const renderDigitCircle = (d: number) => {
        const pct = digitStats.pcts[d] ?? 0;
        const isMax = digitStats.highestDigit === d;
        const isMin = digitStats.lowestDigit === d;
        const isCurrent = digitStats.currentDigit === d;
        const isSelected = groupMeta.usesDigitPrediction && prediction === d;
        const ringColor = isMin || pct < 9.5 ? '#ef4444' : '#10b981';
        const r = 20;
        const circ = 2 * Math.PI * r;
        const clampedPct = Math.max(8, Math.min(100, pct * 4));
        const dashOffset = circ * (1 - clampedPct / 100);

        return (
            <button
                key={d}
                type='button'
                className={
                    'rm-dtrader__digit-ring-btn' +
                    (isCurrent ? ' rm-dtrader__digit-ring-btn--current' : '') +
                    (isSelected ? ' rm-dtrader__digit-ring-btn--selected' : '')
                }
                onClick={() => setPrediction(d)}
                title={`Digit ${d}: ${pct.toFixed(1)}% — Click to set Prediction ${d}`}
                data-testid={`dtrader-digit-ring-${d}`}
            >
                <svg viewBox='0 0 46 46' className='rm-dtrader__digit-ring-svg'>
                    <circle
                        cx='23'
                        cy='23'
                        r={r}
                        fill='none'
                        stroke='#e2e8f0'
                        strokeWidth='3'
                    />
                    <circle
                        cx='23'
                        cy='23'
                        r={r}
                        fill='none'
                        stroke={ringColor}
                        strokeWidth='3.2'
                        strokeDasharray={circ.toFixed(1)}
                        strokeDashoffset={dashOffset.toFixed(1)}
                        strokeLinecap='round'
                    />
                </svg>
                <span
                    className={
                        'rm-dtrader__digit-ring-inner' +
                        (isMax
                            ? ' rm-dtrader__digit-ring-inner--max'
                            : isMin
                              ? ' rm-dtrader__digit-ring-inner--min'
                              : '')
                    }
                >
                    <span className='rm-dtrader__digit-ring-num'>{d}</span>
                    <span className='rm-dtrader__digit-ring-pct'>{pct.toFixed(1)}%</span>
                </span>
                {isCurrent && <span className='rm-dtrader__digit-pointer' aria-hidden='true' />}
            </button>
        );
    };

    const sellableOpenContracts = openContracts.filter(c => c.status === 'open' && c.isValidToSell);

    return (
        <div className='rm-dtrader' data-testid='rm-dtrader-page'>
            <div className='rm-dtrader__workspace'>
                {/* Left SmartCharts-Style White Stage */}
                <div className='rm-dtrader__chart-stage'>
                    {/* Top-Left Floating Market Card */}
                    <div className='rm-dtrader__market-float'>
                        <button
                            type='button'
                            className='rm-dtrader__market-card-btn'
                            onClick={() => setMarketOpen(v => !v)}
                            data-testid='dtrader-market-picker'
                        >
                            <span className='rm-dtrader__market-emblem'>
                                <span className='rm-dtrader__market-emblem-num'>{badge.num}</span>
                                <span className='rm-dtrader__market-emblem-bars'>
                                    <i />
                                    <i />
                                    <i />
                                </span>
                                {badge.is1s && (
                                    <span className='rm-dtrader__market-emblem-1s'>1s</span>
                                )}
                            </span>
                            <span className='rm-dtrader__market-info'>
                                <span className='rm-dtrader__market-title-row'>
                                    <span className='rm-dtrader__market-name'>
                                        {selectedMarket.name}
                                    </span>
                                    <span className='rm-dtrader__market-caret'>⌄</span>
                                </span>
                                <span className='rm-dtrader__market-sub-row'>
                                    <span>
                                        {latestTick ? latestTick.quote.toFixed(decimals) : '—'}
                                    </span>
                                    <span
                                        className={`rm-dtrader__market-delta ${
                                            priceDelta >= 0
                                                ? 'rm-dtrader__market-delta--up'
                                                : 'rm-dtrader__market-delta--down'
                                        }`}
                                    >
                                        {priceDelta >= 0 ? '+' : '−'}{' '}
                                        {Math.abs(priceDelta).toFixed(decimals)} (
                                        {Math.abs(priceDeltaPct).toFixed(2)}%){' '}
                                        {priceDelta >= 0 ? '▲' : '▼'}
                                    </span>
                                </span>
                            </span>
                        </button>

                        {marketOpen && (
                            <div className='rm-dtrader__dropdown'>
                                <input
                                    type='text'
                                    className='rm-dtrader__dropdown-search'
                                    placeholder='Search Volatility, Jump, Crash/Boom, Forex…'
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                                <div className='rm-dtrader__dropdown-list'>
                                    {filteredMarkets.slice(0, 60).map(m => (
                                        <button
                                            key={m.symbol}
                                            type='button'
                                            className={`rm-dtrader__dropdown-item ${
                                                m.symbol === symbol
                                                    ? 'rm-dtrader__dropdown-item--active'
                                                    : ''
                                            }`}
                                            onClick={() => {
                                                setSymbol(m.symbol);
                                                setMarketOpen(false);
                                            }}
                                        >
                                            <span>{m.name}</span>
                                            <span className='rm-dtrader__dropdown-code'>
                                                {m.symbol}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Top-Center Floating Segmented Pills: Default | Digits, Line | Candles */}
                    <div className='rm-dtrader__top-pills'>
                        <div className='rm-dtrader__pill-seg' role='group' aria-label='Chart overlay'>
                            <button
                                type='button'
                                className={`rm-dtrader__pill-btn ${
                                    overlayMode === 'default' ? 'rm-dtrader__pill-btn--active' : ''
                                }`}
                                onClick={() => setOverlayMode('default')}
                            >
                                Default
                            </button>
                            <button
                                type='button'
                                className={`rm-dtrader__pill-btn ${
                                    overlayMode === 'digits' ? 'rm-dtrader__pill-btn--active' : ''
                                }`}
                                onClick={() => setOverlayMode('digits')}
                            >
                                Digits
                            </button>
                        </div>

                        <div className='rm-dtrader__pill-seg' role='group' aria-label='Chart type'>
                            <button
                                type='button'
                                className={`rm-dtrader__pill-btn ${
                                    seriesMode === 'line' ? 'rm-dtrader__pill-btn--active' : ''
                                }`}
                                onClick={() => setSeriesMode('line')}
                            >
                                Line
                            </button>
                            <button
                                type='button'
                                className={`rm-dtrader__pill-btn ${
                                    seriesMode === 'candles' ? 'rm-dtrader__pill-btn--active' : ''
                                }`}
                                onClick={() => setSeriesMode('candles')}
                            >
                                Candles
                            </button>
                        </div>
                    </div>

                    {/* Left-Edge SmartCharts Vertical Toolbar */}
                    <div className='rm-dtrader__left-rail'>
                        <div className='rm-dtrader__tool-stack' role='toolbar' aria-label='Chart tools'>
                            <button
                                type='button'
                                className='rm-dtrader__tool-btn'
                                onClick={cycleTimeframe}
                                title={`Timeframe: ${timeframe} (click to cycle 1T / 1M / 5M)`}
                            >
                                <span className='rm-dtrader__tool-tf'>{timeframe}</span>
                                <svg width='16' height='16' viewBox='0 0 24 24' fill='none'>
                                    <path
                                        d='M4 18l5-6 4 3 7-9'
                                        stroke='currentColor'
                                        strokeWidth='2'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    />
                                </svg>
                            </button>

                            <button
                                type='button'
                                className={`rm-dtrader__tool-btn ${
                                    showSma ? 'rm-dtrader__tool-btn--active' : ''
                                }`}
                                onClick={() => setShowSma(v => !v)}
                                title='Toggle SMA-10 Indicator'
                            >
                                <svg width='16' height='16' viewBox='0 0 24 24' fill='none'>
                                    <rect
                                        x='3'
                                        y='4'
                                        width='18'
                                        height='16'
                                        rx='2'
                                        stroke='currentColor'
                                        strokeWidth='1.8'
                                    />
                                    <path
                                        d='M4 16l5-5 4 3 6-6'
                                        stroke='currentColor'
                                        strokeWidth='1.8'
                                        strokeLinecap='round'
                                    />
                                </svg>
                            </button>

                            <button
                                type='button'
                                className={`rm-dtrader__tool-btn ${
                                    denseGrid ? 'rm-dtrader__tool-btn--active' : ''
                                }`}
                                onClick={() => setDenseGrid(v => !v)}
                                title='Toggle Grid Density'
                            >
                                <svg width='16' height='16' viewBox='0 0 24 24' fill='none'>
                                    <rect
                                        x='3'
                                        y='3'
                                        width='18'
                                        height='18'
                                        rx='2'
                                        stroke='currentColor'
                                        strokeWidth='1.8'
                                    />
                                    <path
                                        d='M3 9h18M3 15h18M9 3v18M15 3v18'
                                        stroke='currentColor'
                                        strokeWidth='1.5'
                                    />
                                </svg>
                            </button>

                            <button
                                type='button'
                                className={`rm-dtrader__tool-btn ${
                                    crosshairEnabled ? 'rm-dtrader__tool-btn--active' : ''
                                }`}
                                onClick={() => setCrosshairEnabled(v => !v)}
                                title='Toggle Crosshair Tooltip'
                            >
                                <svg width='16' height='16' viewBox='0 0 24 24' fill='none'>
                                    <path
                                        d='M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4L16.5 3.5z'
                                        stroke='currentColor'
                                        strokeWidth='1.8'
                                        strokeLinejoin='round'
                                    />
                                </svg>
                            </button>

                            <button
                                type='button'
                                className='rm-dtrader__tool-btn'
                                onClick={exportSnapshotCsv}
                                title='Download Recent Ticks CSV'
                            >
                                <svg width='16' height='16' viewBox='0 0 24 24' fill='none'>
                                    <path
                                        d='M12 4v11m0 0l-4-4m4 4l4-4M4 19h16'
                                        stroke='currentColor'
                                        strokeWidth='1.8'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    />
                                </svg>
                            </button>
                        </div>

                        <span className='rm-dtrader__brand-pill'>TP</span>
                    </div>

                    {/* Bottom-Left Zoom Controls (+ / Target / -) */}
                    <div className='rm-dtrader__zoom-stack' role='group' aria-label='Zoom'>
                        <button
                            type='button'
                            className='rm-dtrader__zoom-btn'
                            title='Zoom in'
                            onClick={() => setZoomIndex(z => Math.max(0, z - 1))}
                        >
                            +
                        </button>
                        <button
                            type='button'
                            className='rm-dtrader__zoom-btn'
                            title='Reset zoom to live spot'
                            onClick={() => {
                                setZoomIndex(2);
                                setHoverIndex(null);
                            }}
                        >
                            ⌖
                        </button>
                        <button
                            type='button'
                            className='rm-dtrader__zoom-btn'
                            title='Zoom out'
                            onClick={() => setZoomIndex(z => Math.min(ZOOM_STEPS.length - 1, z + 1))}
                        >
                            −
                        </button>
                    </div>

                    {/* Interactive Candlestick / Line SVG */}
                    {renderChartSvg()}

                    {/* Bottom-Center 2x5 Circular 0-9 Digit Rings */}
                    {overlayMode === 'digits' && (
                        <div
                            className='rm-dtrader__digits-cluster'
                            aria-label='0–9 Digit Distribution'
                            data-testid='dtrader-digits-cluster'
                        >
                            <div className='rm-dtrader__digits-row'>
                                {[0, 1, 2, 3, 4].map(renderDigitCircle)}
                                <span
                                    className='rm-dtrader__digits-info'
                                    title={`0–9 Digit Distribution (${digitStats.sampleCount} ticks)`}
                                >
                                    i
                                </span>
                            </div>
                            <div className='rm-dtrader__digits-row'>
                                {[5, 6, 7, 8, 9].map(renderDigitCircle)}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Floating White Trade & Auto-Bot Card */}
                <aside className='rm-dtrader__trade-col'>
                    <div className='rm-dtrader__trade-card' data-testid='dtrader-trade-card'>
                        {/* Header: < [Icons] Matches/Differs  [Digits] */}
                        <div className='rm-dtrader__card-header'>
                            <div className='rm-dtrader__card-header-left'>
                                <button
                                    type='button'
                                    className='rm-dtrader__cycle-btn'
                                    onClick={() => cycleGroup(-1)}
                                    aria-label='Previous contract type'
                                >
                                    ‹
                                </button>
                                <span className='rm-dtrader__contract-icon' aria-hidden='true'>
                                    <svg width='20' height='16' viewBox='0 0 24 18' fill='none'>
                                        <path
                                            d='M2 13l5-5 3 3 5-6M11 5h4v4'
                                            stroke='#ef4444'
                                            strokeWidth='2'
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                        />
                                    </svg>
                                </span>
                                <select
                                    aria-label='Trade Type'
                                    className='rm-dtrader__group-select'
                                    value={tradeGroup}
                                    onChange={e => setTradeGroup(e.target.value as DTraderGroup)}
                                    data-testid='dtrader-group-select'
                                >
                                    {TRADE_GROUPS.map(g => (
                                        <option key={g.id} value={g.id}>
                                            {g.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                type='button'
                                className='rm-dtrader__cat-pill'
                                onClick={() => cycleGroup(1)}
                                title='Cycle contract category'
                            >
                                <span>📊</span>
                                <span>{groupMeta.categoryBadge}</span>
                            </button>
                        </div>

                        {/* Row 2: Ticks [ 1 ]   [ Instant ] */}
                        {tradeGroup !== 'accumulators' && (
                            <div className='rm-dtrader__form-row'>
                                <div className='rm-dtrader__field-inline'>
                                    <span className='rm-dtrader__lbl'>
                                        {durationUnit === 't' ? 'Ticks' : 'Minutes'}
                                    </span>
                                    <input
                                        type='number'
                                        className='rm-dtrader__num-input'
                                        min={durationUnit === 't' ? groupMeta.minTicks : 1}
                                        max={durationUnit === 't' ? groupMeta.maxTicks : 60}
                                        value={duration}
                                        onChange={e =>
                                            setDuration(Math.max(1, Number(e.target.value) || 1))
                                        }
                                        data-testid='dtrader-ticks-input'
                                    />
                                </div>

                                <select
                                    aria-label='Entry trigger mode'
                                    className='rm-dtrader__mode-select'
                                    value={triggerMode}
                                    onChange={e => setTriggerMode(e.target.value as TriggerMode)}
                                    data-testid='dtrader-trigger-select'
                                >
                                    <option value='instant'>Instant</option>
                                    <option value='adaptive'>Adaptive</option>
                                    <option value='opp1'>Wait 1 Opp</option>
                                    <option value='opp2'>Wait 2 Opp</option>
                                </select>
                            </div>
                        )}

                        {/* Row 3: Prediction [ 1 ] OR Barrier / Growth Rate */}
                        {groupMeta.usesDigitPrediction && (
                            <div className='rm-dtrader__form-row'>
                                <div className='rm-dtrader__field-inline'>
                                    <span className='rm-dtrader__lbl'>Prediction</span>
                                    <input
                                        type='number'
                                        min={0}
                                        max={9}
                                        className='rm-dtrader__num-input'
                                        value={prediction}
                                        onChange={e =>
                                            setPrediction(
                                                Math.max(0, Math.min(9, Number(e.target.value) || 0))
                                            )
                                        }
                                        data-testid='dtrader-prediction-input'
                                    />
                                </div>
                            </div>
                        )}

                        {groupMeta.usesBarrierOffset && (
                            <div className='rm-dtrader__form-row'>
                                <div className='rm-dtrader__field-inline'>
                                    <span className='rm-dtrader__lbl'>Barrier ±</span>
                                    <input
                                        type='number'
                                        step='0.1'
                                        min='0.01'
                                        className='rm-dtrader__num-input'
                                        value={barrierOffset}
                                        onChange={e =>
                                            setBarrierOffset(Math.max(0.01, Number(e.target.value) || 0.5))
                                        }
                                    />
                                </div>
                            </div>
                        )}

                        {tradeGroup === 'rise_fall' && (
                            <div className='rm-dtrader__form-row'>
                                <label className='rm-dtrader__field-inline'>
                                    <input
                                        type='checkbox'
                                        checked={allowEquals}
                                        onChange={e => setAllowEquals(e.target.checked)}
                                    />
                                    <span className='rm-dtrader__lbl'>Allow equals</span>
                                </label>
                            </div>
                        )}

                        {tradeGroup === 'accumulators' && (
                            <div className='rm-dtrader__form-row'>
                                <span className='rm-dtrader__lbl'>Growth Rate</span>
                                <div className='rm-dtrader__growth-row'>
                                    {[0.01, 0.02, 0.03, 0.04, 0.05].map(gr => (
                                        <button
                                            key={gr}
                                            type='button'
                                            className={`rm-dtrader__growth-btn ${
                                                growthRate === gr
                                                    ? 'rm-dtrader__growth-btn--active'
                                                    : ''
                                            }`}
                                            onClick={() => setGrowthRate(gr)}
                                        >
                                            {Math.round(gr * 100)}%
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Row 4: Stake [ 0.35 ] USD [ Single ] [ Stop ] */}
                        <div className='rm-dtrader__form-row'>
                            <div className='rm-dtrader__field-inline'>
                                <span className='rm-dtrader__lbl'>Stake</span>
                                <input
                                    type='number'
                                    min='0.35'
                                    step='0.05'
                                    className='rm-dtrader__num-input'
                                    value={stakeInput}
                                    onChange={e => setStakeInput(e.target.value)}
                                    data-testid='dtrader-stake-input'
                                />
                                <span className='rm-dtrader__ccy'>{activeCurrency}</span>
                            </div>

                            <select
                                aria-label='Loop mode'
                                className='rm-dtrader__mode-select'
                                value={loopMode}
                                onChange={e => setLoopMode(e.target.value as LoopMode)}
                                data-testid='dtrader-loop-select'
                            >
                                <option value='single'>Single</option>
                                <option value='continuous'>Continuous</option>
                            </select>

                            <button
                                type='button'
                                className={`rm-dtrader__stop-btn ${
                                    autoRunning ? 'rm-dtrader__stop-btn--active' : ''
                                }`}
                                onClick={() => stopAllLoops('Stopped.')}
                                data-testid='dtrader-stop-btn'
                            >
                                Stop
                            </button>
                        </div>

                        {/* Row 5: TP [ 2.5 ]   SL [ 50 ]   x [ 1.2 ] */}
                        <div className='rm-dtrader__tpsl-row'>
                            <label className='rm-dtrader__tpsl-cell'>
                                <span className='rm-dtrader__lbl'>TP</span>
                                <input
                                    type='number'
                                    min='0.1'
                                    step='0.5'
                                    className='rm-dtrader__num-input rm-dtrader__num-input--sm'
                                    value={tpInput}
                                    onChange={e => setTpInput(e.target.value)}
                                    data-testid='dtrader-tp-input'
                                />
                            </label>

                            <label className='rm-dtrader__tpsl-cell'>
                                <span className='rm-dtrader__lbl'>SL</span>
                                <input
                                    type='number'
                                    min='0.1'
                                    step='1'
                                    className='rm-dtrader__num-input rm-dtrader__num-input--sm'
                                    value={slInput}
                                    onChange={e => setSlInput(e.target.value)}
                                    data-testid='dtrader-sl-input'
                                />
                            </label>

                            <label className='rm-dtrader__tpsl-cell'>
                                <span className='rm-dtrader__lbl'>×</span>
                                <input
                                    type='number'
                                    min='0.1'
                                    step='0.1'
                                    className='rm-dtrader__num-input rm-dtrader__num-input--sm'
                                    value={martingaleInput}
                                    onChange={e => setMartingaleInput(e.target.value)}
                                    data-testid='dtrader-martingale-input'
                                />
                            </label>
                        </div>

                        {/* Status Readout */}
                        <div
                            className={`rm-dtrader__status-line ${
                                statusTone !== 'neutral'
                                    ? `rm-dtrader__status-line--${statusTone}`
                                    : ''
                            }`}
                            data-testid='dtrader-status-line'
                        >
                            {statusLine}
                        </div>

                        {/* Row 6: 4-Column Payout | Payout | Total stake | AUTO Strip */}
                        <div className='rm-dtrader__summary-strip'>
                            <div className='rm-dtrader__summary-col'>
                                <span className='rm-dtrader__summary-lbl'>Payout ⓘ</span>
                                <span className='rm-dtrader__summary-val'>
                                    {payoutA.toFixed(2)} {activeCurrency}
                                </span>
                            </div>
                            <div className='rm-dtrader__summary-col'>
                                <span className='rm-dtrader__summary-lbl'>Payout ⓘ</span>
                                <span className='rm-dtrader__summary-val'>
                                    {legB ? `${payoutB.toFixed(2)} ${activeCurrency}` : '—'}
                                </span>
                            </div>
                            <div className='rm-dtrader__summary-col'>
                                <span className='rm-dtrader__summary-lbl'>Total stake</span>
                                <span className='rm-dtrader__summary-val'>
                                    {totalBothStake.toFixed(2)} {activeCurrency}
                                </span>
                            </div>
                            <div className='rm-dtrader__summary-col'>
                                <span className='rm-dtrader__summary-lbl'>AUTO</span>
                                <span className='rm-dtrader__summary-val'>
                                    {triggerMode === 'instant'
                                        ? 'Instant'
                                        : triggerMode === 'adaptive'
                                          ? 'Adaptive'
                                          : triggerMode === 'opp1'
                                            ? 'Opp 1'
                                            : 'Opp 2'}
                                </span>
                            </div>
                        </div>

                        {/* Row 7: 4 Side-by-Side Buttons: [Matches] [Differs] [Both] [AUTO] */}
                        <div
                            className={`rm-dtrader__actions-grid ${
                                !legB ? 'rm-dtrader__actions-grid--single' : ''
                            }`}
                        >
                            <button
                                type='button'
                                disabled={!legA.valid || buyingLeg !== null}
                                className='rm-dtrader__act-btn rm-dtrader__act-btn--up'
                                onClick={() => void handleBuySingle(legA)}
                                data-testid='dtrader-buy-up'
                            >
                                <span className='rm-dtrader__act-main'>{legA.shortTitle}</span>
                            </button>

                            {legB && (
                                <button
                                    type='button'
                                    disabled={!legB.valid || buyingLeg !== null}
                                    className='rm-dtrader__act-btn rm-dtrader__act-btn--down'
                                    onClick={() => void handleBuySingle(legB)}
                                    data-testid='dtrader-buy-down'
                                >
                                    <span className='rm-dtrader__act-main'>{legB.shortTitle}</span>
                                </button>
                            )}

                            {legB && (
                                <button
                                    type='button'
                                    disabled={!legA.valid || !legB.valid || buyingLeg !== null}
                                    className='rm-dtrader__act-btn rm-dtrader__act-btn--both'
                                    onClick={() => void handleBuyBoth()}
                                    data-testid='dtrader-buy-both'
                                >
                                    <span className='rm-dtrader__act-main'>Both</span>
                                    <span className='rm-dtrader__act-sub'>
                                        {legA.shortTitle} + {legB.shortTitle}
                                    </span>
                                </button>
                            )}

                            <button
                                type='button'
                                className={`rm-dtrader__act-btn rm-dtrader__act-btn--auto ${
                                    autoRunning ? 'rm-dtrader__act-btn--auto-on' : ''
                                }`}
                                onClick={handleToggleAuto}
                                data-testid='dtrader-buy-auto'
                            >
                                <span className='rm-dtrader__act-main'>AUTO</span>
                                <span className='rm-dtrader__act-sub'>
                                    {autoRunning ? 'Running' : 'Automatic'}
                                </span>
                            </button>
                        </div>

                        {/* Early Sell Strip for Open Sellable Positions (ACCU / Multi-Min) */}
                        {sellableOpenContracts.length > 0 && (
                            <div className='rm-dtrader__open-strip'>
                                {sellableOpenContracts.map(c => (
                                    <div key={c.id} className='rm-dtrader__open-item'>
                                        <span>
                                            {c.label} ({c.profit >= 0 ? '+' : ''}
                                            {c.profit.toFixed(2)} {activeCurrency})
                                        </span>
                                        <button
                                            type='button'
                                            className='rm-dtrader__sell-btn'
                                            onClick={() => void sellContract(c.id)}
                                        >
                                            Sell
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
});
