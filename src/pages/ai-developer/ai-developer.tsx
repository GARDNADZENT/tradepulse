import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { derivBus } from '@/lib/deriv/tick-bus';
import {
    AIBotContractKind,
    AIBotEntryFilter,
    compileAIBotToXml,
    loadXmlIntoBotBuilder,
} from '@/utils/ai-bot-xml-builder';
import './ai-developer.scss';

const MARKETS = [
    { symbol: '1HZ10V', label: 'Volatility 10 (1s) Index' },
    { symbol: '1HZ25V', label: 'Volatility 25 (1s) Index' },
    { symbol: '1HZ50V', label: 'Volatility 50 (1s) Index' },
    { symbol: '1HZ75V', label: 'Volatility 75 (1s) Index' },
    { symbol: '1HZ100V', label: 'Volatility 100 (1s) Index' },
    { symbol: 'R_10', label: 'Volatility 10 Index' },
    { symbol: 'R_25', label: 'Volatility 25 Index' },
    { symbol: 'R_50', label: 'Volatility 50 Index' },
    { symbol: 'R_75', label: 'Volatility 75 Index' },
    { symbol: 'R_100', label: 'Volatility 100 Index' },
    { symbol: 'JD10', label: 'Jump 10 Index' },
    { symbol: 'JD50', label: 'Jump 50 Index' },
    { symbol: 'JD100', label: 'Jump 100 Index' },
];

const AI_PRESETS = [
    {
        id: 'ou-vh-pro',
        title: 'Over 2 Virtual Hook Pro',
        desc: 'Starts in Virtual mode, waits for 2 consecutive <=2 virtual losses, then fires Real Over 2 with Recovery Over 4.',
        prompt: 'Build an Over 2 bot on Volatility 10 (1s) with Virtual Hook enabled (2 losses, 1 win), $2 stake, 2.1x martingale, $15 TP, $30 SL',
        config: {
            name: 'AI Over 2 Virtual Hook Pro',
            symbol: '1HZ10V',
            contractType: 'DIGITOVER' as AIBotContractKind,
            barrier: 2,
            recoveryBarrier: 4,
            baseStake: 2,
            martingaleMultiplier: 2.1,
            takeProfit: 15,
            stopLoss: 30,
            virtualHookEnabled: true,
            virtualHookStartMode: 'virtual' as const,
            virtualHookLosses: 2,
            virtualHookWins: 1,
            entryFilter: 'STREAK' as AIBotEntryFilter,
            entryWindow: 2,
            entryThreshold: 58,
        },
    },
    {
        id: 'even-majority',
        title: 'Even Parity 58% Majority Hunter',
        desc: 'Evaluates 50-tick sliding Even parity rate and executes Digit Even only when dominance >= 58%.',
        prompt: 'Create a Digit Even bot on Volatility 50 with 50-tick 58% parity majority filter, $1 stake, 2.1x martingale, $10 TP',
        config: {
            name: 'AI Even Parity Majority',
            symbol: 'R_50',
            contractType: 'DIGITEVEN' as AIBotContractKind,
            barrier: 4,
            recoveryBarrier: 4,
            baseStake: 1,
            martingaleMultiplier: 2.1,
            takeProfit: 10,
            stopLoss: 25,
            virtualHookEnabled: true,
            virtualHookStartMode: 'real' as const,
            virtualHookLosses: 2,
            virtualHookWins: 1,
            entryFilter: 'PARITY_MAJORITY' as AIBotEntryFilter,
            entryWindow: 50,
            entryThreshold: 58,
        },
    },
    {
        id: 'differs-sniper',
        title: 'Coldest Digit Differs Sniper',
        desc: 'Targets the least frequent digit with 1-tick Differs contracts and Virtual Hook loss shield.',
        prompt: 'Build a Digit Differs sniper on Volatility 75 (1s) with Virtual Hook after 1 loss, $2 stake, 11x recovery, $12 TP',
        config: {
            name: 'AI Differs Cold Sniper',
            symbol: '1HZ75V',
            contractType: 'DIGITDIFF' as AIBotContractKind,
            barrier: 7,
            recoveryBarrier: 3,
            baseStake: 2,
            martingaleMultiplier: 11,
            takeProfit: 12,
            stopLoss: 35,
            virtualHookEnabled: true,
            virtualHookStartMode: 'virtual' as const,
            virtualHookLosses: 1,
            virtualHookWins: 1,
            entryFilter: 'INSTANT' as AIBotEntryFilter,
            entryWindow: 2,
            entryThreshold: 58,
        },
    },
    {
        id: 'under7-shield',
        title: 'Under 7 Safe Recovery Bot',
        desc: 'High win-rate Under 7 entries switching to Under 5 on recovery with Virtual Hook protection.',
        prompt: 'Build an Under 7 bot on Volatility 25 (1s) with recovery Under 5, $2.5 stake, 2.2x martingale, $15 TP',
        config: {
            name: 'AI Under 7 Shield',
            symbol: '1HZ25V',
            contractType: 'DIGITUNDER' as AIBotContractKind,
            barrier: 7,
            recoveryBarrier: 5,
            baseStake: 2.5,
            martingaleMultiplier: 2.2,
            takeProfit: 15,
            stopLoss: 35,
            virtualHookEnabled: true,
            virtualHookStartMode: 'real' as const,
            virtualHookLosses: 2,
            virtualHookWins: 1,
            entryFilter: 'OVER_UNDER_MAJORITY' as AIBotEntryFilter,
            entryWindow: 40,
            entryThreshold: 62,
        },
    },
];

