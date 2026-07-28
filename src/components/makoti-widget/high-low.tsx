import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '@/hooks/useStore';
import { SYMBOL_LABELS, PIP_SIZES, openMakotiWS, MakotiWS } from './makoti-ws';
import { sendViaNewSystemWithPromise, onNewSystemMessage } from '@/auth/NewDerivAuth';
import {
    HL_SYMBOLS, DEFAULT_CONFIG, HighLowConfig, MarketScore, TradeRecord, SymbolData,
    runMarketScan, executeHighLowTrade, calcDuration, buildCandles,
    SCAN_INTERVAL_MS, checkSniperEntry,
} from './high-low-engine';

const LS_CONFIG_KEY = 'mw_hl_config';
const SCAN_HISTORY = 5000;
const MAX_TICKS = 5000;
const MIN_TICKS = 70;

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
    const [currentDirection, setCurrentDirection] = useState<'CALL' | 'PUT' | null>(null);
    const [consecutiveLosses, setConsecutiveLosses] = useState(0);
    const [sniperPhase, setSniperPhase] = useState<SniperPhase>('idle');
    const [sniperReason, setSniperReason] = useState('');
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

    cfgRef.current = cfg;

    useEffect(() => { saveConfig(cfg); }, [cfg]);

    const addLog = useCallback((msg: string, type: string = 'info') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 100));
    }, []);

    const clearLogs = useCallback(() => { setLogs([]); }, []);

    const clearAiming = useCallback(() => {
        aimingRef.current = null;
        setSniperPhase('idle');
        setSniperReason('');
    }, []);

    const stopEngine = useCallback(() => {
        runningRef.current = false;
        inTradeRef.current = false;
        globalLock.current = false;
        clearAiming();
        if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null; }
        setRunning(false);
        setScanning(false);
        setInTrade(false);
        setCurrentSymbol('');
        setCurrentConfidence(0);
        setCurrentDirection(null);
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
        setStatus(`Firing ${score.direction === 'CALL' ? 'ONLY UPS' : 'ONLY DOWNS'} on ${SYMBOL_LABELS[score.symbol] || score.symbol}...`);

        const result = await executeHighLowTrade(score.symbol, score.direction, stake, duration);
        if (result.contractId) {
            contractMapRef.current.set(result.contractId, { symbol: score.symbol, stake, duration });
            addLog(`Contract ${result.contractId} — ${score.direction === 'CALL' ? 'ONLY UPS' : 'ONLY DOWNS'} on ${SYMBOL_LABELS[score.symbol] || score.symbol} @ $${stake} x ${duration}t`, 'trade');
            setSniperPhase('in_trade');
            setStatus(`LIVE — ${SYMBOL_LABELS[score.symbol] || score.symbol} ${score.direction === 'CALL' ? 'ONLY UPS' : 'ONLY DOWNS'} $${stake} x ${duration}t`);
            try {
                transactions.onBotContractEvent({
                    contract_id: result.contractId,
                    transaction_ids: { buy: result.contractId },
                    buy_price: stake,
                    currency: 'USD',
                    contract_type: score.direction,
                    underlying: score.symbol,
                    display_name: SYMBOL_LABELS[score.symbol],
                    date_start: Math.floor(Date.now() / 1000),
                    status: 'open',
                } as any);
            } catch (_) {}
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
        const aim = aimingRef.current;
        const sd = sdRef.current[aim.symbol];
        if (!sd || sd.prices.length < 10) return;

        const result = checkSniperEntry(aim.direction!, sd.prices);
        setSniperReason(result.reason);

        if (result.trigger) {
            addLog(`Sniper trigger: ${result.reason}`, 'trade');
            const duration = Math.max(2, Math.min(5, calcDuration(aim.indicators.atr, result.entryPrice)));
            const stake = cfgRef.current.useCompounding && tradesRef.current.length > 0
                ? Number((pnlRef.current * 0.02).toFixed(2)) || cfgRef.current.stake
                : cfgRef.current.stake;
            executeTrade(aim, stake, duration);
        }
    }, [addLog, executeTrade]);

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
            setStatus(`Locked ${SYMBOL_LABELS[selected.symbol] || selected.symbol} ${selected.direction === 'CALL' ? 'ONLY UPS' : 'ONLY DOWNS'} @ ${selected.confidence}%`);
            addLog(`Locked ${SYMBOL_LABELS[selected.symbol] || selected.symbol} ${selected.direction === 'CALL' ? 'ONLY UPS' : 'ONLY DOWNS'} (${selected.confidence}%)`, 'trade');

            aimingRef.current = selected;
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
        const stake = Math.max(0.35, cfg.stake);
        consecutiveLossesRef.current = 0;
        globalLock.current = false;
        inTradeRef.current = false;
        contractMapRef.current = new Map();
        clearAiming();

        sdRef.current = {};
        HL_SYMBOLS.forEach(sym => {
            sdRef.current[sym] = { ticks: [], prices: [], times: [], candles: [], ready: false };
        });

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
        setStatus('Connecting...');
        setConsecutiveLosses(0);

        addLog(`HIGH/LOW — ${HL_SYMBOLS.length} volatilities | stake $${stake} | min ${cfg.minConfidence}%`, 'info');

        if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }

        const mws = openMakotiWS(
            (data) => { tickRef.current(data); },
            () => {
                try {
                    addLog('Connected', 'info');
                    HL_SYMBOLS.forEach(sym => {
                        mws.send({ ticks_history: sym, count: SCAN_HISTORY, end: 'latest', style: 'ticks', subscribe: 1 });
                    });
                    setStatus(`Loading ${HL_SYMBOLS.length} markets...`);
                    const pollReady = () => {
                        if (!runningRef.current) return;
                        for (const s of HL_SYMBOLS) {
                            const sd = sdRef.current[s];
                            if (sd && sd.ready && sd.prices.length >= MIN_TICKS) {
                                firstScanRef.current = true;
                                if (runningRef.current) runScanCycle();
                                return;
                            }
                        }
                        setTimeout(pollReady, 500);
                    };
                    setTimeout(pollReady, 500);
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
                    symbol: entry.symbol, direction: c.contract_type === 'CALL' ? 'CALL' : 'PUT',
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
        <div className='mw-killer'>
            <div className='mw-killer__fields'>
                <div className='mw-field'>
                    <label className='mw-label'>Stake ($)</label>
                    <input className='mw-input' type='number' min='0.35' step='0.01'
                        value={cfg.stake} onChange={e => setCfg(p => ({ ...p, stake: Math.max(0.35, parseFloat(e.target.value) || 0.35) }))} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Min Confidence</label>
                    <input className='mw-input' type='number' min='50' max='100' step='1'
                        value={cfg.minConfidence} onChange={e => setCfg(p => ({ ...p, minConfidence: Math.min(100, Math.max(50, parseInt(e.target.value) || 85)) }))} disabled={running} />
                </div>
            </div>
            <div className='mw-killer__fields'>
                <div className='mw-field'>
                    <label className='mw-label'>Max Losses</label>
                    <input className='mw-input' type='number' min='1' step='1'
                        value={cfg.maxConsecutiveLosses} onChange={e => setCfg(p => ({ ...p, maxConsecutiveLosses: Math.max(1, parseInt(e.target.value) || 3) }))} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Daily Stop ($)</label>
                    <input className='mw-input' type='number' step='1'
                        value={cfg.dailyStopLoss} onChange={e => setCfg(p => ({ ...p, dailyStopLoss: parseFloat(e.target.value) || -25 }))} disabled={running} />
                </div>
            </div>
            <div className='mw-killer__vh'>
                <label className='mw-killer__vh-toggle'>
                    <input type='checkbox' checked={cfg.martingaleEnabled}
                        onChange={e => setCfg(p => ({ ...p, martingaleEnabled: e.target.checked }))} disabled={running} />
                    <span>Martingale <small>(x{cfg.martingale} on loss)</small></span>
                </label>
                <label className='mw-killer__vh-toggle'>
                    <input type='checkbox' checked={cfg.useCompounding}
                        onChange={e => setCfg(p => ({ ...p, useCompounding: e.target.checked }))} disabled={running} />
                    <span>Compounding <small>(2% of P&L)</small></span>
                </label>
            </div>

            <button className={`mw-btn${running ? ' mw-btn--stop' : ' mw-btn--kill'}`}
                onClick={running ? stopEngine : startEngine}>
                {running ? <><span className='mw-pulse' /> STOP</> : 'RUN'}
            </button>

            {running && (
                <div className='mw-killer__signal'>
                    <div className='mw-killer__signal-detail'>{status}</div>
                    {currentSymbol && (
                        <div className='mw-killer__signal-strength'>
                            <span style={{ color: currentConfidence >= cfg.minConfidence ? '#22c55e' : '#f97316' }}>
                                {SYMBOL_LABELS[currentSymbol] || currentSymbol}
                            </span>
                            <span style={{ color: '#facc15', marginLeft: 8 }}>
                                {currentConfidence}%
                            </span>
                            <span style={{
                                display: 'inline-block',
                                marginLeft: 8,
                                padding: '1px 6px',
                                borderRadius: 3,
                                fontSize: 11,
                                fontWeight: 600,
                                background: phaseColor,
                                color: '#000',
                            }}>
                                {phaseLabel}
                            </span>
                            {sniperPhase === 'aiming' && sniperReason && (
                                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                    {sniperReason}
                                </div>
                            )}
                            {inTrade && <span className='mw-killer__active-dot'> LIVE</span>}
                            {consecutiveLosses > 0 && <span style={{ color: '#ef4444', marginLeft: 8 }}>x{consecutiveLosses} losses</span>}
                        </div>
                    )}
                </div>
            )}

            {(running || pnl !== 0) && (
                <div className='mw-killer__stats'>
                    <div className={`mw-killer__pnl${pnl >= 0 ? ' mw-killer__pnl--pos' : ' mw-killer__pnl--neg'}`}>
                        P&L: {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                    </div>
                    <div className='mw-killer__meta'>
                        <span>Trades: {totalTrades}</span>
                        <span>Win Rate: {winRate}%</span>
                        <span>Daily: {dailyPnl >= 0 ? '+' : ''}${dailyPnl.toFixed(2)}</span>
                    </div>
                </div>
            )}

            {trades.length > 0 && (
                <div className='mw-killer__trades'>
                    <div className='mw-killer__log-header'>
                        <span className='mw-killer__log-title'>Trade History</span>
                    </div>
                    <div className='mw-killer__trade-list'>
                        {trades.slice(0, 10).map((t, i) => (
                            <div key={i} className={`mw-log-line mw-log-line--${t.won ? 'win' : 'loss'}`}>
                                <span className='mw-log-time'>{t.time}</span>
                                <span className='mw-log-msg'>
                                    {t.won ? '+' : '-'}{t.direction === 'CALL' ? 'U' : 'D'} {SYMBOL_LABELS[t.symbol] || t.symbol} {t.won ? '+' : ''}${t.profit.toFixed(2)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {logs.length > 0 && (
                <div className='mw-killer__log-wrap'>
                    <div className='mw-killer__log-header'>
                        <span className='mw-killer__log-title'>Activity Log</span>
                        <button className='mw-btn-clear' onClick={clearLogs}>Clear</button>
                    </div>
                    <div className='mw-killer__log'>
                        {logs.map((l, i) => (
                            <div key={i} className={`mw-log-line mw-log-line--${l.type}`}>
                                <span className='mw-log-time'>{l.time}</span>
                                <span className='mw-log-msg'>{l.msg}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default HighLow;