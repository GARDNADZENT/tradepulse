import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_SYMBOLS, SYMBOL_LABELS, openMakotiWS, MakotiWS } from './makoti-ws';
import { sendViaNewSystemWithPromise, onNewSystemMessage } from '@/auth/NewDerivAuth';
import { useStore } from '@/hooks/useStore';

interface LogEntry { time: string; msg: string; type: 'win' | 'loss' | 'info' | 'trade' | 'trigger'; }
interface SymProgress {
    symbol: string;
    ticks: number;
    lastDigit: number | null;
    streakDigit: number | null;
    streakCount: number;
    status: string;
    wins: number;
    losses: number;
}

const DEFAULT_CFG = { stake: '0.35', martingale: '2', maxAppearance: '3' };
const LS_KEY = 'mw_da_config';
const MAX_TICKS = 200;

function loadCfg() { try { const r = localStorage.getItem(LS_KEY); return r ? { ...DEFAULT_CFG, ...JSON.parse(r) } : DEFAULT_CFG; } catch { return DEFAULT_CFG; } }
function saveCfg(c: typeof DEFAULT_CFG) { try { localStorage.setItem(LS_KEY, JSON.stringify(c)); } catch {} }
function ts() { return new Date().toLocaleTimeString('en-US', { hour12: false }); }