const AIDeveloper = observer(() => {
    const { dashboard, load_modal, run_panel } = useStore();

    const [prompt, setPrompt] = useState(AI_PRESETS[0].prompt);
    const [botName, setBotName] = useState(AI_PRESETS[0].config.name);
    const [symbol, setSymbol] = useState(AI_PRESETS[0].config.symbol);
    const [contractType, setContractType] = useState<AIBotContractKind>(AI_PRESETS[0].config.contractType);
    const [barrier, setBarrier] = useState(AI_PRESETS[0].config.barrier);
    const [recoveryBarrier, setRecoveryBarrier] = useState(AI_PRESETS[0].config.recoveryBarrier);
    const [durationTicks, setDurationTicks] = useState(1);
    const [baseStake, setBaseStake] = useState(AI_PRESETS[0].config.baseStake);
    const [martingale, setMartingale] = useState(AI_PRESETS[0].config.martingaleMultiplier);
    const [takeProfit, setTakeProfit] = useState(AI_PRESETS[0].config.takeProfit);
    const [stopLoss, setStopLoss] = useState(AI_PRESETS[0].config.stopLoss);
    const [vhEnabled, setVhEnabled] = useState(true);
    const [vhStartMode, setVhStartMode] = useState<'virtual' | 'real'>('virtual');
    const [vhLosses, setVhLosses] = useState(2);
    const [vhWins, setVhWins] = useState(1);
    const [entryFilter, setEntryFilter] = useState<AIBotEntryFilter>('STREAK');
    const [entryWindow, setEntryWindow] = useState(2);
    const [entryThreshold, setEntryThreshold] = useState(58);
    const [entryDigit, setEntryDigit] = useState(4);
    const [liveDigits, setLiveDigits] = useState<number[]>([]);
    const [liveQuote, setLiveQuote] = useState('—');
    const [statusNote, setStatusNote] = useState('');
    const [showXmlPreview, setShowXmlPreview] = useState(false);

    useEffect(() => {
        let cancelled = false;
        let lastFlush = 0;
        let pendingQuote = '';
        let pendingDigits: number[] | null = null;
        let flushTimer: number | undefined;

        const extract = (sym: string, list: { t: number; price: number }[]) => {
            if (cancelled || sym !== symbol || !list.length) return;
            const pip = derivBus.getPipSize(symbol);
            setLiveQuote(list[list.length - 1].price.toFixed(pip));
            setLiveDigits(
                list.slice(-200).map(item => {
                    const s = Math.abs(item.price).toFixed(pip);
                    return Number(s.charAt(s.length - 1)) || 0;
                })
            );
        };

        let u1 = () => {};
        let u2 = () => {};
        let rel = () => {};

        const rafId = requestAnimationFrame(() => {
            if (cancelled) return;
            u1 = derivBus.onHistory(extract);
            u2 = derivBus.onTick((sym, tk) => {
                if (cancelled || sym !== symbol) return;
                const pip = derivBus.getPipSize(symbol);
                const s = Math.abs(tk.price).toFixed(pip);
                const d = Number(s.charAt(s.length - 1)) || 0;
                pendingQuote = tk.price.toFixed(pip);
                const flush = () => {
                    flushTimer = undefined;
                    if (cancelled) return;
                    lastFlush = performance.now();
                    if (pendingQuote) setLiveQuote(pendingQuote);
                    if (pendingDigits) {
                        const batch = pendingDigits;
                        pendingDigits = null;
                        setLiveDigits(prev => [...prev, ...batch].slice(-200));
                    }
                };
                pendingDigits = pendingDigits ? [...pendingDigits, d] : [d];
                const elapsed = performance.now() - lastFlush;
                if (elapsed >= 450) {
                    flush();
                } else if (flushTimer === undefined) {
                    flushTimer = window.setTimeout(flush, 450 - elapsed);
                }
            });
            extract(symbol, derivBus.getTicks(symbol));
            rel = derivBus.subscribe([symbol]);
        });

        return () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
            if (flushTimer !== undefined) window.clearTimeout(flushTimer);
            u1();
            u2();
            rel();
        };
    }, [symbol]);

    const liveRecommendation = useMemo(() => {
        if (liveDigits.length < 25) return null;
        const counts = new Array(10).fill(0);
        let even = 0;
        let over2 = 0;
        let under7 = 0;
        liveDigits.forEach(d => {
            counts[d]++;
            if (d % 2 === 0) even++;
            if (d > 2) over2++;
            if (d < 7) under7++;
        });
        const n = liveDigits.length;
        const coldest = counts.indexOf(Math.min(...counts));
        const evenPct = (even / n) * 100;
        const over2Pct = (over2 / n) * 100;
        const under7Pct = (under7 / n) * 100;

        if (over2Pct >= 74) {
            return {
                label: `Over 2 (${over2Pct.toFixed(1)}% hit rate)`,
                contractType: 'DIGITOVER' as AIBotContractKind,
                barrier: 2,
                recoveryBarrier: 4,
            };
        }
        if (under7Pct >= 74) {
            return {
                label: `Under 7 (${under7Pct.toFixed(1)}% hit rate)`,
                contractType: 'DIGITUNDER' as AIBotContractKind,
                barrier: 7,
                recoveryBarrier: 5,
            };
        }
        if (Math.abs(evenPct - 50) >= 5) {
            return {
                label: evenPct > 50 ? `Even (${evenPct.toFixed(1)}%)` : `Odd (${(100 - evenPct).toFixed(1)}%)`,
                contractType: (evenPct > 50 ? 'DIGITEVEN' : 'DIGITODD') as AIBotContractKind,
                barrier: coldest,
                recoveryBarrier: coldest,
            };
        }
        return {
            label: `Differs ${coldest} (coldest digit ${(counts[coldest] / n * 100).toFixed(1)}%)`,
            contractType: 'DIGITDIFF' as AIBotContractKind,
            barrier: coldest,
            recoveryBarrier: (coldest + 5) % 10,
        };
    }, [liveDigits]);

    const parseNaturalPrompt = () => {
        const text = prompt.toLowerCase();
        if (text.includes('1hz100') || text.includes('100 (1s)')) setSymbol('1HZ100V');
        else if (text.includes('1hz75') || text.includes('75 (1s)')) setSymbol('1HZ75V');
        else if (text.includes('1hz50') || text.includes('50 (1s)')) setSymbol('1HZ50V');
        else if (text.includes('1hz25') || text.includes('25 (1s)')) setSymbol('1HZ25V');
        else if (text.includes('1hz10') || text.includes('10 (1s)')) setSymbol('1HZ10V');
        else if (text.includes('volatility 100') || text.includes('r_100')) setSymbol('R_100');
        else if (text.includes('volatility 75') || text.includes('r_75')) setSymbol('R_75');
        else if (text.includes('volatility 50') || text.includes('r_50')) setSymbol('R_50');
        else if (text.includes('volatility 25') || text.includes('r_25')) setSymbol('R_25');
        else if (text.includes('volatility 10') || text.includes('r_10')) setSymbol('R_10');

        const overMatch = text.match(/over\s*(\d)/);
        const underMatch = text.match(/under\s*(\d)/);
        const diffMatch = text.match(/differ[s]?\s*(\d)?/);
        const matchMatch = text.match(/match(?:es)?\s*(\d)?/);

        if (overMatch) {
            setContractType('DIGITOVER');
            const b = Number(overMatch[1]);
            setBarrier(b);
            setRecoveryBarrier(Math.min(8, b + 2));
        } else if (underMatch) {
            setContractType('DIGITUNDER');
            const b = Number(underMatch[1]);
            setBarrier(b);
            setRecoveryBarrier(Math.max(1, b - 2));
        } else if (diffMatch) {
            setContractType('DIGITDIFF');
            if (diffMatch[1]) setBarrier(Number(diffMatch[1]));
        } else if (matchMatch) {
            setContractType('DIGITMATCH');
            if (matchMatch[1]) setBarrier(Number(matchMatch[1]));
        } else if (text.includes('odd') && !text.includes('even')) {
            setContractType('DIGITODD');
        } else if (text.includes('even')) {
            setContractType('DIGITEVEN');
        } else if (text.includes('fall') && !text.includes('rise')) {
            setContractType('PUT');
        } else if (text.includes('rise')) {
            setContractType('CALL');
        }

        const stakeMatch = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*stake/);
        if (stakeMatch) setBaseStake(Math.max(0.35, Number(stakeMatch[1])));

        const mgMatch = text.match(/(\d+(?:\.\d+)?)x?\s*martingale/);
        if (mgMatch) setMartingale(Math.max(1, Number(mgMatch[1])));

        const tpMatch = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:tp|take profit)/);
        if (tpMatch) setTakeProfit(Math.max(0.5, Number(tpMatch[1])));

        const slMatch = text.match(/\$?\s*(\d+(?:\.\d+)?)\s*(?:sl|stop loss)/);
        if (slMatch) setStopLoss(Math.max(1, Number(slMatch[1])));

        if (text.includes('virtual hook') || text.includes('virtual')) {
            setVhEnabled(true);
            setVhStartMode(text.includes('real mode') ? 'real' : 'virtual');
        }
        if (text.includes('majority') || text.includes('parity')) {
            setEntryFilter('PARITY_MAJORITY');
            setEntryWindow(50);
        } else if (text.includes('streak')) {
            setEntryFilter('STREAK');
            setEntryWindow(2);
        }

        setStatusNote('AI prompt parsed and compiled into Deriv Blockly XML blocks.');
    };

    const buildCurrentXml = React.useCallback(
        () =>
            compileAIBotToXml({
                name: botName,
                symbol,
                contractType,
                barrier,
                recoveryBarrier,
                durationTicks,
                baseStake,
                martingaleMultiplier: martingale,
                takeProfit,
                stopLoss,
                virtualHookEnabled: vhEnabled,
                virtualHookStartMode: vhStartMode,
                virtualHookLosses: vhLosses,
                virtualHookWins: vhWins,
                entryFilter,
                entryWindow,
                entryThreshold,
                entryDigit,
            }),
        [
            botName,
            symbol,
            contractType,
            barrier,
            recoveryBarrier,
            durationTicks,
            baseStake,
            martingale,
            takeProfit,
            stopLoss,
            vhEnabled,
            vhStartMode,
            vhLosses,
            vhWins,
            entryFilter,
            entryWindow,
            entryThreshold,
            entryDigit,
        ]
    );

    const previewXml = useMemo(
        () => (showXmlPreview ? buildCurrentXml() : ''),
        [showXmlPreview, buildCurrentXml]
    );

    const handleApplyPreset = (preset: (typeof AI_PRESETS)[number]) => {
        setPrompt(preset.prompt);
        setBotName(preset.config.name);
        setSymbol(preset.config.symbol);
        setContractType(preset.config.contractType);
        setBarrier(preset.config.barrier);
        setRecoveryBarrier(preset.config.recoveryBarrier);
        setBaseStake(preset.config.baseStake);
        setMartingale(preset.config.martingaleMultiplier);
        setTakeProfit(preset.config.takeProfit);
        setStopLoss(preset.config.stopLoss);
        setVhEnabled(preset.config.virtualHookEnabled);
        setVhStartMode(preset.config.virtualHookStartMode);
        setVhLosses(preset.config.virtualHookLosses);
        setVhWins(preset.config.virtualHookWins);
        setEntryFilter(preset.config.entryFilter);
        setEntryWindow(preset.config.entryWindow);
        setEntryThreshold(preset.config.entryThreshold);
        setStatusNote(`Loaded preset "${preset.title}". Ready to deploy to Bot Builder.`);
    };

    const handleDownloadXml = () => {
        const xml = buildCurrentXml();
        const blob = new Blob([xml], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${botName.replace(/[^a-z0-9_-]+/gi, '_')}.xml`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className='ai-dev'>
            <div className='ai-dev__inner'>
                <header className='ai-dev__header'>
                    <div>
                        <span className='ai-dev__kicker'>RISKMANAGERS AI STRATEGY ARCHITECT</span>
                        <h1>AI Developer</h1>
                        <p>
                            Describe your Deriv bot in plain English or tune Virtual Hook &amp; Analysis Logics parameters
                            to compile runnable DBot XML blocks directly into Bot Builder.
                        </p>
                    </div>
                    <div className='ai-dev__live-chip'>
                        <span className='ai-dev__dot' />
                        <span>
                            {symbol} · Quote <strong>{liveQuote}</strong> ({liveDigits.length}t)
                        </span>
                    </div>
                </header>

                <section className='ai-dev__prompt-card'>
                    <div className='ai-dev__prompt-top'>
                        <strong>Natural-Language Bot Prompt</strong>
                        {liveRecommendation && (
                            <button
                                type='button'
                                className='ai-dev__edge-btn'
                                onClick={() => {
                                    setContractType(liveRecommendation.contractType);
                                    setBarrier(liveRecommendation.barrier);
                                    setRecoveryBarrier(liveRecommendation.recoveryBarrier);
                                    setStatusNote(`Applied live ${symbol} edge: ${liveRecommendation.label}`);
                                }}
                            >
                                ⚡ Apply Live {symbol} Edge: {liveRecommendation.label}
                            </button>
                        )}
                    </div>
                    <div className='ai-dev__prompt-row'>
                        <textarea
                            rows={2}
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            placeholder='e.g. Build an Over 2 bot on Volatility 10 (1s) with Virtual Hook (2 losses), $2 stake, 2.1x martingale, $15 TP, $30 SL'
                        />
                        <button type='button' className='ai-dev__compile-btn' onClick={parseNaturalPrompt}>
                            Generate Strategy
                        </button>
                    </div>
                    <div className='ai-dev__presets'>
                        {AI_PRESETS.map(p => (
                            <button
                                key={p.id}
                                type='button'
                                className='ai-dev__preset-pill'
                                onClick={() => handleApplyPreset(p)}
                            >
                                <strong>{p.title}</strong>
                                <span>{p.desc}</span>
                            </button>
                        ))}
                    </div>
                </section>

                <div className='ai-dev__grid'>
                    <section className='ai-dev__card'>
                        <h3>1. Market &amp; Contract Architecture</h3>
                        <label>
                            Strategy Name
                            <input value={botName} onChange={e => setBotName(e.target.value)} />
                        </label>
                        <div className='ai-dev__two'>
                            <label>
                                Synthetic Market
                                <select value={symbol} onChange={e => setSymbol(e.target.value)}>
                                    {MARKETS.map(m => (
                                        <option key={m.symbol} value={m.symbol}>
                                            {m.label} ({m.symbol})
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label>
                                Contract Type
                                <select
                                    value={contractType}
                                    onChange={e => setContractType(e.target.value as AIBotContractKind)}
                                >
                                    <option value='DIGITOVER'>Digit Over</option>
                                    <option value='DIGITUNDER'>Digit Under</option>
                                    <option value='DIGITEVEN'>Digit Even</option>
                                    <option value='DIGITODD'>Digit Odd</option>
                                    <option value='DIGITDIFF'>Digit Differs</option>
                                    <option value='DIGITMATCH'>Digit Matches</option>
                                    <option value='CALL'>Rise (Call)</option>
                                    <option value='PUT'>Fall (Put)</option>
                                </select>
                            </label>
                        </div>

                        {['DIGITOVER', 'DIGITUNDER', 'DIGITDIFF', 'DIGITMATCH'].includes(contractType) && (
                            <div className='ai-dev__two'>
                                <label>
                                    Entry Prediction Digit (0–9)
                                    <input
                                        type='number'
                                        min={0}
                                        max={9}
                                        value={barrier}
                                        onChange={e => setBarrier(Number(e.target.value))}
                                    />
                                </label>
                                <label>
                                    Post-Loss Recovery Digit (0–9)
                                    <input
                                        type='number'
                                        min={0}
                                        max={9}
                                        value={recoveryBarrier}
                                        onChange={e => setRecoveryBarrier(Number(e.target.value))}
                                    />
                                </label>
                            </div>
                        )}

                        <div className='ai-dev__two'>
                            <label>
                                Entry Logic Gate
                                <select
                                    value={entryFilter}
                                    onChange={e => setEntryFilter(e.target.value as AIBotEntryFilter)}
                                >
                                    <option value='INSTANT'>Every Tick (Instant Execution)</option>
                                    <option value='STREAK'>Consecutive Opposite Digit Streak</option>
                                    <option value='PARITY_MAJORITY'>Even/Odd Sliding Majority %</option>
                                    <option value='OVER_UNDER_MAJORITY'>Over/Under Sliding Majority %</option>
                                    <option value='EXACT_DIGIT'>Wait for Specific Last Digit</option>
                                </select>
                            </label>
                            <label>
                                Duration (Ticks)
                                <input
                                    type='number'
                                    min={1}
                                    max={10}
                                    value={durationTicks}
                                    onChange={e => setDurationTicks(Number(e.target.value))}
                                />
                            </label>
                        </div>

                        {entryFilter !== 'INSTANT' && (
                            <div className='ai-dev__two'>
                                {entryFilter === 'EXACT_DIGIT' ? (
                                    <label>
                                        Trigger When Last Digit Equals
                                        <input
                                            type='number'
                                            min={0}
                                            max={9}
                                            value={entryDigit}
                                            onChange={e => setEntryDigit(Number(e.target.value))}
                                        />
                                    </label>
                                ) : (
                                    <label>
                                        {entryFilter === 'STREAK' ? 'Streak Digit Count (N)' : 'Analysis Tick Window'}
                                        <input
                                            type='number'
                                            min={2}
                                            max={500}
                                            value={entryWindow}
                                            onChange={e => setEntryWindow(Number(e.target.value))}
                                        />
                                    </label>
                                )}
                                {(entryFilter === 'PARITY_MAJORITY' || entryFilter === 'OVER_UNDER_MAJORITY') && (
                                    <label>
                                        Minimum Dominance %
                                        <input
                                            type='number'
                                            min={51}
                                            max={95}
                                            value={entryThreshold}
                                            onChange={e => setEntryThreshold(Number(e.target.value))}
                                        />
                                    </label>
                                )}
                            </div>
                        )}
                    </section>

                    <section className='ai-dev__card'>
                        <h3>2. Virtual Hook &amp; Risk Management</h3>
                        <div className='ai-dev__two'>
                            <label>
                                Base Stake (USD)
                                <input
                                    type='number'
                                    min={0.35}
                                    step={0.1}
                                    value={baseStake}
                                    onChange={e => setBaseStake(Number(e.target.value))}
                                />
                            </label>
                            <label>
                                Martingale Multiplier
                                <input
                                    type='number'
                                    min={1}
                                    step={0.1}
                                    value={martingale}
                                    onChange={e => setMartingale(Number(e.target.value))}
                                />
                            </label>
                        </div>
                        <div className='ai-dev__two'>
                            <label>
                                Take Profit ($)
                                <input
                                    type='number'
                                    min={0.5}
                                    step={0.5}
                                    value={takeProfit}
                                    onChange={e => setTakeProfit(Number(e.target.value))}
                                />
                            </label>
                            <label>
                                Stop Loss ($)
                                <input
                                    type='number'
                                    min={1}
                                    step={1}
                                    value={stopLoss}
                                    onChange={e => setStopLoss(Number(e.target.value))}
                                />
                            </label>
                        </div>

                        <div className='ai-dev__vh-box'>
                            <div className='ai-dev__vh-head'>
                                <div>
                                    <strong>Virtual Hook Engine</strong>
                                    <span>Simulates virtual trades in Journal before risking real capital</span>
                                </div>
                                <button
                                    type='button'
                                    className={`ai-dev__toggle${vhEnabled ? ' is-on' : ''}`}
                                    onClick={() => setVhEnabled(v => !v)}
                                >
                                    {vhEnabled ? 'ENABLED' : 'OFF'}
                                </button>
                            </div>
                            {vhEnabled && (
                                <div className='ai-dev__three'>
                                    <label>
                                        Start Mode
                                        <select
                                            value={vhStartMode}
                                            onChange={e => setVhStartMode(e.target.value as 'virtual' | 'real')}
                                        >
                                            <option value='virtual'>Virtual Mode</option>
                                            <option value='real'>Real Mode</option>
                                        </select>
                                    </label>
                                    <label>
                                        Enter Virtual After Losses
                                        <input
                                            type='number'
                                            min={1}
                                            max={10}
                                            value={vhLosses}
                                            onChange={e => setVhLosses(Number(e.target.value))}
                                        />
                                    </label>
                                    <label>
                                        Return to Real After Wins
                                        <input
                                            type='number'
                                            min={1}
                                            max={10}
                                            value={vhWins}
                                            onChange={e => setVhWins(Number(e.target.value))}
                                        />
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className='ai-dev__actions'>
                            <button
                                type='button'
                                className='ai-dev__btn ai-dev__btn--primary'
                                onClick={() =>
                                    void loadXmlIntoBotBuilder({
                                        xml: buildCurrentXml(),
                                        name: botName,
                                        dashboard,
                                        load_modal,
                                        runNow: false,
                                        run_panel,
                                    })
                                }
                            >
                                Load into Bot Builder
                            </button>
                            <button
                                type='button'
                                className='ai-dev__btn ai-dev__btn--emerald'
                                onClick={() =>
                                    void loadXmlIntoBotBuilder({
                                        xml: buildCurrentXml(),
                                        name: botName,
                                        dashboard,
                                        load_modal,
                                        runNow: true,
                                        run_panel,
                                    })
                                }
                            >
                                ▶ Load &amp; Run Now
                            </button>
                            <button type='button' className='ai-dev__btn ai-dev__btn--ghost' onClick={handleDownloadXml}>
                                Download .XML
                            </button>
                            <button
                                type='button'
                                className='ai-dev__btn ai-dev__btn--ghost'
                                onClick={() => setShowXmlPreview(v => !v)}
                            >
                                {showXmlPreview ? 'Hide XML' : 'Inspect XML'}
                            </button>
                        </div>
                        {statusNote && <div className='ai-dev__note'>{statusNote}</div>}
                    </section>
                </div>

                {showXmlPreview && (
                    <section className='ai-dev__xml-card'>
                        <div className='ai-dev__xml-head'>
                            <strong>Compiled Deriv Blockly XML ({previewXml.length} bytes)</strong>
                            <button
                                type='button'
                                onClick={() => {
                                    void navigator.clipboard?.writeText(previewXml);
                                    setStatusNote('Copied Blockly XML to clipboard.');
                                }}
                            >
                                Copy XML
                            </button>
                        </div>
                        <pre>{previewXml}</pre>
                    </section>
                )}
            </div>
        </div>
    );
});

export default AIDeveloper;
