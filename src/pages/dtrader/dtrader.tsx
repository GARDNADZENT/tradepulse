import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { generateOAuthURL } from '@/components/shared';
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

type Tick = { epoch: number; quote: number; digit: number };
type ContractType =
    | 'CALL'
    | 'PUT'
    | 'DIGITEVEN'
    | 'DIGITODD'
    | 'DIGITOVER'
    | 'DIGITUNDER'
    | 'DIGITMATCH'
    | 'DIGITDIFF'
    | 'HIGHER'
    | 'LOWER'
    | 'TOUCH'
    | 'NOTOUCH';

const CONTRACTS: { id: ContractType; label: string }[] = [
    { id: 'CALL', label: 'Rise' },
    { id: 'PUT', label: 'Fall' },
    { id: 'DIGITEVEN', label: 'Even' },
    { id: 'DIGITODD', label: 'Odd' },
    { id: 'DIGITOVER', label: 'Over' },
    { id: 'DIGITUNDER', label: 'Under' },
    { id: 'DIGITMATCH', label: 'Matches' },
    { id: 'DIGITDIFF', label: 'Differs' },
    { id: 'HIGHER', label: 'Higher' },
    { id: 'LOWER', label: 'Lower' },
    { id: 'TOUCH', label: 'Touch' },
    { id: 'NOTOUCH', label: 'No Touch' },
];

const DEFAULT_MARKETS = [
    { symbol: '1HZ10V', name: 'Volatility 10 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ25V', name: 'Volatility 25 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ50V', name: 'Volatility 50 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ75V', name: 'Volatility 75 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
    { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index', market: 'synthetic_index', pip_size: 0.01 },
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
];

const TREND_WINDOW = 60;
const REQUEST_TIMEOUT_MS = 12000;

function digitFromQuote(quote: number, decimals = 2) {
    const fixed = Math.abs(quote).toFixed(Math.max(0, decimals));
    return Number(fixed.charAt(fixed.length - 1)) || 0;
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
                () => reject(new Error('Deriv request timed out. Check the connection and try again.')),
                timeoutMs
            )
        ),
    ]);
}

function classifyDigits(counts: number[], recentTicks: Tick[]) {
    const byCount = counts.map((c, d) => ({ d, c }));
    const desc = [...byCount].sort((a, b) => b.c - a.c || a.d - b.d);
    const asc = [...byCount].sort((a, b) => a.c - b.c || a.d - b.d);
    const mostDigit = desc[0]?.c > 0 ? desc[0].d : null;
    const secondMostDigit = desc[1]?.c > 0 ? desc[1].d : null;
    const leastDigit = asc[0] ? asc[0].d : null;
    const secondLeastDigit = asc[1] ? asc[1].d : null;

    let trendDigit: number | null = null;
    const sample = recentTicks.slice(-TREND_WINDOW);
    if (sample.length >= 10) {
        const mid = Math.floor(sample.length / 2);
        const firstHalf = sample.slice(0, mid);
        const secondHalf = sample.slice(mid);
        const rate = (half: Tick[], d: number) =>
            half.filter(t => t.digit === d).length / Math.max(1, half.length);
        let bestDelta = 0;
        for (let d = 0; d < 10; d++) {
            const delta = rate(secondHalf, d) - rate(firstHalf, d);
            if (delta > bestDelta) {
                bestDelta = delta;
                trendDigit = d;
            }
        }
    }

    const classOf: string[] = new Array(10).fill('');
    for (let d = 0; d < 10; d++) {
        if (d === trendDigit) classOf[d] = 'is-trend';
        else if (d === mostDigit) classOf[d] = 'is-most';
        else if (d === leastDigit) classOf[d] = 'is-least';
        else if (d === secondMostDigit) classOf[d] = 'is-second-most';
        else if (d === secondLeastDigit) classOf[d] = 'is-second-least';
    }
    return classOf;
}

