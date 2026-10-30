import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import { SYMBOL_LABELS, PIP_SIZES, openMakotiWS, MakotiWS } from './makoti-ws';
import { sendViaNewSystemWithPromise, onNewSystemMessage } from '@/auth/NewDerivAuth';
import {
    HL_SYMBOLS, DEFAULT_CONFIG, HighLowConfig, MarketScore, TradeRecord, SymbolData,
    runMarketScan, executeHighLowTrade, calcDuration, buildCandles,
    SCAN_INTERVAL_MS, checkSniperEntry, detectFastSignal,
} from './high-low-engine';

const LS_CONFIG_KEY = 'mw_hl_config';
const SCAN_HISTORY = 200;
const MAX_TICKS = 500;
const MIN_TICKS = 30;

type SniperPhase = 'idle' | 'aiming' | 'firing' | 'in_trade';

function loadConfig(): HighLowConfig {
    try { const raw = localStorage.getItem(LS_CONFIG_KEY); return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG; }
    catch { return DEFAULT_CONFIG; }
}
function saveConfig(cfg: HighLowConfig) {
    try { localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}

export const HighLow: React.FC = () => {
    const { transactions } = useStore();
    const initCfg = loadConfig();
    const [cfg, setCfg] = useState<HighLowConfig>(initCfg);
    const [running, setRunning] = useState(false);
    const [scanning, setScanning] = useState(false);
    const [inTrade, setInTrade] = useState(false);
    const [pnl, setPnl] = useState(0);
    const [dailyPnl, setDailyPnl] = useState(0);
    const [trades, setTrades] = useState<TradeRecord[]>([]);
    const [status, setStatus] = useState('');
    const [currentSymbol, setCurrentSymbol] = useState('');
    const [currentConfidence, setCurrentConfidence] = useState(0);
    const [currentDirection, setCurrentDirection] = useState<'RUNHIGH' | 'RUNLOW' | null>(null);
    const [consecutiveLosses, setConsecutiveLosses] = useState(0);
    const [sniperPhase, setSniperPhase] = useState<SniperPhase>('idle');
    const [sniperReason, setSniperReason] = useState('');
    const [currentFlatTickRate, setCurrentFlatTickRate] = useState(0);
    const [currentMomentumStrength, setCurrentMomentumStrength] = useState(0);
    const [currentNoiseLevel, setCurrentNoiseLevel] = useState(0);
    const [logs, setLogs] = useState<{ time: string; msg: string; type: string }[]>([]);

    const wsRef = useRef<MakotiWS | null>(null);
    const sdRef = useRef<Record<string, SymbolData>>({});
    const runningRef = useRef(false);
    const inTradeRef = useRef(false);
    const pnlRef = useRef(0);
    const dailyPnlRef = useRef(0);
    const tradesRef = useRef<TradeRecord[]>([]);
    const cfgRef = useRef(cfg);
    const consecutiveLossesRef = useRef(0);
    const globalLock = useRef(false);
    const contractMapRef = useRef<Map<string, { symbol: string; stake: number; duration: number }>>(new Map());
    const dailyResetRef = useRef(Date.now());
    const aimingRef = useRef<MarketScore | null>(null);
    const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastEntryAttemptRef = useRef(0);
    const aimingStartRef = useRef(0);
    const aimChecksRef = useRef(0);
    const pollReadyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const generationRef = useRef(0);

    cfgRef.current = cfg;

    useEffect(() => { saveConfig(cfg); }, [cfg]);

    const addLog = useCallback((msg: string, type: string = 'info') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 100));
    }, []);

    const clearLogs = useCallback(() => { setLogs([]); }, []);

    const clearAiming = useCallback(() => {
        aimingRef.current = null;
        aimingStartRef.current = 0;
        aimChecksRef.current = 0;
        setSniperPhase('idle');
        setSniperReason('');
    }, []);

    const stopEngine = useCallback(() => {
        runningRef.current = false;
        inTradeRef.current = false;
        globalLock.current = false;
        generationRef.current++;
        clearAiming();
        if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null; }
        if (pollReadyTimerRef.current) { clearTimeout(pollReadyTimerRef.current); pollReadyTimerRef.current = null; }
        setRunning(false);
        setScanning(false);
        setInTrade(false);
        setCurrentSymbol('');
        setCurrentConfidence(0);
        setCurrentDirection(null);
        setCurrentFlatTickRate(0);
        setCurrentMomentumStrength(0);
        setCurrentNoiseLevel(0);
        setSniperPhase('idle');
        setSniperReason('');
        setStatus('Stopped');
        try { wsRef.current?.close(); } catch {}
        wsRef.current = null;
        addLog('HIGH/LOW engine stopped.', 'info');
    }, [addLog, clearAiming]);

    const executeTrade = useCallback(async (score: MarketScore, stake: number, duration: number) => {
        if (!runningRef.current || !score.direction) return;

        inTradeRef.current = true;
        setInTrade(true);
        setSniperPhase('firing');
        setStatus(`Firing ${score.direction === 'RUNHIGH' ? 'ONLY UPS' : 'ONLY DOWNS'} on ${SYMBOL_LABELS[score.symbol] || score.symbol}...`);

        const result = await executeHighLowTrade(score.symbol, score.direction, stake, duration);
        if (result.contractId) {
            contractMapRef.current.set(result.contractId, { symbol: score.symbol, stake, duration });
            addLog(`Contract ${result.contractId} — ${score.direction === 'RUNHIGH' ? 'ONLY UPS' : 'ONLY DOWNS'} on ${SYMBOL_LABELS[score.symbol] || score.symbol} @ $${stake} x ${duration}t`, 'trade');
            setSniperPhase('in_trade');
            setStatus(`LIVE — ${SYMBOL_LABELS[score.symbol] || score.symbol} ${score.direction === 'RUNHIGH' ? 'ONLY UPS' : 'ONLY DOWNS'} $${stake} x ${duration}t`);
        } else {
            addLog('Trade execution failed', 'info');
            inTradeRef.current = false;
            setInTrade(false);
            clearAiming();
            globalLock.current = false;
            scanTimerRef.current = setTimeout(() => { if (runningRef.current) runScanCycle(); }, 500);
        }
    }, [addLog, clearAiming, transactions]);

    const scheduleScan = useCallback(() => {
        if (!runningRef.current || inTradeRef.current) return;
        if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); }
        scanTimerRef.current = setTimeout(() => {
            if (runningRef.current) runScanCycle();
        }, SCAN_INTERVAL_MS);
    }, []);

    const checkEntryOnTick = useCallback(() => {
        if (!runningRef.current || inTradeRef.current || !aimingRef.current) return;
        if (Date.now() - lastEntryAttemptRef.current < 500) return;

        const aim = aimingRef.current;
        const sd = sdRef.current[aim.symbol];
        if (!sd || sd.prices.length < 10) return;

        aimChecksRef.current++;

        if (Date.now() - aimingStartRef.current > 10000 || aimChecksRef.current > 20) {
            addLog(`Aiming timeout on ${SYMBOL_LABELS[aim.symbol] || aim.symbol} — rescanning`, 'info');
            clearAiming();
            scheduleScan();
            return;
        }

        const result = checkSniperEntry(aim.direction!, sd.prices);
        setSniperReason(result.reason);

        if (result.trigger) {
            lastEntryAttemptRef.current = Date.now();
            addLog(`Sniper trigger: ${result.reason}`, 'trade');
            const duration = calcDuration(aim.indicators.atr, result.entryPrice, aim.momentumStrength, 0);
            let stake = cfgRef.current.stake;
            if (cfgRef.current.martingaleEnabled && consecutiveLossesRef.current > 0) {
                stake = Math.min(stake * Math.pow(cfgRef.current.martingale, consecutiveLossesRef.current), 100);
            }
            if (cfgRef.current.useCompounding && tradesRef.current.length > 0 && pnlRef.current > 0) {
                stake = Math.max(0.35, Number((pnlRef.current * 0.02).toFixed(2)));
            }
            executeTrade(aim, Math.max(0.35, stake), duration);
        }
    }, [addLog, executeTrade, clearAiming, scheduleScan]);

    const runScanCycle = useCallback(() => {
        if (!runningRef.current || inTradeRef.current || globalLock.current) return;
        if (aimingRef.current) return;

        globalLock.current = true;
        setScanning(true);
        setStatus('Scanning all volatilities...');

        const { selected } = runMarketScan(sdRef.current, cfgRef.current);

        if (selected) {
            setCurrentSymbol(selected.symbol);
            setCurrentConfidence(selected.confidence);
            setCurrentDirection(selected.direction);
            setCurrentFlatTickRate(selected.flatTickRate);
            setCurrentMomentumStrength(selected.momentumStrength);
            setCurrentNoiseLevel(selected.noiseLevel);
            setStatus(`Locked ${SYMBOL_LABELS[selected.symbol] || selected.symbol} ${selected.direction === 'RUNHIGH' ? 'ONLY UPS' : 'ONLY DOWNS'} @ ${selected.confidence}%`);
            addLog(`Locked ${SYMBOL_LABELS[selected.symbol] || selected.symbol} ${selected.direction === 'RUNHIGH' ? 'ONLY UPS' : 'ONLY DOWNS'} (${selected.confidence}%) | Flat: ${(selected.flatTickRate * 100).toFixed(0)}% | Mom: ${(selected.momentumStrength * 100).toFixed(0)}%`, 'trade');

            aimingRef.current = selected;
            aimingStartRef.current = Date.now();
            aimChecksRef.current = 0;
            setSniperPhase('aiming');
            setSniperReason('Waiting for entry...');
            globalLock.current = false;
            setScanning(false);
            checkEntryOnTick();
        } else {
            setStatus('Scanning...');
            globalLock.current = false;
            setScanning(false);
            scheduleScan();
        }
    }, [addLog, scheduleScan, checkEntryOnTick]);

    const firstScanRef = useRef(false);

    const handleTickMsg = useCallback((data: any) => {
        if (!runningRef.current) return;

        try {
            if (data.msg_type === 'history') {
                const sym: string = data.echo_req?.ticks_history;
                if (!HL_SYMBOLS.includes(sym) || !sdRef.current[sym]) return;
                const sd = sdRef.current[sym];
                const pip = PIP_SIZES[sym] || 2;
                const rawPrices = data.history?.prices;
                if (!Array.isArray(rawPrices)) return;
                const prices = rawPrices.map((p: string | number) => Number(p));
                let times: number[];
                const rawTimes = data.history?.times;
                if (Array.isArray(rawTimes) && rawTimes.length === prices.length) {
                    times = rawTimes.map((t: string | number) => Number(t));
                } else {
                    times = prices.map((_, i) => Math.floor(Date.now() / 1000) - (prices.length - 1 - i));
                }
                const digits = prices.map(p => Number(p.toFixed(pip).slice(-1)));
                sd.ticks = digits.slice(-MAX_TICKS);
                sd.prices = prices.slice(-MAX_TICKS);
                sd.times = times.slice(-MAX_TICKS);
                sd.ready = sd.ticks.length >= MIN_TICKS;
            }

            if (data.msg_type === 'tick') {
                const tick = data.tick;
                if (!tick) return;
                const sym: string = tick.symbol;
                if (!HL_SYMBOLS.includes(sym) || !sdRef.current[sym]) return;
                const sd = sdRef.current[sym];
                const pip = PIP_SIZES[sym] || tick.pip_size || 2;
                const price = Number(tick.quote);
                const epoch = tick.epoch ? Number(tick.epoch) : Math.floor(Date.now() / 1000);
                if (!price) return;
                const digit = Number(price.toFixed(pip).slice(-1));
                sd.ticks = [...sd.ticks.slice(-(MAX_TICKS - 1)), digit];
                sd.prices = [...sd.prices.slice(-(MAX_TICKS - 1)), price];
                sd.times = [...sd.times.slice(-(MAX_TICKS - 1)), epoch];
                sd.ready = sd.ticks.length >= MIN_TICKS;

                /* ── FAST ENTRY: check signal on EVERY tick for ALL symbols ── */
                if (!inTradeRef.current && !aimingRef.current && sd.prices.length >= 15) {
                    const sig = detectFastSignal(sd.prices);
                    if (sig.action !== 'skip' && sig.confidence >= cfgRef.current.minConfidence) {
                        lastEntryAttemptRef.current = Date.now();
                        addLog(`FAST: ${SYMBOL_LABELS[sym] || sym} ${sig.reason}`, 'trade');
                        let stake = cfgRef.current.stake;
                        if (cfgRef.current.martingaleEnabled && consecutiveLossesRef.current > 0) {
                            stake = Math.min(stake * Math.pow(cfgRef.current.martingale, consecutiveLossesRef.current), 100);
                        }
                        if (cfgRef.current.useCompounding && tradesRef.current.length > 0 && pnlRef.current > 0) {
                            stake = Math.max(0.35, Number((pnlRef.current * 0.02).toFixed(2)));
                        }
                        executeTrade({
                            symbol: sym, direction: sig.action, confidence: sig.confidence,
                            reasons: [sig.reason], indicators: {
                                ema9: 0, ema21: 0, ema50: 0, rsi: 50,
                                macd: 0, macdSignal: 0, macdHistogram: 0, adx: 0,
                                bbUpper: 0, bbMiddle: 0, bbLower: 0, atr: 0,
                                support: 0, resistance: 0, consecUp: 0, consecDown: 0,
                                momentumStrength: 0, chopLevel: 0,
                            },
                            trendM1: 'neutral', trendM5: 'neutral', trendM15: 'neutral',
                            flatTickRate: sig.flatTickRate, momentumStrength: sig.confidence / 100, noiseLevel: sig.flatTickRate,
                        }, Math.max(0.35, stake), 2);
                    }
                }

                if (aimingRef.current && !inTradeRef.current) {
                    checkEntryOnTick();
                }
            }
        } catch (e) {
            // ignore parse errors
        }
    }, [checkEntryOnTick]);

    const tickRef = useRef(handleTickMsg);
    tickRef.current = handleTickMsg;

    const pocUnsubRef = useRef<(() => void) | null>(null);

    const scheduleNextScan = useCallback(() => {
        if (!runningRef.current) return;
        clearAiming();
        setStatus('Scanning...');
        if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); }
        scanTimerRef.current = setTimeout(() => {
            if (runningRef.current) runScanCycle();
        }, 500);
    }, [clearAiming]);

    const startEngine = useCallback(() => {
        sessionStorage.removeItem('transaction_cache');
        const stake = Math.max(0.35, cfg.stake);
        consecutiveLossesRef.current = 0;
        globalLock.current = false;
        inTradeRef.current = false;
        contractMapRef.current = new Map();
        generationRef.current++;
        const gen = generationRef.current;
        clearAiming();

        // Don't reset symbol data if already populated from auto-subscription
        const hasData = Object.values(sdRef.current).some(sd => sd.prices.length > 0);
        if (!hasData) {
            sdRef.current = {};
            HL_SYMBOLS.forEach(sym => {
                sdRef.current[sym] = { ticks: [], prices: [], times: [], candles: [], ready: false };
            });
        }

        runningRef.current = true;
        firstScanRef.current = false;
        setRunning(true);
        setScanning(false);
        setInTrade(false);
        setCurrentSymbol('');
        setCurrentConfidence(0);
        setCurrentDirection(null);
        setSniperPhase('idle');
        setSniperReason('');
        setStatus('Connected — using live tick stream');
        setConsecutiveLosses(0);

        addLog(`HIGH/LOW — ${HL_SYMBOLS.length} volatilities | stake $${stake} | min ${cfg.minConfidence}%`, 'info');

        if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
        if (pollReadyTimerRef.current) { clearTimeout(pollReadyTimerRef.current); pollReadyTimerRef.current = null; }

        const mws = openMakotiWS(
            (data) => { tickRef.current(data); },
            () => {
                try {
                    addLog('Live tick stream active — trading immediately', 'info');
                    // Skip ticks_history — live ticks already flowing from auto-subscription
                    // If data already accumulated, start scanning immediately
                    const readyNow = HL_SYMBOLS.some(s => {
                        const sd = sdRef.current[s];
                        return sd && sd.ready && sd.prices.length >= MIN_TICKS;
                    });
                    if (readyNow) {
                        firstScanRef.current = true;
                        runScanCycle();
                    } else {
                        // Poll until live ticks accumulate enough
                        const pollReady = () => {
                            if (!runningRef.current || gen !== generationRef.current) return;
                            for (const s of HL_SYMBOLS) {
                                const sd = sdRef.current[s];
                                if (sd && sd.ready && sd.prices.length >= MIN_TICKS) {
                                    firstScanRef.current = true;
                                    if (runningRef.current) runScanCycle();
                                    return;
                                }
                            }
                            pollReadyTimerRef.current = setTimeout(pollReady, 200);
                        };
                        pollReadyTimerRef.current = setTimeout(pollReady, 200);
                    }
                } catch (e) {
                    addLog(`Connection error: ${e}`, 'info');
                    stopEngine();
                }
            },
            () => {
                if (runningRef.current) { addLog('Connection lost. Stopping.', 'info'); stopEngine(); }
            },
        );
        wsRef.current = mws;
    }, [cfg, addLog, stopEngine, runScanCycle, clearAiming]);

    useEffect(() => {
        if (!running) return;
        if (pocUnsubRef.current) pocUnsubRef.current();
        const unsub = onNewSystemMessage((event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                if (data.msg_type !== 'proposal_open_contract') return;
                const c = data.proposal_open_contract;
                if (!c?.is_sold) return;
                const cid = String(c.contract_id);
                const entry = contractMapRef.current.get(cid);
                if (!entry) return;
                contractMapRef.current.delete(cid);

                const profit = Number(c.profit);
                const won = profit >= 0;
                pnlRef.current += profit;
                dailyPnlRef.current += profit;
                setPnl(pnlRef.current);
                setDailyPnl(dailyPnlRef.current);

                const trade: TradeRecord = {
                    time: new Date().toLocaleTimeString(),
                    symbol: entry.symbol, direction: c.contract_type === 'RUNHIGH' ? 'RUNHIGH' : 'RUNLOW',
                    confidence: 0, stake: entry.stake, duration: entry.duration,
                    entryPrice: Number(c.entry_tick ?? 0), exitPrice: Number(c.exit_tick ?? 0),
                    profit, won, reasons: [],
                };
                tradesRef.current = [trade, ...tradesRef.current].slice(0, 50);
                setTrades(tradesRef.current);

                try {
                    const pocWithDisplay = !(c as any).display_name ? { ...c, display_name: SYMBOL_LABELS[entry.symbol] } : c;
                    transactions.onBotContractEvent(pocWithDisplay);
                } catch (_) {}

                if (won) {
                    consecutiveLossesRef.current = 0;
                    setConsecutiveLosses(0);
                    addLog(`WON +$${profit.toFixed(2)} on ${SYMBOL_LABELS[entry.symbol] || entry.symbol} | P&L $${pnlRef.current.toFixed(2)}`, 'win');
                } else {
                    consecutiveLossesRef.current++;
                    setConsecutiveLosses(consecutiveLossesRef.current);
                    addLog(`LOST -$${Math.abs(profit).toFixed(2)} on ${SYMBOL_LABELS[entry.symbol] || entry.symbol} | P&L $${pnlRef.current.toFixed(2)}`, 'loss');

                    if (consecutiveLossesRef.current >= cfgRef.current.maxConsecutiveLosses) {
                        addLog(`Max consecutive losses (${cfgRef.current.maxConsecutiveLosses}) reached. Stopping.`, 'info');
                        stopEngine();
                        return;
                    }
                    if (dailyPnlRef.current <= cfgRef.current.dailyStopLoss) {
                        addLog(`Daily stop loss ($${cfgRef.current.dailyStopLoss}) reached. Stopping.`, 'info');
                        stopEngine();
                        return;
                    }
                }

                if (dailyPnlRef.current >= cfgRef.current.dailyProfitTarget) {
                    addLog(`Daily profit target ($${cfgRef.current.dailyProfitTarget}) reached. Stopping.`, 'info');
                    stopEngine();
                    return;
                }

                globalLock.current = false;
                inTradeRef.current = false;
                setInTrade(false);
                scheduleNextScan();
            } catch {}
        });
        pocUnsubRef.current = unsub;
        return () => { unsub(); pocUnsubRef.current = null; };
    }, [running, addLog, stopEngine, transactions, scheduleNextScan]);

    useEffect(() => {
        return () => {
            runningRef.current = false;
            try { wsRef.current?.close(); } catch {}
            if (pocUnsubRef.current) { pocUnsubRef.current(); pocUnsubRef.current = null; }
            if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); }
        };
    }, []);

    const totalTrades = trades.length;
    const wins = trades.filter(t => t.won).length;
    const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';

    const phaseColor = sniperPhase === 'aiming' ? '#f59e0b' : sniperPhase === 'firing' ? '#ef4444' : sniperPhase === 'in_trade' ? '#22c55e' : '#6b7280';
    const phaseLabel = sniperPhase === 'idle' ? 'SCANNING' : sniperPhase === 'aiming' ? 'AIMING' : sniperPhase === 'firing' ? 'FIRING' : sniperPhase === 'in_trade' ? 'LIVE' : '';

    return (
        <div className='at-view'>
            {/* 4-Card Session KPI Strip */}
            <section className='at-kpi-grid'>
                <div className='at-kpi-card'>
                    <span className='at-kpi-card__label'>Session P/L:</span>
                    <div
                        className={`at-kpi-card__val at-kpi-card__val--mono ${
                            pnl >= 0 ? 'at-kpi-card__val--pos' : 'at-kpi-card__val--neg'
                        }`}
                    >
                        {pnl >= 0 ? '+' : ''}USD {pnl.toFixed(2)}
                    </div>
                </div>

                <div className='at-kpi-card'>
                    <div className='at-kpi-card__top'>
                        <span className='at-kpi-card__label'>Sniper Signal:</span>
                        {running && (
                            <span className='at-pill-badge at-pill-badge--indigo'>
                                {currentConfidence}% Conf
                            </span>
                        )}
                    </div>
                    <div className='at-kpi-card__sub' style={{ fontWeight: 700, color: 'var(--at-text-primary)' }}>
                        {currentSymbol
                            ? `${SYMBOL_LABELS[currentSymbol] || currentSymbol} • ${phaseLabel || 'READY'}`
                            : 'Scanning 10 Volatilities'}
                    </div>
                </div>

                <div className='at-kpi-card'>
                    <span className='at-kpi-card__label'>Win Rate: {winRate}%</span>
                    <div className='at-kpi-card__sub'>
                        {totalTrades} Trades ({wins}W / {totalTrades - wins}L)
                    </div>
                </div>

                <div className='at-kpi-card'>
                    <div className='at-kpi-card__top'>
                        <span className='at-kpi-card__label'>Daily Net P/L:</span>
                        <span
                            className={`at-status-dot ${
                                inTrade ? 'at-status-dot--live' : running ? 'at-status-dot--warn' : ''
                            }`}
                        />
                    </div>
                    <div
                        className={`at-kpi-card__val at-kpi-card__val--mono ${
                            dailyPnl >= 0 ? 'at-kpi-card__val--pos' : 'at-kpi-card__val--neg'
                        }`}
                    >
                        {dailyPnl >= 0 ? '+' : ''}USD {dailyPnl.toFixed(2)}
                    </div>
                </div>
            </section>

            {/* 2-Column Workspace */}
            <div className='at-split'>
                {/* Left Column: High / Low Sniper Parameters */}
                <div className='at-col'>
                    <section className='at-card'>
                        <div className='at-card__header'>
                            <div>
                                <h2 className='at-card__title'>High / Low Sniper Config</h2>
                                <p className='at-card__subtitle'>
                                    Momentum &amp; micro-structure directional execution
                                </p>
                            </div>
                        </div>

                        <div className='at-param-box'>
                            <div className='at-param-row'>
                                <span className='at-param-row__label'>Stake ($):</span>
                                <div className='at-param-row__control'>
                                    <input
                                        className='mw-input'
                                        type='number'
                                        min='0.35'
                                        step='0.01'
                                        value={cfg.stake}
                                        onChange={e =>
                                            setCfg(p => ({
                                                ...p,
                                                stake: Math.max(0.35, parseFloat(e.target.value) || 0.35),
                                            }))
                                        }
                                        disabled={running}
                                    />
                                </div>
                            </div>

                            <div className='at-param-row'>
                                <span className='at-param-row__label'>Min Confidence (%):</span>
                                <div className='at-param-row__control'>
                                    <input
                                        className='mw-input'
                                        type='number'
                                        min='0'
                                        max='100'
                                        step='1'
                                        value={cfg.minConfidence}
                                        onChange={e =>
                                            setCfg(p => ({
                                                ...p,
                                                minConfidence: Math.min(
                                                    100,
                                                    Math.max(0, parseInt(e.target.value) || 0)
                                                ),
                                            }))
                                        }
                                        disabled={running}
                                    />
                                </div>
                            </div>

                            <div className='at-param-row'>
                                <span className='at-param-row__label'>Max Consecutive Losses:</span>
                                <div className='at-param-row__control'>
                                    <input
                                        className='mw-input'
                                        type='number'
                                        min='1'
                                        step='1'
                                        value={cfg.maxConsecutiveLosses}
                                        onChange={e =>
                                            setCfg(p => ({
                                                ...p,
                                                maxConsecutiveLosses: Math.max(
                                                    1,
                                                    parseInt(e.target.value) || 3
                                                ),
                                            }))
                                        }
                                        disabled={running}
                                    />
                                </div>
                            </div>

                            <div className='at-param-row'>
                                <span className='at-param-row__label'>Daily Stop ($):</span>
                                <div className='at-param-row__control'>
                                    <input
                                        className='mw-input'
                                        type='number'
                                        step='1'
                                        value={cfg.dailyStopLoss}
                                        onChange={e =>
                                            setCfg(p => ({
                                                ...p,
                                                dailyStopLoss: parseFloat(e.target.value) || -25,
                                            }))
                                        }
                                        disabled={running}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className='at-toggle-card'>
                            <label className='at-toggle-row'>
                                <div className='at-toggle-row__info'>
                                    <span className='at-toggle-row__title'>Martingale</span>
                                    <span className='at-toggle-row__sub'>
                                        Multiply stake ×{cfg.martingale} on loss
                                    </span>
                                </div>
                                <span className='at-switch'>
                                    <input
                                        type='checkbox'
                                        checked={cfg.martingaleEnabled}
                                        onChange={e =>
                                            setCfg(p => ({
                                                ...p,
                                                martingaleEnabled: e.target.checked,
                                            }))
                                        }
                                        disabled={running}
                                    />
                                    <span className='at-switch__slider' />
                                </span>
                            </label>
                        </div>

                        <div className='at-toggle-card'>
                            <label className='at-toggle-row'>
                                <div className='at-toggle-row__info'>
                                    <span className='at-toggle-row__title'>Compounding</span>
                                    <span className='at-toggle-row__sub'>
                                        Reinvest 2% of session P/L into stake
                                    </span>
                                </div>
                                <span className='at-switch'>
                                    <input
                                        type='checkbox'
                                        checked={cfg.useCompounding}
                                        onChange={e =>
                                            setCfg(p => ({
                                                ...p,
                                                useCompounding: e.target.checked,
                                            }))
                                        }
                                        disabled={running}
                                    />
                                    <span className='at-switch__slider' />
                                </span>
                            </label>
                        </div>

                        <button
                            type='button'
                            className={`mw-btn${running ? ' mw-btn--stop' : ' mw-btn--kill'}`}
                            onClick={running ? stopEngine : startEngine}
                        >
                            {running ? (
                                <>
                                    <span className='mw-pulse' /> STOP HIGH / LOW
                                </>
                            ) : (
                                'RUN HIGH / LOW'
                            )}
                        </button>
                    </section>
                </div>

                {/* Right Column: Live Sniper Telemetry + Trade History + Activity Log */}
                <div className='at-col'>
                    <section className='at-card'>
                        <div className='at-card__header'>
                            <div>
                                <h2 className='at-card__title'>Live Sniper Telemetry</h2>
                                <p className='at-card__subtitle'>{status || 'Ready to scan momentum'}</p>
                            </div>
                            {phaseLabel && (
                                <span
                                    className='at-pill-badge'
                                    style={{ background: phaseColor, color: '#ffffff' }}
                                >
                                    {phaseLabel}
                                </span>
                            )}
                        </div>

                        <div className='at-digit-chips' style={{ marginTop: 0 }}>
                            <span className='at-digit-chip'>
                                Market:{' '}
                                {currentSymbol
                                    ? SYMBOL_LABELS[currentSymbol] || currentSymbol
                                    : '—'}
                            </span>
                            <span className='at-digit-chip'>
                                Flat Ticks: {(currentFlatTickRate * 100).toFixed(0)}%
                            </span>
                            <span className='at-digit-chip'>
                                Momentum: {(currentMomentumStrength * 100).toFixed(0)}%
                            </span>
                            <span className='at-digit-chip'>
                                Noise: {(currentNoiseLevel * 100).toFixed(0)}%
                            </span>
                            {consecutiveLosses > 0 && (
                                <span className='at-pill-badge at-pill-badge--rose-soft'>
                                    {consecutiveLosses} Consecutive Losses
                                </span>
                            )}
                        </div>

                        {sniperPhase === 'aiming' && sniperReason && (
                            <p
                                style={{
                                    marginTop: '14px',
                                    marginBottom: 0,
                                    fontSize: '13px',
                                    color: 'var(--at-text-muted)',
                                }}
                            >
                                {sniperReason}
                            </p>
                        )}
                    </section>

                    {trades.length > 0 && (
                        <section className='at-card'>
                            <div className='at-log-header'>
                                <h3 className='at-card__title'>Recent Settlements</h3>
                            </div>
                            <div className='at-log-list'>
                                {trades.slice(0, 10).map((t, i) => (
                                    <div
                                        key={i}
                                        className={`mw-log-line mw-log-line--${
                                            t.won ? 'win' : 'loss'
                                        }`}
                                    >
                                        <span className='mw-log-time'>{t.time}</span>
                                        <span className='mw-log-msg'>
                                            {t.direction === 'RUNHIGH' ? '↑ HIGH' : '↓ LOW'} •{' '}
                                            {SYMBOL_LABELS[t.symbol] || t.symbol} •{' '}
                                            {t.won ? '+' : ''}${t.profit.toFixed(2)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    <section className='at-card'>
                        <div className='at-log-header'>
                            <h3 className='at-card__title'>Activity Log</h3>
                            {logs.length > 0 && (
                                <button
                                    type='button'
                                    className='mw-btn-clear'
                                    onClick={clearLogs}
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                        {logs.length === 0 ? (
                            <div className='at-log-empty'>
                                Run High / Low Sniper to stream real-time market evaluations and fills.
                            </div>
                        ) : (
                            <div className='at-log-list'>
                                {logs.map((l, i) => (
                                    <div
                                        key={i}
                                        className={`mw-log-line mw-log-line--${l.type}`}
                                    >
                                        <span className='mw-log-time'>{l.time}</span>
                                        <span className='mw-log-msg'>{l.msg}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

export default HighLow;