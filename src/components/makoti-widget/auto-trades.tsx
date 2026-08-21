import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_SYMBOLS, SYMBOL_LABELS, openMakotiWS, MakotiWS } from './makoti-ws';
import { sendViaNewSystemWithPromise, onNewSystemMessage } from '@/auth/NewDerivAuth';
import { useStore } from '@/hooks/useStore';

interface LogEntry {
    time: string;
    msg: string;
    type: 'win' | 'loss' | 'info' | 'trade' | 'trigger' | 'recovery';
}

const LS_KEY = 'mw_at_config';
const DEFAULT_CFG = {
    stake: '0.35',
    martingale: '2',
    maxTrades: '10',
    autoStart: 'false',
};

function loadCfg() {
    try {
        const r = localStorage.getItem(LS_KEY);
        return r ? { ...DEFAULT_CFG, ...JSON.parse(r) } : DEFAULT_CFG;
    } catch {
        return DEFAULT_CFG;
    }
}

function saveCfg(c: typeof DEFAULT_CFG) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(c));
    } catch {}
}

function ts() {
    return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export const AutoTrades: React.FC = () => {
    const { transactions } = useStore();
    const cfg = loadCfg();
    const [stake, setStake] = useState(cfg.stake);
    const [martingale, setMartingale] = useState(cfg.martingale);
    const [maxTrades, setMaxTrades] = useState(cfg.maxTrades);
    const [autoStart, setAutoStart] = useState(cfg.autoStart === 'true');
    const [running, setRunning] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [pnl, setPnl] = useState(0);
    const [trades, setTrades] = useState(0);
    const [wins, setWins] = useState(0);
    const [losses, setLosses] = useState(0);
    const [conn, setConn] = useState(false);
    const [selectedSymbol, setSelectedSymbol] = useState('R_10');
    const [selectedType, setSelectedType] = useState('CALL');

    const wsRef = useRef<MakotiWS | null>(null);
    const runRef = useRef(false);
    const lockRef = useRef(false);
    const pnlRef = useRef(0);
    const cntRef = useRef(0);
    const winsRef = useRef(0);
    const lossesRef = useRef(0);
    const currentStakeRef = useRef(Number(cfg.stake));
    const cfgRef = useRef({
        s: Number(cfg.stake),
        m: Number(cfg.martingale),
        max: Number(cfg.maxTrades),
    });

    const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
        setLogs(prev => [...prev.slice(-200), { time: ts(), msg, type }]);
    }, []);

    const placeTrade = useCallback(async (symbol: string, type: 'CALL' | 'PUT', stake: number, contractType: string = 'CALLPUT') => {
        if (!wsRef.current || !runRef.current) return;

        try {
            const proposal = await sendViaNewSystemWithPromise('proposal', {
                contract_type: contractType,
                symbol: symbol,
                duration: 5,
                duration_unit: 't',
                amount: stake,
                direction: type,
            });

            const payout = Number(proposal?.payout || 0);
            if (payout <= 0) {
                addLog(`Invalid payout for ${symbol} ${type}`, 'loss');
                return;
            }

            const buyReq: any = {
                contract_type: contractType,
                symbol: symbol,
                duration: 5,
                duration_unit: 't',
                amount: stake,
                direction: type,
            };
            if (contractType === 'DIGITOVER' || contractType === 'DIGITUNDER' || contractType === 'DIGITODD' || contractType === 'DIGITEVEN' || contractType === 'DIGITMATCH' || contractType === 'DIGITDIFF') {
                buyReq.digit = 5;
            }
            if (contractType === 'ONETOUCH' || contractType === 'NOTOUCH') {
                buyReq.barrier = proposal.barrier || '';
            }

            const result = await sendViaNewSystemWithPromise('buy', buyReq);
            const isWin = result?.status === 'won';
            const profit = isWin ? Number(result?.payout || 0) - stake : -stake;

            cntRef.current += 1;
            setTrades(c => c + 1);

            if (isWin) {
                winsRef.current += 1;
                setWins(w => w + 1);
                currentStakeRef.current = Number(cfgRef.current.s);
                addLog(`WIN ${symbol} ${type} +${profit.toFixed(2)}`, 'win');
            } else {
                lossesRef.current += 1;
                setLosses(l => l + 1);
                currentStakeRef.current = Number((currentStakeRef.current * Number(cfgRef.current.m)).toFixed(2));
                addLog(`LOSS ${symbol} ${type} ${profit.toFixed(2)} — next stake: ${currentStakeRef.current.toFixed(2)}`, 'loss');
            }

            pnlRef.current += profit;
            setPnl(pnlRef.current);

            if (cntRef.current >= cfgRef.current.max) {
                addLog(`Max trades reached (${cfgRef.current.max}). Stopping.`, 'info');
                setRunning(false);
                runRef.current = false;
                if (wsRef.current) wsRef.current.close();
                setConn(false);
            }
        } catch (err) {
            addLog(`Trade failed: ${err instanceof Error ? err.message : 'Unknown error'}`, 'loss');
        }
    }, [addLog]);

    const startAutoTrades = useCallback(() => {
        if (running) return;

        const s = Number(stake);
        const m = Number(martingale);
        const max = Number(maxTrades);
        if (isNaN(s) || s <= 0 || isNaN(m) || m <= 1 || isNaN(max) || max <= 0) {
            addLog('Invalid configuration. Check stake, martingale, and max trades.', 'loss');
            return;
        }

        cfgRef.current = { s, m, max };
        currentStakeRef.current = s;
        pnlRef.current = 0;
        cntRef.current = 0;
        winsRef.current = 0;
        lossesRef.current = 0;
        setPnl(0);
        setTrades(0);
        setWins(0);
        setLosses(0);
        setLogs([]);

        saveCfg({ stake, martingale, maxTrades, autoStart: String(autoStart) });
        addLog('Starting Auto Trades...', 'info');

        const ws = openMakotiWS();
        wsRef.current = ws;
        runRef.current = true;
        setRunning(true);
        setConn(true);

        ws.onOpen(() => {
            addLog('Connected to Deriv API', 'info');
            if (!runRef.current) return;

            const contractType = selectedType === 'CALL' || selectedType === 'PUT' ? 'CALLPUT' : selectedType;
            const direction = selectedType === 'CALL' || selectedType === 'PUT' ? selectedType : 'CALL';

            const interval = setInterval(() => {
                if (!runRef.current || !wsRef.current) {
                    clearInterval(interval);
                    return;
                }
                addLog(`Placing trade: ${selectedSymbol} ${direction} stake=${currentStakeRef.current.toFixed(2)}`, 'trade');
                placeTrade(selectedSymbol, direction, currentStakeRef.current, contractType);
            }, 3000);

            setTimeout(() => {
                if (runRef.current) {
                    clearInterval(interval);
                    addLog('Auto Trades completed.', 'info');
                    setRunning(false);
                    runRef.current = false;
                    ws.close();
                    setConn(false);
                }
            }, max * 3000 + 1000);
        });

        ws.onError((err) => {
            addLog(`WebSocket error: ${err}`, 'loss');
            setRunning(false);
            runRef.current = false;
            setConn(false);
        });

        ws.onClose(() => {
            addLog('WebSocket closed', 'info');
            setRunning(false);
            runRef.current = false;
            setConn(false);
        });
    }, [stake, martingale, maxTrades, autoStart, selectedSymbol, selectedType, addLog, placeTrade]);

    const stopAutoTrades = useCallback(() => {
        runRef.current = false;
        setRunning(false);
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        setConn(false);
        addLog('Auto Trades stopped by user.', 'info');
    }, [addLog]);

    useEffect(() => {
        return () => {
            runRef.current = false;
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    return (
        <div className='mw-auto-trades'>
            <div className='mw-auto-trades__header'>
                <div className='mw-auto-trades__title'>AUTO TRADES</div>
                <div className={`mw-auto-trades__status ${running ? 'mw-auto-trades__status--active' : ''}`}>
                    {running ? '● RUNNING' : '○ STOPPED'}
                </div>
            </div>

            <div className='mw-auto-trades__grid'>
                <div className='mw-field'>
                    <label className='mw-label'>Symbol</label>
                    <select
                        className='mw-select'
                        value={selectedSymbol}
                        onChange={e => setSelectedSymbol(e.target.value)}
                        disabled={running}
                    >
                        {ALL_SYMBOLS.map(s => (
                            <option key={s} value={s}>{SYMBOL_LABELS[s] || s}</option>
                        ))}
                    </select>
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Type</label>
                    <select
                        className='mw-select'
                        value={selectedType}
                        onChange={e => setSelectedType(e.target.value)}
                        disabled={running}
                    >
                        <option value='CALL'>CALL</option>
                        <option value='PUT'>PUT</option>
                        <option value='DIGITOVER'>DIGIT OVER</option>
                        <option value='DIGITUNDER'>DIGIT UNDER</option>
                        <option value='DIGITODD'>DIGIT ODD</option>
                        <option value='DIGITEVEN'>DIGIT EVEN</option>
                        <option value='DIGITMATCH'>DIGIT MATCH</option>
                        <option value='DIGITDIFF'>DIGIT DIFFERS</option>
                    </select>
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Stake</label>
                    <input
                        type='number'
                        className='mw-input'
                        value={stake}
                        onChange={e => setStake(e.target.value)}
                        disabled={running}
                        min='0.35'
                        step='0.01'
                    />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Martingale</label>
                    <input
                        type='number'
                        className='mw-input'
                        value={martingale}
                        onChange={e => setMartingale(e.target.value)}
                        disabled={running}
                        min='1'
                        step='0.1'
                    />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Max Trades</label>
                    <input
                        type='number'
                        className='mw-input'
                        value={maxTrades}
                        onChange={e => setMaxTrades(e.target.value)}
                        disabled={running}
                        min='1'
                        max='100'
                    />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Auto Start</label>
                    <div className='mw-toggle' onClick={() => !running && setAutoStart(v => !v)}>
                        <div className={`mw-toggle__track${autoStart ? ' mw-toggle__track--on' : ''}`}>
                            <div className={`mw-toggle__thumb${autoStart ? ' mw-toggle__thumb--on' : ''}`} />
                        </div>
                    </div>
                </div>
            </div>

            <div className='mw-auto-trades__actions'>
                {!running ? (
                    <button className='mw-btn mw-btn--primary' onClick={startAutoTrades}>
                        Start Auto Trades
                    </button>
                ) : (
                    <button className='mw-btn mw-btn--danger' onClick={stopAutoTrades}>
                        Stop Auto Trades
                    </button>
                )}
            </div>

            <div className='mw-auto-trades__stats'>
                <div className='mw-stat'>
                    <span className='mw-stat__label'>P/L</span>
                    <span className={`mw-stat__value ${pnl >= 0 ? 'mw-stat__value--profit' : 'mw-stat__value--loss'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                    </span>
                </div>
                <div className='mw-stat'>
                    <span className='mw-stat__label'>Trades</span>
                    <span className='mw-stat__value'>{trades}</span>
                </div>
                <div className='mw-stat'>
                    <span className='mw-stat__label'>Wins</span>
                    <span className='mw-stat__value mw-stat__value--profit'>{wins}</span>
                </div>
                <div className='mw-stat'>
                    <span className='mw-stat__label'>Losses</span>
                    <span className='mw-stat__value mw-stat__value--loss'>{losses}</span>
                </div>
                <div className='mw-stat'>
                    <span className='mw-stat__label'>Win Rate</span>
                    <span className='mw-stat__value'>{trades > 0 ? ((wins / trades) * 100).toFixed(1) : '0.0'}%</span>
                </div>
            </div>

            <div className='mw-auto-trades__logs'>
                <div className='mw-auto-trades__logs-header'>Trade Log</div>
                <div className='mw-auto-trades__logs-body'>
                    {logs.length === 0 ? (
                        <div className='mw-auto-trades__logs-empty'>No trades yet. Configure and start auto trading.</div>
                    ) : (
                        logs.map((log, i) => (
                            <div key={i} className={`mw-auto-trades__log mw-auto-trades__log--${log.type}`}>
                                <span className='mw-auto-trades__log-time'>{log.time}</span>
                                <span className='mw-auto-trades__log-msg'>{log.msg}</span>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};
