import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import {
    RecordTabKey,
    TabExecutionRecordPanel,
} from '@/components/tab-trade-record/tab-execution-record-panel';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { derivBus } from '@/lib/deriv/tick-bus';
import {
    AIBotContractKind,
    compileAIBotToXml,
    executeLiveDerivTrade,
    loadXmlIntoBotBuilder,
} from '@/utils/ai-bot-xml-builder';
import './analysis-tool.scss';

const MARKETS = [
    { code: '1HZ10V', label: 'Volatility 10 (1s)' },
    { code: '1HZ25V', label: 'Volatility 25 (1s)' },
    { code: '1HZ50V', label: 'Volatility 50 (1s)' },
    { code: '1HZ75V', label: 'Volatility 75 (1s)' },
    { code: '1HZ100V', label: 'Volatility 100 (1s)' },
    { code: 'R_10', label: 'Volatility 10' },
    { code: 'R_25', label: 'Volatility 25' },
    { code: 'R_50', label: 'Volatility 50' },
    { code: 'R_75', label: 'Volatility 75' },
    { code: 'R_100', label: 'Volatility 100' },
    { code: 'JD10', label: 'Jump 10' },
    { code: 'JD25', label: 'Jump 25' },
    { code: 'JD50', label: 'Jump 50' },
    { code: 'JD75', label: 'Jump 75' },
    { code: 'JD100', label: 'Jump 100' },
    { code: 'CRASH500', label: 'Crash 500' },
    { code: 'CRASH1000', label: 'Crash 1000' },
    { code: 'BOOM500', label: 'Boom 500' },
    { code: 'BOOM1000', label: 'Boom 1000' },
];

type AnalysisMode = 'even_odd' | 'over_under' | 'matches_differs' | 'rise_fall';

const ANALYSIS_MODES: { value: AnalysisMode; label: string }[] = [
    { value: 'even_odd', label: 'Even / Odd' },
    { value: 'over_under', label: 'Over / Under' },
    { value: 'matches_differs', label: 'Matches / Differs' },
    { value: 'rise_fall', label: 'Rise / Fall' },
];

const WINDOWS = [100, 250, 500, 1000];
const DURATIONS = [1, 2, 3, 4, 5, 7, 10];

const lastDigitOf = (q: number, pip: number) => {
    const s = Math.abs(q).toFixed(Math.max(0, pip));
    return Number(s.charAt(s.length - 1)) || 0;
};