type SentinelSignal = { type: ContractType; barrier: number; label: string; confidence: number; edge: number };

function computeSentinelSignal(analysisTicks: Tick[]): SentinelSignal | null {
    const n = analysisTicks.length;
    if (n < 20) return null;
    const counts = new Array(10).fill(0);
    for (const t of analysisTicks) counts[t.digit]++;
    const candidates: SentinelSignal[] = [];

    const evenN = counts.reduce((sum, c, d) => sum + (d % 2 === 0 ? c : 0), 0);
    const oddN = n - evenN;
    candidates.push({ type: 'DIGITEVEN', barrier: 0, label: 'Even', confidence: 0, edge: evenN / n - 0.5 });
    candidates.push({ type: 'DIGITODD', barrier: 0, label: 'Odd', confidence: 0, edge: oddN / n - 0.5 });

    for (let b = 1; b <= 9; b++) {
        const under = counts.slice(0, b).reduce((a, c) => a + c, 0);
        candidates.push({ type: 'DIGITUNDER', barrier: b, label: 'Under ' + b, confidence: 0, edge: under / n - b / 10 });
    }
    for (let b = 0; b <= 8; b++) {
        const over = counts.slice(b + 1).reduce((a, c) => a + c, 0);
        candidates.push({
            type: 'DIGITOVER',
            barrier: b,
            label: 'Over ' + b,
            confidence: 0,
            edge: over / n - (9 - b) / 10,
        });
    }

    const best = candidates.reduce((a, b) => (b.edge > a.edge ? b : a));
    if (best.edge <= 0.015) return null;
    const confidence = Math.max(1, Math.min(97, Math.round(best.edge * 100 * Math.sqrt(n / 40))));
    return { ...best, confidence };
}

function labelFor(type: ContractType, barrier: number) {
    if (type === 'CALL') return 'Rise';
    if (type === 'PUT') return 'Fall';
    if (type === 'DIGITEVEN') return 'Even';
    if (type === 'DIGITODD') return 'Odd';
    if (type === 'DIGITOVER') return 'Over ' + barrier;
    if (type === 'DIGITUNDER') return 'Under ' + barrier;
    if (type === 'DIGITMATCH') return 'Matches ' + barrier;
    if (type === 'DIGITDIFF') return 'Differs ' + barrier;
    if (type === 'HIGHER') return 'Higher ' + barrier;
    if (type === 'LOWER') return 'Lower ' + barrier;
    if (type === 'TOUCH') return 'Touch ' + barrier;
    return 'No Touch ' + barrier;
}

function getTransport(): any {
    if (api_base?.api && (api_base.api as any).send) return api_base.api;
    if (chart_api?.api && (chart_api.api as any).send) return chart_api.api;
    return null;
}