export const DiffersAuto: React.FC = () => {
    const { transactions } = useStore();
    const cfg = loadCfg();
    const [stake, setStake] = useState(cfg.stake);
    const [martingale, setMartingale] = useState(cfg.martingale);
    const [maxAppearance, setMaxAppearance] = useState(cfg.maxAppearance);
    const [running, setRunning] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [pnl, setPnl] = useState(0);
    const [trades, setTrades] = useState(0);
    const [wins, setWins] = useState(0);
    const [losses, setLosses] = useState(0);
    const [conn, setConn] = useState(false);
    const [symProg, setSymProg] = useState<Record<string, SymProgress>>({});

    const wsRef = useRef<MakotiWS | null>(null);
    const runRef = useRef(false);
    const lockRef = useRef(false);
    const pnlRef = useRef(0);
    const cntRef = useRef(0);
    const winsRef = useRef(0);
    const lossesRef = useRef(0);
    const currentStakeRef = useRef(0.35);
    const cfgRef = useRef({ s: 0.35, m: 2, max: 3 });
    const bufRef = useRef<Record<string, number[]>>({});
    const streakRef = useRef<Record<string, { digit: number; count: number }>>({});
    const cmapRef = useRef<Map<string, { sym: string; amt: number }>>(new Map());

    useEffect(() => { saveCfg({ stake, martingale, maxAppearance }); }, [stake, martingale, maxAppearance]);
    useEffect(() => { cfgRef.current = { s: parseFloat(stake) || 0.35, m: parseFloat(martingale) || 2, max: parseInt(maxAppearance) || 3 }; }, [stake, martingale, maxAppearance]);

    const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
        setLogs(p => [...p.slice(-200), { time: ts(), msg, type }]);
    }, []);

    const buyDiffers = useCallback(async (sym: string, digit: number, amt: number): Promise<boolean> => {
        if (window._newSystemWS?.readyState !== WebSocket.OPEN) return false;
        try {
            const r = await sendViaNewSystemWithPromise({
                buy: 1, price: amt,
                parameters: {
                    amount: amt, basis: 'stake', currency: 'USD',
                    duration: 1, duration_unit: 't',
                    symbol: sym, contract_type: 'DIGITDIFF',
                    barrier: String(digit),
                },
            });
            const cid = r?.buy?.contract_id ?? r?.contract_id;
            if (cid) {
                cmapRef.current.set(String(cid), { sym, amt });
                addLog(`DIFFER ${SYMBOL_LABELS[sym]}: NOT ${digit} @ $${amt.toFixed(2)} — digit ${digit} appeared ${cfgRef.current.max}x in a row`, 'trade');
                try {
                    transactions.onBotContractEvent({
                        contract_id: cid,
                        transaction_ids: { buy: r?.buy?.transaction_id },
                        buy_price: amt, currency: 'USD',
                        contract_type: 'DIGITDIFF',
                        underlying: sym,
                        display_name: SYMBOL_LABELS[sym],
                        date_start: Math.floor(Date.now() / 1000),
                        status: 'open',
                    } as any);
                } catch {}
                return true;
            }
            return false;
        } catch (e: any) {
            addLog(`BUY ERROR ${SYMBOL_LABELS[sym]}: ${e?.error?.message || e?.message}`, 'loss');
            return false;
        }
    }, [addLog, transactions]);

    const handleResult = useCallback((profit: number, sym: string, amt: number) => {
        pnlRef.current += profit;
        cntRef.current++;
        setPnl(pnlRef.current);
        setTrades(cntRef.current);

        const won = profit >= 0;
        if (won) {
            winsRef.current++;
            setWins(winsRef.current);
            addLog(`WON +$${profit.toFixed(2)} on ${SYMBOL_LABELS[sym]} | Stake reset to $${cfgRef.current.s.toFixed(2)} | P&L: $${pnlRef.current.toFixed(2)}`, 'win');
            currentStakeRef.current = cfgRef.current.s;
            lockRef.current = false;
        } else {
            lossesRef.current++;
            setLosses(lossesRef.current);
            const nextStake = Number((amt * cfgRef.current.m).toFixed(2));
            currentStakeRef.current = nextStake;
            addLog(`LOST -$${Math.abs(profit).toFixed(2)} on ${SYMBOL_LABELS[sym]} | Next stake: $${nextStake.toFixed(2)} | P&L: $${pnlRef.current.toFixed(2)}`, 'loss');
            // Recovery: continue with martingaled stake — lockRef stays true until next trigger
            lockRef.current = false;
        }
    }, [addLog]);

    // POC listener
    useEffect(() => {
        if (!running) return;
        if (window._newSystemWS?.readyState === WebSocket.OPEN) {
            window._newSystemWS.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
        }
        const unsub = onNewSystemMessage((ev: MessageEvent) => {
            try {
                const d = JSON.parse(ev.data);
                if (d.msg_type !== 'proposal_open_contract') return;
                const c = d.proposal_open_contract;
                if (!c?.is_sold) return;
                const e = cmapRef.current.get(String(c.contract_id));
                if (!e) return;
                cmapRef.current.delete(String(c.contract_id));
                handleResult(Number(c.profit), e.sym, e.amt);
            } catch {}
        });
        return () => { unsub(); };
    }, [running, handleResult]);

    // Tick handler — core logic
    useEffect(() => {
        if (!running) return;
        const unsub = onNewSystemMessage((ev: MessageEvent) => {
            if (!runRef.current) return;
            try {
                const d = JSON.parse(ev.data);

                // Handle bulk history response
                if (d.msg_type === 'history' && d.history) {
                    const sym = d.echo_req?.ticks_history;
                    if (!sym) return;
                    const prices = d.history.prices;
                    if (!Array.isArray(prices)) return;
                    if (!bufRef.current[sym]) bufRef.current[sym] = [];
                    prices.forEach((p: any) => {
                        const digit = parseInt(String(p).slice(-1), 10);
                        if (!isNaN(digit)) bufRef.current[sym].push(digit);
                    });
                    if (bufRef.current[sym].length > MAX_TICKS) bufRef.current[sym] = bufRef.current[sym].slice(-MAX_TICKS);

                    // Compute streak from buffer
                    const buf = bufRef.current[sym];
                    let streakDigit = buf.length > 0 ? buf[buf.length - 1] : null;
                    let streakCount = 0;
                    for (let i = buf.length - 1; i >= 0; i--) {
                        if (buf[i] === streakDigit) streakCount++;
                        else break;
                    }
                    streakRef.current[sym] = { digit: streakDigit ?? -1, count: streakCount };
                    setSymProg(p => ({
                        ...p,
                        [sym]: {
                            symbol: sym, ticks: buf.length,
                            lastDigit: streakDigit,
                            streakDigit, streakCount,
                            status: streakCount >= cfgRef.current.max ? 'READY' : 'scanning',
                            wins: p[sym]?.wins || 0, losses: p[sym]?.losses || 0,
                        },
                    }));
                    return;
                }

                // Handle live tick
                if (d.msg_type !== 'tick' || !d.tick) return;
                const sym = d.tick.symbol;
                const q = d.tick.quote;
                if (!sym || q === undefined) return;
                const digit = parseInt(String(q).slice(-1), 10);
                if (isNaN(digit)) return;

                if (!bufRef.current[sym]) bufRef.current[sym] = [];
                bufRef.current[sym].push(digit);
                if (bufRef.current[sym].length > MAX_TICKS) bufRef.current[sym] = bufRef.current[sym].slice(-MAX_TICKS);
                const buf = bufRef.current[sym];

                // Update streak
                const prev = streakRef.current[sym];
                if (prev && prev.digit === digit) {
                    prev.count++;
                } else {
                    streakRef.current[sym] = { digit, count: 1 };
                }
                const streak = streakRef.current[sym];

                setSymProg(p => ({
                    ...p,
                    [sym]: {
                        symbol: sym, ticks: buf.length,
                        lastDigit: digit,
                        streakDigit: streak.digit,
                        streakCount: streak.count,
                        status: streak.count >= cfgRef.current.max ? 'READY' : 'scanning',
                        wins: p[sym]?.wins || 0, losses: p[sym]?.losses || 0,
                    },
                }));

                if (lockRef.current) return;

                // Check if any digit hit max appearance
                if (streak.count >= cfgRef.current.max) {
                    addLog(`TRIGGER ${SYMBOL_LABELS[sym]}: digit ${streak.digit} appeared ${streak.count}x → DIFFER on next tick`, 'trigger');
                    lockRef.current = true;
                    const amt = currentStakeRef.current;
                    buyDiffers(sym, streak.digit, amt);
                    // Reset streak after trade
                    streakRef.current[sym] = { digit, count: 0 };
                }
            } catch {}
        });
        return () => { unsub(); };
    }, [running, addLog, buyDiffers]);

    const subscribeAll = useCallback(() => {
        if (window._newSystemWS?.readyState !== WebSocket.OPEN) return;
        ALL_SYMBOLS.forEach(sym => {
            if (!bufRef.current[sym] || bufRef.current[sym].length === 0) {
                bufRef.current[sym] = [];
            }
            streakRef.current[sym] = { digit: -1, count: 0 };
            setSymProg(p => ({
                ...p,
                [sym]: {
                    symbol: sym, ticks: p[sym]?.ticks || 0,
                    lastDigit: null, streakDigit: null, streakCount: 0,
                    status: 'scanning', wins: 0, losses: 0,
                },
            }));
            window._newSystemWS.send(JSON.stringify({ ticks_history: sym, style: 'ticks', count: 50, end: 'latest', subscribe: 1 }));
        });
        addLog(`Subscribed to ${ALL_SYMBOLS.length} volatilities — loading 50 ticks each`, 'info');
    }, [addLog]);

    const unsubscribeAll = useCallback(() => {
        if (window._newSystemWS?.readyState !== WebSocket.OPEN) return;
        ALL_SYMBOLS.forEach(sym => window._newSystemWS.send(JSON.stringify({ forget: sym })));
    }, []);

    const start = useCallback(() => {
        if (running) return;
        runRef.current = true;
        setRunning(true);
        lockRef.current = false;
        cmapRef.current.clear();
        bufRef.current = {};
        streakRef.current = {};
        pnlRef.current = 0;
        cntRef.current = 0;
        winsRef.current = 0;
        lossesRef.current = 0;
        currentStakeRef.current = cfgRef.current.s;
        setPnl(0);
        setTrades(0);
        setWins(0);
        setLosses(0);
        setLogs([]);

        addLog(`DIFFERS AUTO START | Stake: $${cfgRef.current.s} | MG: ${cfgRef.current.m}x | Max Appearance: ${cfgRef.current.max}`, 'info');
        addLog('Strategy: Wait for digit to appear N times → DIFFER on next tick', 'info');

        if (!wsRef.current) {
            wsRef.current = openMakotiWS(() => {}, () => { setConn(true); addLog('Connected to WebSocket', 'info'); subscribeAll(); }, () => { setConn(false); }, { skipAuth: true });
        } else {
            subscribeAll();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running, addLog]);

    const stop = useCallback(() => {
        runRef.current = false;
        setRunning(false);
        lockRef.current = false;
        unsubscribeAll();
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
        addLog('STOPPED', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addLog]);

    useEffect(() => { return () => { runRef.current = false; unsubscribeAll(); if (wsRef.current) { wsRef.current.close(); wsRef.current = null; } }; }, [unsubscribeAll]);

    return (
        <div className='mw-da'>
            <div className='mw-da__controls'>
                <div className='mw-field'>
                    <label className='mw-label'>Stake ($)</label>
                    <input className='mw-input' type='number' step='0.01' min='0' value={stake} onChange={e => setStake(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Martingale (x)</label>
                    <input className='mw-input' type='number' step='0.1' min='1' value={martingale} onChange={e => setMartingale(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Max Appearance</label>
                    <input className='mw-input' type='number' step='1' min='2' max='20' value={maxAppearance} onChange={e => setMaxAppearance(e.target.value)} disabled={running} />
                </div>
            </div>

            <button className={`mw-btn ${running ? 'mw-btn--stop' : 'mw-btn--kill'}`} onClick={running ? stop : start}>
                {running ? 'STOP' : 'RUN DIFFERS AUTO'}
            </button>

            {running && (
                <div className='mw-da__mode'>
                    Monitoring all volatilities — differ when digit repeats {cfgRef.current.max}x
                    {lockRef.current && <span className='mw-da__active-dot'> ● TRADING</span>}
                </div>
            )}

            <div className='mw-da__stats'>
                <span>P&L: <b className={pnl >= 0 ? 'mw-win' : 'mw-loss'}>${pnl.toFixed(2)}</b></span>
                <span>Trades: {trades}</span>
                <span className='mw-win'>W: {wins}</span>
                <span className='mw-loss'>L: {losses}</span>
                <span>Stake: ${currentStakeRef.current.toFixed(2)}</span>
                <span className={conn ? 'mw-win' : 'mw-loss'}>{conn ? 'Connected' : 'Disconnected'}</span>
            </div>

            <div className='mw-da__progress'>
                <div className='mw-da__progress-title'>Volatility Streaks</div>
                {ALL_SYMBOLS.map(sym => {
                    const p = symProg[sym];
                    const streakPct = p ? Math.min((p.streakCount / cfgRef.current.max) * 100, 100) : 0;
                    const isReady = p?.status === 'READY';
                    return (
                        <div key={sym} className={`mw-da__prog-row ${isReady ? 'mw-da__prog-row--ready' : ''} ${p?.status === 'trading' ? 'mw-da__prog-row--trading' : ''}`}>
                            <span className='mw-da__prog-sym'>{SYMBOL_LABELS[sym]}</span>
                            <div className='mw-da__prog-bar-wrap'>
                                <div className='mw-da__prog-bar' style={{ width: `${streakPct}%`, background: isReady ? '#ef4444' : '#f97316' }} />
                            </div>
                            <span className='mw-da__prog-digit'>{p && p.streakDigit != null ? p.streakDigit : '—'}</span>
                            <span className='mw-da__prog-count'>{p?.streakCount || 0}/{cfgRef.current.max}</span>
                            <span className={`mw-da__prog-status ${isReady ? 'mw-da__prog-status--ready' : ''}`}>{p?.status || 'idle'}</span>
                        </div>
                    );
                })}
            </div>

            <div className='mw-da__logs'>
                {logs.map((l, i) => (
                    <div key={i} className={`mw-log-line mw-log-line--${l.type}`}>
                        <span className='mw-log-time'>{l.time}</span>
                        <span className='mw-log-msg'>{l.msg}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};