const AnalysisTool = observer(() => {
    const { client, dashboard, load_modal, run_panel, transactions } = useStore();
    const [viewMode, setViewMode] = useState<'native' | 'binarytool'>('native');
    const [symbol, setSymbol] = useState('R_50');
    const [mode, setMode] = useState<AnalysisMode>('over_under');
    const [windowSize, setWindowSize] = useState(250);
    const [duration, setDuration] = useState(1);
    const [barrier, setBarrier] = useState(4);
    const [stake, setStake] = useState('1');
    const [prices, setPrices] = useState<number[]>([]);
    const [busy, setBusy] = useState(false);
    const [tradeFeedback, setTradeFeedback] = useState<string | null>(null);
    const [recordOpen, setRecordOpen] = useState(true);
    const [recordTab, setRecordTab] = useState<RecordTabKey>('journal');

    useEffect(() => {
        if (viewMode !== 'native') return;
        let cancelled = false;
        const sync = (sym: string, list: { t: number; price: number }[]) => {
            if (cancelled || sym !== symbol || !list.length) return;
            setPrices(list.slice(-windowSize).map(x => x.price));
        };
        const u1 = derivBus.onHistory(sync);
        const u2 = derivBus.onTick((sym, tk) => {
            if (cancelled || sym !== symbol) return;
            setPrices(prev => [...prev, tk.price].slice(-windowSize));
        });
        sync(symbol, derivBus.getTicks(symbol));
        const rel = derivBus.subscribe([symbol]);
        return () => {
            cancelled = true;
            u1();
            u2();
            rel();
        };
    }, [symbol, windowSize, viewMode]);

    const pip = derivBus.getPipSize(symbol);

    const intelligence = useMemo(() => {
        if (prices.length < 15) return null;
        const digits = prices.map(p => lastDigitOf(p, pip));
        const n = digits.length;

        const checkOutcome = (idx: number): boolean => {
            const d = digits[idx];
            if (mode === 'even_odd') return d % 2 === 0;
            if (mode === 'over_under') return d > barrier;
            if (mode === 'matches_differs') return d !== barrier;
            return idx > 0 ? prices[idx] > prices[idx - 1] : true;
        };

        const outcomes = prices.map((_, i) => checkOutcome(i));
        const primaryWins = outcomes.filter(Boolean).length;
        const primaryPct = (primaryWins / n) * 100;
        const secondaryPct = 100 - primaryPct;

        const shortSlice = outcomes.slice(-30);
        const shortPrimaryPct = (shortSlice.filter(Boolean).length / Math.max(1, shortSlice.length)) * 100;

        let transSame = 0;
        let transTotal = 0;
        const lastState = outcomes[outcomes.length - 1];
        for (let i = 1; i < outcomes.length; i++) {
            if (outcomes[i - 1] === lastState) {
                transTotal++;
                if (outcomes[i] === lastState) transSame++;
            }
        }
        const markovPrimaryPct =
            transTotal > 0
                ? lastState
                    ? (transSame / transTotal) * 100
                    : 100 - (transSame / transTotal) * 100
                : primaryPct;

        const primaryLabels: Record<AnalysisMode, { a: string; b: string; ctA: AIBotContractKind; ctB: AIBotContractKind }> = {
            even_odd: { a: 'EVEN', b: 'ODD', ctA: 'DIGITEVEN', ctB: 'DIGITODD' },
            over_under: {
                a: `OVER ${barrier}`,
                b: `UNDER ${barrier}`,
                ctA: 'DIGITOVER',
                ctB: 'DIGITUNDER',
            },
            matches_differs: {
                a: `DIFFERS ${barrier}`,
                b: `MATCHES ${barrier}`,
                ctA: 'DIGITDIFF',
                ctB: 'DIGITMATCH',
            },
            rise_fall: { a: 'RISE', b: 'FALL', ctA: 'CALL', ctB: 'PUT' },
        };

        const lbl = primaryLabels[mode];
        const compositePrimary = primaryPct * 0.45 + shortPrimaryPct * 0.35 + markovPrimaryPct * 0.2;
        const favorPrimary = compositePrimary >= 50;
        const bestLabel = favorPrimary ? lbl.a : lbl.b;
        const bestContract = favorPrimary ? lbl.ctA : lbl.ctB;
        const winEstimate = favorPrimary ? compositePrimary : 100 - compositePrimary;
        const confidence = Math.min(96, Math.max(52, Math.round(winEstimate)));

        const pattern30 = prices.slice(-30).map((p, idx, arr) => {
            const d = lastDigitOf(p, pip);
            if (mode === 'even_odd') {
                const win = d % 2 === 0;
                return { tag: win ? 'E' : 'O', win };
            }
            if (mode === 'over_under') {
                if (d === barrier) return { tag: String(d), win: false };
                const win = d > barrier;
                return { tag: win ? 'Ov' : 'Un', win };
            }
            if (mode === 'matches_differs') {
                const win = d !== barrier;
                return { tag: win ? 'D' : 'M', win };
            }
            const up = idx > 0 ? p >= arr[idx - 1] : true;
            return { tag: up ? 'R' : 'F', win: up };
        });

        let streak = 1;
        for (let i = pattern30.length - 2; i >= 0; i--) {
            if (pattern30[i].tag === pattern30[pattern30.length - 1]?.tag) streak++;
            else break;
        }

        const sparkPrices = prices.slice(-70);
        const min = Math.min(...sparkPrices);
        const max = Math.max(...sparkPrices);
        const span = max - min || 1;
        const pts = sparkPrices
            .map((p, idx) => {
                const x = (idx / Math.max(1, sparkPrices.length - 1)) * 640;
                const y = 128 - ((p - min) / span) * 108;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' L ');

        return {
            primaryLabel: lbl.a,
            secondaryLabel: lbl.b,
            primaryPct,
            secondaryPct,
            shortPrimaryPct,
            markovPrimaryPct,
            bestLabel,
            bestContract,
            confidence,
            pattern30,
            streak,
            lastDigit: digits[digits.length - 1],
            latestPrice: prices[prices.length - 1].toFixed(pip),
            sparkPath: `M ${pts}`,
        };
    }, [prices, mode, barrier, pip]);

    const handleInstantTrade = async () => {
        if (!intelligence) return;
        setBusy(true);
        setTradeFeedback(null);
        try {
            const activeCurr = client?.currency || 'USD';
            const res = await executeLiveDerivTrade({
                symbol,
                contractType: intelligence.bestContract,
                stake: Math.max(0.35, Number(stake) || 1),
                duration,
                barrier: ['DIGITOVER', 'DIGITUNDER', 'DIGITDIFF', 'DIGITMATCH'].includes(intelligence.bestContract)
                    ? barrier
                    : undefined,
                currency: activeCurr,
                tabNamespace: 'analysis',
                stores: { transactions },
                onContractUpdate: (poc, isTerminal) => {
                    if (!isTerminal) return;
                    const pl = Number(poc.profit ?? 0);
                    const curr = poc.currency || activeCurr;
                    setTradeFeedback(
                        `${pl >= 0 ? 'Won' : 'Lost'} ${intelligence.bestLabel} (#${poc.contract_id}) · ${pl >= 0 ? '+' : ''}${pl.toFixed(2)} ${curr}`
                    );
                },
            });
            setRecordOpen(true);
            setTradeFeedback(
                res.longcode
                    ? `Bought: ${res.longcode}`
                    : `Bought ${intelligence.bestLabel} (#${res.contractId}) · Payout ${activeCurr} ${res.payout.toFixed(2)}`
            );
        } catch (e: any) {
            setTradeFeedback(e?.message || 'Execution failed.');
        } finally {
            setBusy(false);
        }
    };

    const handleLoadIntoBuilder = async (runNow = false) => {
        if (!intelligence) return;
        const xml = compileAIBotToXml({
            name: `Analysis Tool ${intelligence.bestLabel} (${symbol})`,
            symbol,
            contractType: intelligence.bestContract,
            barrier,
            baseStake: Math.max(0.35, Number(stake) || 1),
            martingaleMultiplier: intelligence.bestContract === 'DIGITDIFF' ? 11 : 2.1,
            takeProfit: 10,
            stopLoss: 25,
            virtualHookEnabled: true,
            virtualHookStartMode: 'virtual',
            virtualHookLosses: 1,
            virtualHookWins: 1,
        });
        await loadXmlIntoBotBuilder({
            xml,
            name: `Analysis Tool ${intelligence.bestLabel} (${symbol})`,
            dashboard,
            load_modal,
            runNow,
            run_panel,
        });
    };

    return (
        <div className='rm-analysis'>
            <div className='rm-analysis__topbar'>
                <div>
                    <h2>Analysis Tool</h2>
                    <span>Real-time 3-model statistical, Markov &amp; momentum signal engine</span>
                </div>
                <div className='rm-analysis__mode-switch'>
                    <button
                        type='button'
                        className={viewMode === 'native' ? 'active' : ''}
                        onClick={() => setViewMode('native')}
                    >
                        Live AI Analysis Engine
                    </button>
                    <button
                        type='button'
                        className={viewMode === 'binarytool' ? 'active' : ''}
                        onClick={() => setViewMode('binarytool')}
                    >
                        BinaryTool Scanner
                    </button>
                </div>
            </div>

            {viewMode === 'binarytool' ? (
                <div className='rm-analysis__scanner-shell'>
                    <div className='rm-analysis__iframe-wrap'>
                        <iframe
                            src='https://api.binarytool.site'
                            title='Analysis Tool'
                            className='rm-analysis__iframe'
                        />
                    </div>
                    <TabExecutionRecordPanel
                        namespace='analysis'
                        title='ANALYSIS RECORD'
                        previewTitle='Analysis Transactions (Preview)'
                        resetLabel='Reset Analysis'
                        emptyHint='Execute recommended AI signals in Analysis Tool to record dedicated Analysis Journal entries and Transactions here.'
                        variant='analysis'
                        activeTab={recordTab}
                        onActiveTabChange={setRecordTab}
                        isOpen={recordOpen}
                        onToggleOpen={setRecordOpen}
                        currencyFallback={client?.currency || 'USD'}
                    />
                </div>
            ) : (
                <div className='rm-analysis__body'>
                    <section className='rm-analysis__controls'>
                        <label>
                            Market
                            <select value={symbol} onChange={e => setSymbol(e.target.value)}>
                                {MARKETS.map(m => (
                                    <option key={m.code} value={m.code}>
                                        {m.label} ({m.code})
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Contract Family
                            <select value={mode} onChange={e => setMode(e.target.value as AnalysisMode)}>
                                {ANALYSIS_MODES.map(m => (
                                    <option key={m.value} value={m.value}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {(mode === 'over_under' || mode === 'matches_differs') && (
                            <label>
                                Barrier Digit (0–9)
                                <input
                                    type='number'
                                    min={0}
                                    max={9}
                                    value={barrier}
                                    onChange={e => setBarrier(Math.max(0, Math.min(9, Number(e.target.value))))}
                                />
                            </label>
                        )}
                        <label>
                            Ticks Duration
                            <select value={duration} onChange={e => setDuration(Number(e.target.value))}>
                                {DURATIONS.map(d => (
                                    <option key={d} value={d}>
                                        {d}t
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Sample
                            <select value={windowSize} onChange={e => setWindowSize(Number(e.target.value))}>
                                {WINDOWS.map(w => (
                                    <option key={w} value={w}>
                                        {w} Ticks
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Quick Stake ({client?.currency || 'USD'})
                            <input
                                type='number'
                                min={0.35}
                                step={0.1}
                                value={stake}
                                onChange={e => setStake(e.target.value)}
                            />
                        </label>
                    </section>

                    <div className='rm-analysis__workspace'>
                        <div className='rm-analysis__main-col'>
                            {!intelligence ? (
                                <div className='rm-analysis__loading'>Streaming live ticks for {symbol}…</div>
                            ) : (
                                <>
                                    <div className='rm-analysis__grid'>
                                        <section className='rm-analysis__card'>
                                            <div className='rm-analysis__card-head'>
                                                <strong>Live Price &amp; Momentum ({prices.length} Ticks)</strong>
                                                <span className='rm-analysis__quote'>
                                                    {intelligence.latestPrice} · Digit <b>{intelligence.lastDigit}</b>
                                                </span>
                                            </div>
                                            <svg
                                                viewBox='0 0 640 140'
                                                preserveAspectRatio='none'
                                                className='rm-analysis__spark'
                                            >
                                                <path
                                                    d={intelligence.sparkPath}
                                                    fill='none'
                                                    stroke='#0066ff'
                                                    strokeWidth='2.4'
                                                />
                                            </svg>
                                            <div className='rm-analysis__split-bars'>
                                                <div className='rm-analysis__split-labels'>
                                                    <span>
                                                        {intelligence.primaryLabel}: {intelligence.primaryPct.toFixed(1)}%
                                                    </span>
                                                    <span>
                                                        {intelligence.secondaryLabel}:{' '}
                                                        {intelligence.secondaryPct.toFixed(1)}%
                                                    </span>
                                                </div>
                                                <div className='rm-analysis__split-track'>
                                                    <div style={{ width: `${intelligence.primaryPct}%` }} />
                                                </div>
                                            </div>
                                        </section>

                                        <section className='rm-analysis__card rm-analysis__card--signal'>
                                            <div className='rm-analysis__card-head'>
                                                <strong>3-Model AI Signal Consensus</strong>
                                                <span className='rm-analysis__conf'>
                                                    {intelligence.confidence}% Confidence
                                                </span>
                                            </div>
                                            <div className='rm-analysis__verdict'>
                                                <small>RECOMMENDED SIGNAL</small>
                                                <h3>{intelligence.bestLabel}</h3>
                                                <span>Current Streak: {intelligence.streak} consecutive ticks</span>
                                            </div>
                                            <div className='rm-analysis__models'>
                                                <div>
                                                    <span>Frequency Model</span>
                                                    <strong>{intelligence.primaryPct.toFixed(1)}%</strong>
                                                </div>
                                                <div>
                                                    <span>30t Momentum</span>
                                                    <strong>{intelligence.shortPrimaryPct.toFixed(1)}%</strong>
                                                </div>
                                                <div>
                                                    <span>Markov Transition</span>
                                                    <strong>{intelligence.markovPrimaryPct.toFixed(1)}%</strong>
                                                </div>
                                            </div>
                                            <div className='rm-analysis__actions'>
                                                <button
                                                    type='button'
                                                    className='btn-primary'
                                                    disabled={busy}
                                                    onClick={() => void handleInstantTrade()}
                                                >
                                                    {busy ? 'Executing…' : `⚡ Trade ${intelligence.bestLabel}`}
                                                </button>
                                                <button
                                                    type='button'
                                                    className='btn-emerald'
                                                    onClick={() => void handleLoadIntoBuilder(false)}
                                                >
                                                    Load Bot in Builder
                                                </button>
                                                <button
                                                    type='button'
                                                    className='btn-ghost'
                                                    onClick={() => {
                                                        window.dispatchEvent(
                                                            new CustomEvent('tp-dtrader-prefill', {
                                                                detail: {
                                                                    symbol,
                                                                    contractType: intelligence.bestContract,
                                                                    barrier,
                                                                },
                                                            })
                                                        );
                                                        dashboard.setActiveTab(DBOT_TABS.DTRADER);
                                                    }}
                                                >
                                                    Open in DTrader
                                                </button>
                                            </div>
                                            {tradeFeedback && (
                                                <div className='rm-analysis__feedback'>{tradeFeedback}</div>
                                            )}
                                        </section>
                                    </div>

                                    <section className='rm-analysis__card'>
                                        <div className='rm-analysis__card-head'>
                                            <strong>Last 30 Pattern Sequence</strong>
                                            <span className='rm-analysis__muted'>Newest at right</span>
                                        </div>
                                        <div className='rm-analysis__tape'>
                                            {intelligence.pattern30.map((item, idx) => (
                                                <span key={idx} className={item.win ? 'is-win' : 'is-loss'}>
                                                    {item.tag}
                                                </span>
                                            ))}
                                        </div>
                                    </section>
                                </>
                            )}
                        </div>

                        <TabExecutionRecordPanel
                            namespace='analysis'
                            title='ANALYSIS RECORD'
                            previewTitle='Analysis Transactions (Preview)'
                            resetLabel='Reset Analysis'
                            emptyHint='Click "Trade" on any AI Consensus signal to stream dedicated Analysis Tool Journal logs and Transactions records here.'
                            variant='analysis'
                            activeTab={recordTab}
                            onActiveTabChange={setRecordTab}
                            isOpen={recordOpen}
                            onToggleOpen={setRecordOpen}
                            currencyFallback={client?.currency || 'USD'}
                        />
                    </div>
                </div>
            )}
        </div>
    );
});

export default AnalysisTool;