export default observer(function DTrader() {
    const { client, journal, transactions, summary_card, run_panel } = useStore();
    const [symbol, setSymbol] = useState('R_50');
    const [markets, setMarkets] = useState<any[]>(DEFAULT_MARKETS);
    const [marketOpen, setMarketOpen] = useState(false);
    const [ticks, setTicks] = useState<Tick[]>([]);
    const [type, setType] = useState<ContractType>('DIGITUNDER');
    const [barrier, setBarrier] = useState(6);
    const [duration, setDuration] = useState(1);
    const [stake, setStake] = useState(10);
    const [proposal, setProposal] = useState<any>(null);
    const [openContracts, setOpenContracts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [windowSize, setWindowSize] = useState(100);
    const [feedState, setFeedState] = useState('CONNECTING');
    const [message, setMessage] = useState('');
    const [entryDigit, setEntryDigit] = useState<number | ''>('');
    const [armed, setArmed] = useState(false);
    const buyInFlightRef = useRef(false);

    useEffect(() => {
        const onPrefill = (evt: Event) => {
            const detail = (evt as CustomEvent<any>).detail;
            if (!detail) return;
            if (detail.symbol) setSymbol(String(detail.symbol));
            if (detail.contractType) setType(detail.contractType as ContractType);
            if (typeof detail.barrier === 'number') setBarrier(detail.barrier);
        };
        window.addEventListener('tp-dtrader-prefill', onPrefill);
        return () => window.removeEventListener('tp-dtrader-prefill', onPrefill);
    }, []);

    const live1000 = useMemo(() => (ticks.length > 1000 ? ticks.slice(-1000) : ticks), [ticks]);
    const analysis = useMemo(() => ticks.slice(-windowSize), [ticks, windowSize]);

    const { counts, evenCount } = useMemo(() => {
        const next = new Array(10).fill(0) as number[];
        let even = 0;
        for (let i = 0; i < analysis.length; i++) {
            const d = analysis[i].digit;
            next[d]++;
            if (d % 2 === 0) even++;
        }
        return { counts: next, evenCount: even };
    }, [analysis]);

    const total = Math.max(1, analysis.length);
    const evenPct = (evenCount / total) * 100;
    const oddPct = 100 - evenPct;
    const digitClasses = useMemo(() => classifyDigits(counts, ticks), [counts, ticks]);
    const sentinelSignal = useMemo(() => computeSentinelSignal(analysis), [analysis]);
    const last = live1000.length ? live1000[live1000.length - 1].digit : null;

    const [pulseDigit, setPulseDigit] = useState<number | null>(null);
    const pulseTimerRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        if (last == null) return;
        setPulseDigit(last);
        window.clearTimeout(pulseTimerRef.current);
        pulseTimerRef.current = window.setTimeout(() => setPulseDigit(null), 380);
        return () => window.clearTimeout(pulseTimerRef.current);
    }, [last, ticks.length]);

    const selectedMarket = markets.find(m => m.symbol === symbol);
    const decimals = selectedMarket?.pip_size
        ? Math.max(0, Math.round(-Math.log10(Number(selectedMarket.pip_size))))
        : derivBus.getPipSize(symbol);

    const decimalsRef = useRef(decimals);
    useEffect(() => {
        decimalsRef.current = decimals;
    }, [decimals]);

    const psychology = useMemo(() => {
        const n = Math.min(1000, ticks.length);
        if (!n) return { odd: 0, even: 0, under7: 0, over2: 0, danger: 100 };
        let odd_n = 0;
        let under7_n = 0;
        let over2_n = 0;
        for (let i = ticks.length - n; i < ticks.length; i++) {
            const d = ticks[i].digit;
            if (d % 2) odd_n++;
            if (d <= 6) under7_n++;
            if (d >= 3) over2_n++;
        }
        const odd = (odd_n / n) * 100;
        const even = 100 - odd;
        const under7 = (under7_n / n) * 100;
        const over2 = (over2_n / n) * 100;
        const danger = Math.round(
            Math.min(100, Math.abs(50 - (type === 'DIGITUNDER' ? under7 : over2)) * 2 + (n < 100 ? 25 : 0))
        );
        return { odd, even, under7, over2, danger };
    }, [ticks, type]);

    const sparklineGeometry = useMemo(() => {
        const recent = ticks.slice(-80);
        if (recent.length < 2) return null;
        const prices = recent.map(t => t.quote);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const span = max - min || 1;
        const w = 680;
        const h = 150;
        const pts = prices.map((p, idx) => {
            const x = (idx / (prices.length - 1)) * w;
            const y = h - 12 - ((p - min) / span) * (h - 24);
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        });
        const linePath = `M ${pts.join(' L ')}`;
        const areaPath = `${linePath} L ${w},${h} L 0,${h} Z`;
        const first = prices[0];
        const latest = prices[prices.length - 1];
        const diff = latest - first;
        const pctDiff = first ? (diff / first) * 100 : 0;
        return { linePath, areaPath, min, max, diff, pctDiff };
    }, [ticks]);

    useEffect(() => {
        let cancelled = false;
        const loadMarkets = async () => {
            try {
                if (!Array.isArray(api_base.active_symbols) || !api_base.active_symbols.length) {
                    if (api_base.active_symbols_promise) await api_base.active_symbols_promise;
                    else if (api_base.getActiveSymbols) await api_base.getActiveSymbols();
                }
                const raw = Array.isArray(api_base.active_symbols) ? api_base.active_symbols : [];
                if (cancelled || !raw.length) return;
                const live = raw
                    .map((m: any) => ({
                        symbol: String(m.underlying_symbol || m.symbol),
                        name: String(
                            m.underlying_symbol_name || m.display_name || m.name || m.underlying_symbol || m.symbol
                        ),
                        market: String(m.market || 'synthetic_index'),
                        pip_size: Number(m.pip_size || m.pip || 0.01),
                    }))
                    .filter((m: any) => m.symbol);
                if (live.length) setMarkets(live);
            } catch {}
        };
        void loadMarkets();
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setFeedState('LOADING');

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
        const releaseStatus = derivBus.onStatus(st => {
            if (cancelled) return;
            if (st === 'error') setFeedState('ERROR');
            else if (st === 'connecting') setFeedState('CONNECTING');
            else if (st === 'live') setFeedState('LIVE');
        });
        const releaseTick = derivBus.onTick((tickSymbol, tick) => {
            if (cancelled || tickSymbol !== symbol) return;
            const pip = derivBus.getPipSize(symbol);
            setTicks(previous =>
                [
                    ...previous,
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
            releaseStatus();
        };
    }, [symbol]);

    const isAuthorizedSession = Boolean(client?.is_logged_in || api_base?.is_authorized);
    const activeCurrency = client?.currency || (api_base?.account_info as any)?.currency || 'USD';

    useEffect(() => {
        const transport = getTransport();
        if (!transport?.send) {
            setProposal(null);
            return;
        }
        let cancelled = false;
        const timer = window.setTimeout(async () => {
            if (buyInFlightRef.current) return;
            setLoading(true);
            try {
                const spec = normalizeDerivContractParams({
                    contractType: type,
                    duration,
                    barrier,
                });
                const buildProposalReq = (useUnderlying: boolean) => {
                    const req: Record<string, any> = {
                        proposal: 1,
                        amount: Math.max(0.35, Number(stake) || 1),
                        basis: 'stake',
                        contract_type: spec.apiContractType,
                        currency: activeCurrency,
                        duration: spec.duration,
                        duration_unit: spec.durationUnit,
                    };
                    if (useUnderlying) req.underlying_symbol = symbol;
                    else req.symbol = symbol;
                    if (spec.barrier !== undefined) req.barrier = spec.barrier;
                    return req;
                };

                let res: any;
                try {
                    res = await sendWithTimeout(transport.send.bind(transport), buildProposalReq(true));
                    if (res?.error?.code === 'InputValidationFailed') {
                        res = await sendWithTimeout(transport.send.bind(transport), buildProposalReq(false));
                    }
                } catch (firstErr: any) {
                    const code = firstErr?.error?.code || firstErr?.code || '';
                    if (code === 'InputValidationFailed') {
                        res = await sendWithTimeout(transport.send.bind(transport), buildProposalReq(false));
                    } else {
                        throw firstErr;
                    }
                }
                if (!cancelled) setProposal(res?.proposal || null);
            } catch {
                if (!cancelled) setProposal(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 250);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [isAuthorizedSession, activeCurrency, symbol, type, barrier, duration, stake]);

    useEffect(() => {
        if (!armed || entryDigit === '' || !ticks.length) return;
        const latest = ticks[ticks.length - 1];
        if (latest.digit !== entryDigit) return;
        setArmed(false);
        void buy();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticks, armed, entryDigit]);

    function applySentinelSignal() {
        if (!sentinelSignal) return;
        setType(sentinelSignal.type);
        if (sentinelSignal.type === 'DIGITOVER' || sentinelSignal.type === 'DIGITUNDER') {
            setBarrier(sentinelSignal.barrier);
        }
    }

    async function connectAccount() {
        try {
            const url = await generateOAuthURL();
            if (url) window.location.replace(url);
            else setMessage('Unable to start Deriv account connection.');
        } catch (e: any) {
            setMessage(e?.message || 'Unable to start Deriv account connection.');
        }
    }

    async function buy() {
        if (!isAuthorizedSession) {
            setMessage('Log in to your Deriv account before buying.');
            return;
        }
        if (buyInFlightRef.current) return;
        buyInFlightRef.current = true;
        setLoading(true);
        setMessage('');
        try {
            const { contractId, buyPrice, payout, longcode } = await executeLiveDerivTrade({
                symbol,
                contractType: type,
                stake,
                duration,
                barrier,
                currency: activeCurrency,
                stores: { journal, transactions, summary_card, run_panel },
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
                                      payout: Number(pc.payout || 0),
                                  }
                                : x
                        )
                    );
                },
            });
            setOpenContracts(prev =>
                [
                    {
                        id: contractId,
                        label: labelFor(type, barrier),
                        status: 'open',
                        profit: 0,
                        bid: buyPrice,
                        payout,
                    },
                    ...prev,
                ].slice(0, 20)
            );
            setMessage(longcode ? `Bought: ${longcode}` : `Contract purchased: #${contractId}`);
        } catch (e: any) {
            setMessage(extractDerivApiError(e, 'Purchase failed — please try again.'));
        } finally {
            buyInFlightRef.current = false;
            setLoading(false);
        }
    }

    async function sell(contractId: number) {
        const transport = getTransport();
        if (!transport?.send) return;
        try {
            await sendWithTimeout(transport.send.bind(transport), { sell: contractId, price: 0 });
            setMessage('Sell order submitted for #' + contractId);
        } catch (e: any) {
            setMessage(extractDerivApiError(e, 'Sell request failed.'));
        }
    }

    function isBarrierValid() {
        if (!['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(type)) return true;
        if (type === 'DIGITUNDER') return barrier >= 1 && barrier <= 9;
        if (type === 'DIGITOVER') return barrier >= 0 && barrier <= 8;
        return barrier >= 0 && barrier <= 9;
    }

    const filteredMarkets = markets.filter(m =>
        (m.symbol + ' ' + m.name).toLowerCase().includes(search.toLowerCase())
    );
    const latestQuoteStr = ticks.length ? ticks[ticks.length - 1].quote.toFixed(decimals) : '—';

    return (
        <div className='dtrader dtrader--real'>
            <div className='dt-header'>
                <div className='dt-brand'>
                    <div className='dt-brand__badge'>D</div>
                    <div>
                        <strong>DTrader</strong>
                        <span>Live Deriv trading terminal</span>
                    </div>
                </div>
                <div className='dt-market-picker-wrap'>
                    <button
                        type='button'
                        className='dt-market-picker'
                        onClick={() => setMarketOpen(v => !v)}
                    >
                        <b>{symbol}</b>
                        <span>{selectedMarket?.name || symbol}</span>
                        <em>⌄</em>
                    </button>
                    {marketOpen && (
                        <div className='dt-market-menu'>
                            <div className='dt-search'>
                                <input
                                    autoFocus
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder='Search synthetic / jump / crash / boom…'
                                />
                                <button type='button' onClick={() => setMarketOpen(false)}>
                                    ×
                                </button>
                            </div>
                            <div className='dt-market-list'>
                                {filteredMarkets.slice(0, 80).map(m => (
                                    <button
                                        key={m.symbol}
                                        type='button'
                                        className={m.symbol === symbol ? 'selected' : ''}
                                        onClick={() => {
                                            setSymbol(m.symbol);
                                            setMarketOpen(false);
                                            setSearch('');
                                        }}
                                    >
                                        <strong>{m.symbol}</strong>
                                        <span>{m.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className='dt-header-status'>
                    <i className={feedState.toLowerCase()} />
                    {feedState}
                    <span>{client?.loginid || 'Live Feed'}</span>
                </div>
            </div>

            <div className='dtrader__grid'>
                <main>
                    <section className='dt-price-card'>
                        <div className='dt-price-head'>
                            <div>
                                <small>LIVE MARKET STREAM</small>
                                <strong>{selectedMarket?.name || symbol}</strong>
                            </div>
                            <div className='dt-price-quote-group'>
                                <b>{latestQuoteStr}</b>
                                {sparklineGeometry && (
                                    <span
                                        className={
                                            sparklineGeometry.diff >= 0 ? 'dt-delta dt-delta--up' : 'dt-delta dt-delta--down'
                                        }
                                    >
                                        {sparklineGeometry.diff >= 0 ? '+' : ''}
                                        {sparklineGeometry.diff.toFixed(decimals)} (
                                        {sparklineGeometry.pctDiff.toFixed(2)}%)
                                    </span>
                                )}
                            </div>
                        </div>
                        {sparklineGeometry && (
                            <div className='dt-sparkline-wrap'>
                                <svg viewBox='0 0 680 150' preserveAspectRatio='none' className='dt-sparkline'>
                                    <defs>
                                        <linearGradient id='dtAreaGrad' x1='0' y1='0' x2='0' y2='1'>
                                            <stop offset='0%' stopColor='#0066ff' stopOpacity='0.34' />
                                            <stop offset='100%' stopColor='#0066ff' stopOpacity='0.0' />
                                        </linearGradient>
                                    </defs>
                                    <path d={sparklineGeometry.areaPath} fill='url(#dtAreaGrad)' />
                                    <path
                                        d={sparklineGeometry.linePath}
                                        fill='none'
                                        stroke='#0066ff'
                                        strokeWidth='2.2'
                                    />
                                </svg>
                                <div className='dt-sparkline-stats'>
                                    <span>High: {sparklineGeometry.max.toFixed(decimals)}</span>
                                    <span>Low: {sparklineGeometry.min.toFixed(decimals)}</span>
                                    <span>Last Digit: {last ?? '—'}</span>
                                </div>
                            </div>
                        )}
                    </section>

                    <section className='dtrader__panel'>
                        <div className='dtrader__panel-head'>
                            <strong>0–9 LIVE DIGIT FREQUENCY</strong>
                            <div className='dtrader__window'>
                                {[20, 50, 100, 120, 500, 1000].map(n => (
                                    <button
                                        key={n}
                                        type='button'
                                        className={windowSize === n ? 'active' : ''}
                                        onClick={() => setWindowSize(n)}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className='dtrader__note'>
                            Distribution over last {analysis.length} of {windowSize} ticks · buffer {live1000.length} / 1000
                        </div>
                        <div className='dtrader__digits'>
                            {counts.map((c, d) => {
                                const pct = (c / total) * 100;
                                return (
                                    <div
                                        className={
                                            'dtrader__digit ' +
                                            digitClasses[d] +
                                            (d === last ? ' is-last' : '') +
                                            (d === pulseDigit ? ' is-pulse' : '')
                                        }
                                        key={d}
                                    >
                                        <div
                                            className='dtrader__digit-ring'
                                            style={{ '--pct': Math.min(100, pct * 4) } as React.CSSProperties}
                                        >
                                            <div className='dtrader__digit-ring-inner'>
                                                <b>{d}</b>
                                            </div>
                                        </div>
                                        <span>{pct.toFixed(1)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                        <div className='dtrader__legend'>
                            <span className='is-most'>Most frequent</span>
                            <span className='is-second-most'>2nd most</span>
                            <span className='is-least'>Least frequent</span>
                            <span className='is-second-least'>2nd least</span>
                            <span className='is-trend'>Rising fastest (60t)</span>
                        </div>
                        <div className='dtrader__metrics'>
                            <Metric l='EVEN' v={evenPct.toFixed(1) + '%'} />
                            <Metric l='ODD' v={oddPct.toFixed(1) + '%'} />
                            <Metric l='LAST DIGIT' v={last == null ? '—' : String(last)} />
                            <Metric l='SAMPLE' v={analysis.length + ' / ' + windowSize} />
                            <Metric l='FEED' v={feedState} />
                        </div>
                    </section>

                    <section className='dtrader__panel dtrader__sentinel'>
                        <div className='dtrader__panel-head'>
                            <strong>Sentinel Statistical Signal</strong>
                            <span className='dtrader__badge'>LIVE ANALYSIS</span>
                        </div>
                        {sentinelSignal ? (
                            <div className='dtrader__signal'>
                                <div>
                                    <small>CURRENT SIGNAL · {analysis.length}-TICK WINDOW</small>
                                    <strong>{sentinelSignal.label}</strong>
                                    <span>+{(sentinelSignal.edge * 100).toFixed(1)}pp statistical edge above baseline</span>
                                </div>
                                <div className='dtrader__signal-confidence'>
                                    <b>{sentinelSignal.confidence}%</b>
                                    <small>CONFIDENCE</small>
                                </div>
                                <button type='button' onClick={applySentinelSignal}>
                                    Apply to Deck
                                </button>
                            </div>
                        ) : (
                            <div className='dtrader__signal dtrader__signal--flat'>
                                Monitoring live tick distribution — waiting for statistical edge above random baseline.
                            </div>
                        )}
                        <div className='dtrader__metrics'>
                            <Metric l='UNDER 7 SUPPORT' v={psychology.under7.toFixed(1) + '%'} />
                            <Metric l='OVER 2 SUPPORT' v={psychology.over2.toFixed(1) + '%'} />
                            <Metric
                                l='ODD / EVEN'
                                v={psychology.odd.toFixed(1) + '% / ' + psychology.even.toFixed(1) + '%'}
                            />
                            <Metric l='VOLATILITY RISK' v={psychology.danger + ' / 100'} />
                            <Metric l='BUFFERED TICKS' v={String(ticks.length)} />
                        </div>
                    </section>

                    {openContracts.length > 0 && (
                        <section className='dtrader__panel dtrader__open-list'>
                            <div className='dtrader__open-list-title'>
                                <small>ACTIVE &amp; RECENT CONTRACTS</small>
                            </div>
                            {openContracts.map(oc => {
                                const resolved = TERMINAL_STATUSES.includes(oc.status);
                                return (
                                    <div
                                        key={oc.id}
                                        className={
                                            'dtrader__open' +
                                            (resolved ? ' is-resolved is-' + oc.status : '')
                                        }
                                    >
                                        <div>
                                            <small>{resolved ? 'CONTRACT ' + oc.status.toUpperCase() : 'OPEN CONTRACT'}</small>
                                            <strong>
                                                {oc.label} · #{oc.id}
                                            </strong>
                                        </div>
                                        <Metric l='STATUS' v={oc.status.toUpperCase()} />
                                        <Metric l='P/L' v={(oc.profit >= 0 ? '+' : '') + Number(oc.profit || 0).toFixed(2)} />
                                        <Metric l='BID' v={Number(oc.bid || 0).toFixed(2)} />
                                        <button type='button' onClick={() => void sell(oc.id)} disabled={resolved}>
                                            {resolved ? 'SETTLED' : 'SELL NOW'}
                                        </button>
                                    </div>
                                );
                            })}
                        </section>
                    )}
                </main>

                <aside className='dtrader__panel dtrader__deck'>
                    <h3>ADAPTIVE TRADE DECK</h3>
                    <label>CONTRACT TYPE</label>
                    <div className='dtrader__contracts'>
                        {CONTRACTS.map(c => (
                            <button
                                key={c.id}
                                type='button'
                                className={type === c.id ? 'active' : ''}
                                onClick={() => {
                                    setType(c.id);
                                    if (c.id === 'DIGITOVER' && barrier > 8) setBarrier(8);
                                    if (c.id === 'DIGITUNDER' && barrier < 1) setBarrier(1);
                                }}
                            >
                                {c.label}
                            </button>
                        ))}
                    </div>

                    {[
                        'DIGITOVER',
                        'DIGITUNDER',
                        'DIGITMATCH',
                        'DIGITDIFF',
                        'HIGHER',
                        'LOWER',
                        'TOUCH',
                        'NOTOUCH',
                    ].includes(type) && (
                        <>
                            <label>{type.startsWith('DIGIT') ? 'PREDICTION DIGIT (0–9)' : 'BARRIER'}</label>
                            <input
                                type='number'
                                value={barrier}
                                min={0}
                                max={9}
                                onChange={e => setBarrier(Number(e.target.value))}
                            />
                        </>
                    )}

                    <label>DURATION (TICKS)</label>
                    <div className='dtrader__durations'>
                        {[1, 2, 3, 4, 5].map(n => (
                            <button
                                key={n}
                                type='button'
                                className={duration === n ? 'active' : ''}
                                onClick={() => setDuration(n)}
                            >
                                {n}t
                            </button>
                        ))}
                    </div>

                    <label>STAKE ({activeCurrency})</label>
                    <input
                        type='number'
                        value={stake}
                        min={0.35}
                        step={0.01}
                        onChange={e => setStake(Math.max(0.35, Number(e.target.value)))}
                    />

                    <label>AUTO-TRIGGER ON ENTRY DIGIT (OPTIONAL)</label>
                    <div className='dtrader__run-row'>
                        <input
                            type='number'
                            min={0}
                            max={9}
                            placeholder='Digit 0–9'
                            value={entryDigit}
                            onChange={e => setEntryDigit(e.target.value === '' ? '' : Number(e.target.value))}
                        />
                        <button
                            type='button'
                            className={'dtrader__run' + (armed ? ' active' : '')}
                            disabled={entryDigit === '' || !isAuthorizedSession}
                            onClick={() => setArmed(v => !v)}
                        >
                            {armed ? `ARMED (${entryDigit})` : 'ARM DIGIT'}
                        </button>
                    </div>

                    <div className='dtrader__quote'>
                        <Metric l='MARKET' v={symbol} />
                        <Metric l='CONTRACT' v={labelFor(type, barrier)} />
                        <Metric
                            l='ASK PRICE'
                            v={loading ? '…' : proposal?.ask_price != null ? Number(proposal.ask_price).toFixed(2) : String(stake.toFixed(2))}
                        />
                        <Metric
                            l='PROPOSAL PAYOUT'
                            v={proposal?.payout != null ? Number(proposal.payout).toFixed(2) + ' ' + activeCurrency : '—'}
                        />
                    </div>

                    <button
                        type='button'
                        className='dtrader__buy'
                        onClick={isAuthorizedSession ? () => void buy() : () => void connectAccount()}
                        disabled={isAuthorizedSession ? loading || !isBarrierValid() : false}
                    >
                        {isAuthorizedSession
                            ? '▶ RUN ' + labelFor(type, barrier).toUpperCase()
                            : 'CONNECT DERIV ACCOUNT'}
                    </button>

                    {message && <div className='dtrader__message'>{message}</div>}
                    <small>Live Deriv WebSocket execution with instant contract settlement monitoring.</small>
                </aside>
            </div>
        </div>
    );
});

function Metric({ l, v }: { l: string; v: string }) {
    return (
        <div className='dtrader__metric'>
            <small>{l}</small>
            <b>{v}</b>
        </div>
    );
}
