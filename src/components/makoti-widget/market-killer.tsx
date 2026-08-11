import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_SYMBOLS, SYMBOL_LABELS, PIP_SIZES, openMakotiWS, MakotiWS } from './makoti-ws';
import { recordOutcome } from './prediction-engine';
import { sendViaNewSystemWithPromise, onNewSystemMessage } from '@/auth/NewDerivAuth';
import { useStore } from '@/hooks/useStore';

interface SymState {
    ticks: number[];
    prices: number[];
    lastSignal: string;
    wins: number;
    losses: number;
    ready: boolean;
}

interface LogEntry {
    time: string;
    msg: string;
    type: 'win' | 'loss' | 'info' | 'trade' | 'trigger' | 'recovery';
}

interface SymbolDisplay {
    label: string;
    lastSignal: string;
    wins: number;
    losses: number;
    dir: 'up' | 'down' | null;
    dirCount: number;
    stake: number;
    digit: number | null;
}

const MAX_TICKS = 500;
const MIN_TICKS = 15;
const LS_CONFIG_KEY = 'mw_mk_config';
const LS_LOGS_KEY = 'mw_mk_logs';
const TRADE_COOLDOWN_MS = 1500;
const VIRTUAL_RESOLVE_DELAY_MS = 1000;
const BUY_TIMEOUT_MS = 8000;

const DEFAULT_CONFIG = {
    stake: '0.35', martingale: '2', takeProfit: '10', stopLoss: '5',
    vhEnabled: false, vhThreshold: '1', maxDir: '3',
};

function loadConfig(): typeof DEFAULT_CONFIG {
    try {
        const raw = localStorage.getItem(LS_CONFIG_KEY);
        return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
    } catch { return DEFAULT_CONFIG; }
}

function saveConfig(cfg: typeof DEFAULT_CONFIG) {
    try { localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}

export const MarketKiller: React.FC = () => {
    const { transactions } = useStore();
    const initCfg = loadConfig();

    const [stake, setStake] = useState(initCfg.stake);
    const [martingale, setMartingale] = useState(initCfg.martingale);
    const [takeProfit, setTakeProfit] = useState(initCfg.takeProfit);
    const [stopLoss, setStopLoss] = useState(initCfg.stopLoss);
    const [vhEnabled, setVhEnabled] = useState(initCfg.vhEnabled);
    const [vhThreshold, setVhThreshold] = useState(initCfg.vhThreshold);
    const [maxDir, setMaxDir] = useState(initCfg.maxDir);
    const [running, setRunning] = useState(false);
    const [pnl, setPnl] = useState(0);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [symDisplay, setSymDisplay] = useState<Record<string, SymbolDisplay>>({});

    const wsRef = useRef<MakotiWS | null>(null);
    const runningRef = useRef(false);
    const pnlRef = useRef(0);
    const baseStakeRef = useRef(0.35);
    const mgRef = useRef(2);
    const tpRef = useRef(10);
    const slRef = useRef(5);
    const maxDirRef = useRef(3);
    const symDataRef = useRef<Record<string, SymState>>({});
    const tradeLockRef = useRef(false);
    const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const currentStakeRef = useRef(0.35);
    const contractMapRef = useRef<Map<string, { symbol: string; stake: number; strategyNames: string[] }>>(new Map());
    const vhStateRef = useRef({ enabled: false, threshold: 1, isVirtual: false, lossCount: 0 });
    const virtualRef = useRef<{
        symbol: string; entryPrice: number; direction: 'CALL' | 'PUT';
        stake: number; startTime: number; buyId: string;
        ticksElapsed: number; resolved: boolean;
    } | null>(null);
    const dirRef = useRef<Record<string, { dir: 'up' | 'down' | null; count: number }>>({});
    const recoveryRef = useRef<{ active: boolean; pending: number; stake: number; martingale: number; vhThreshold: number } | null>(null);
    const recoveryPnlRef = useRef(0);

    useEffect(() => {
        saveConfig({ stake, martingale, takeProfit, stopLoss, vhEnabled, vhThreshold, maxDir });
    }, [stake, martingale, takeProfit, stopLoss, vhEnabled, vhThreshold, maxDir]);

    useEffect(() => {
        if (window.DBot?.__recovery_auto_start) {
            window.DBot.__recovery_auto_start = false;
            const t = setTimeout(() => startKiller(), 150);
            return () => clearTimeout(t);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 150));
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
        try { localStorage.removeItem(LS_LOGS_KEY); } catch {}
    }, []);

    const flushSym = useCallback((sym: string) => {
        const sd = symDataRef.current[sym];
        if (!sd) return;
        const d = dirRef.current[sym] || { dir: null, count: 0 };
        const lastPrice = sd.prices[sd.prices.length - 1];
        const pip = PIP_SIZES[sym] || 2;
        const digit = lastPrice != null ? Number(lastPrice.toFixed(pip).slice(-1)) : null;
        setSymDisplay(prev => ({
            ...prev,
            [sym]: {
                label: SYMBOL_LABELS[sym], lastSignal: sd.lastSignal,
                wins: sd.wins, losses: sd.losses, dir: d.dir, dirCount: d.count,
                stake: currentStakeRef.current, digit,
            },
        }));
    }, []);

    const flushAllSyms = useCallback(() => {
        ALL_SYMBOLS.forEach(sym => flushSym(sym));
    }, [flushSym]);

    const stopKiller = useCallback(() => {
        runningRef.current = false;
        tradeLockRef.current = false;
        virtualRef.current = null;
        if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); cooldownTimerRef.current = null; }
        setRunning(false);
        try { wsRef.current?.close(); } catch {}
        wsRef.current = null;
        addLog('Market Killer stopped.', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addLog]);

    const checkLimits = useCallback(() => {
        if (pnlRef.current >= tpRef.current) {
            addLog(`✅ Take Profit +$${tpRef.current} reached! P&L: $${pnlRef.current.toFixed(2)}`, 'win');
            stopKiller(); return true;
        }
        if (pnlRef.current <= -slRef.current) {
            addLog(`🛑 Stop Loss -$${slRef.current} hit! P&L: $${pnlRef.current.toFixed(2)}`, 'loss');
            stopKiller(); return true;
        }
        return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addLog]);

    const updateDir = useCallback((sym: string, prices: number[]) => {
        if (prices.length < 2) return;
        const last = prices[prices.length - 1];
        const prev = prices[prices.length - 2];
        const cur = dirRef.current[sym] || { dir: null, count: 0 };
        if (last > prev) {
            if (cur.dir === 'up') cur.count++; else { cur.dir = 'up'; cur.count = 1; }
        } else if (last < prev) {
            if (cur.dir === 'down') cur.count++; else { cur.dir = 'down'; cur.count = 1; }
        } else { cur.count = 0; cur.dir = null; }
        dirRef.current[sym] = cur;
    }, []);

    const startVirtualTrade = useCallback((sym: string, direction: 'CALL' | 'PUT', stakeAmt: number) => {
        const buyId = `vt_${sym}_${Date.now()}`;
        const sd = symDataRef.current[sym];
        const entryPrice = sd ? sd.prices[sd.prices.length - 1] : 0;
        virtualRef.current = {
            symbol: sym, entryPrice, direction, stake: stakeAmt,
            startTime: Math.floor(Date.now() / 1000), buyId,
            ticksElapsed: 0, resolved: false,
        };
        const label = direction === 'CALL' ? 'RISE' : 'FALL';
        addLog(`🤖 VIRTUAL ${label} ${SYMBOL_LABELS[sym]} @ $${stakeAmt.toFixed(2)} — tracking`, 'trade');
        try {
            transactions.onBotContractEvent({
                transaction_ids: { buy: buyId }, contract_id: buyId, buy_price: stakeAmt,
                currency: 'USD', contract_type: direction, underlying: sym,
                display_name: SYMBOL_LABELS[sym], date_start: Math.floor(Date.now() / 1000),
                entry_tick_time: Math.floor(Date.now() / 1000), tick_count: 1, status: 'open', is_virtual: true,
            } as any);
        } catch {}
    }, [addLog, transactions]);

    const resolveVirtualTrade = useCallback((sym: string, exitPrice: number) => {
        const vt = virtualRef.current;
        if (!vt || vt.symbol !== sym) return;
        const won = vt.direction === 'CALL' ? exitPrice > vt.entryPrice : exitPrice < vt.entryPrice;
        const label = vt.direction === 'CALL' ? 'RISE' : 'FALL';
        const profit = won ? vt.stake * 0.95 : -vt.stake;
        const sellPrice = won ? vt.stake * 1.95 : 0;
        const pip = PIP_SIZES[vt.symbol] || 2;
        try {
            transactions.onBotContractEvent({
                transaction_ids: { buy: vt.buyId }, contract_id: vt.buyId,
                buy_price: vt.stake, sell_price: sellPrice, currency: 'USD',
                contract_type: vt.direction, underlying: vt.symbol,
                display_name: won ? 'Virtual Win' : 'Virtual Loss',
                date_start: vt.startTime, date_expiry: Math.floor(Date.now() / 1000),
                entry_spot: vt.entryPrice.toFixed(pip), entry_tick: vt.entryPrice.toFixed(pip),
                entry_tick_time: vt.startTime, exit_spot: exitPrice.toFixed(pip),
                exit_tick: exitPrice.toFixed(pip), exit_tick_time: Math.floor(Date.now() / 1000),
                profit, is_sold: true, is_completed: true, status: 'sold', is_virtual: true,
            } as any);
        } catch {}
        pnlRef.current += profit;
        setPnl(pnlRef.current);
        const sd = symDataRef.current[sym];
        if (won) {
            if (sd) sd.wins++;
            vhStateRef.current.lossCount = 0;
            currentStakeRef.current = baseStakeRef.current;
            addLog(`🤖 ✅ VIRTUAL WIN +$${profit.toFixed(2)} on ${SYMBOL_LABELS[sym]} — Entry $${vt.entryPrice.toFixed(4)} → Exit $${exitPrice.toFixed(4)}`, 'win');
            if (vhStateRef.current.enabled && !vhStateRef.current.isVirtual) {
                vhStateRef.current.isVirtual = true;
                vhStateRef.current.lossCount = 0;
                addLog(`🤖 🔄 Real WIN — switching back to VIRTUAL mode`, 'recovery');
            }
        } else {
            if (sd) sd.losses++;
            vhStateRef.current.lossCount++;
            currentStakeRef.current = Number((vt.stake * mgRef.current).toFixed(2));
            addLog(`🤖 ❌ VIRTUAL LOSS -$${Math.abs(profit).toFixed(2)} on ${SYMBOL_LABELS[sym]} #${vhStateRef.current.lossCount}/${vhStateRef.current.threshold} — Entry $${vt.entryPrice.toFixed(4)} → Exit $${exitPrice.toFixed(4)}`, 'loss');
            if (vhStateRef.current.lossCount >= vhStateRef.current.threshold) {
                vhStateRef.current.isVirtual = false;
                addLog(`🤖 🔄 THRESHOLD REACHED (${vhStateRef.current.lossCount} virtual losses) — switching to REAL trades`, 'recovery');
            }
        }
        virtualRef.current = null;
        flushSym(sym);
        tradeLockRef.current = true;
        cooldownTimerRef.current = setTimeout(() => {
            tradeLockRef.current = false;
            cooldownTimerRef.current = null;
            if (runningRef.current) { flushAllSyms(); checkLimits(); }
        }, TRADE_COOLDOWN_MS);
    }, [addLog, transactions, flushSym, flushAllSyms, checkLimits]);

    const executeBuy = useCallback(async (sym: string, direction: 'CALL' | 'PUT'): Promise<boolean> => {
        if (!runningRef.current) return false;
        if (window._newSystemWS?.readyState !== WebSocket.OPEN) {
            addLog(`WebSocket not open — skipping ${SYMBOL_LABELS[sym]}`, 'info');
            return false;
        }
        const tradeStake = Number(currentStakeRef.current.toFixed(2));
        const label = direction === 'CALL' ? 'RISE' : 'FALL';
        addLog(`🎯 ${SYMBOL_LABELS[sym]}: ${label} @ $${tradeStake.toFixed(2)}`, 'trade');
        const params = {
            amount: tradeStake, basis: 'stake', currency: 'USD',
            duration: 1, duration_unit: 't', symbol: sym, contract_type: direction,
        };
        try {
            const response = await Promise.race([
                sendViaNewSystemWithPromise({ buy: 1, price: tradeStake, parameters: params }),
                new Promise<null>((_, reject) => setTimeout(() => reject(new Error('Buy timeout')), BUY_TIMEOUT_MS)),
            ]);
            const contractId = (response as any)?.buy?.contract_id ?? (response as any)?.contract_id;
            if (contractId) {
                contractMapRef.current.set(String(contractId), {
                    symbol: sym, stake: tradeStake, strategyNames: ['tick_direction'],
                });
                addLog(`Contract ${contractId} open on ${SYMBOL_LABELS[sym]}`, 'info');
                try {
                    transactions.onBotContractEvent({
                        contract_id: contractId,
                        transaction_ids: { buy: (response as any)?.buy?.transaction_id },
                        buy_price: tradeStake, currency: 'USD', contract_type: direction,
                        underlying: sym, display_name: SYMBOL_LABELS[sym],
                        date_start: Math.floor(Date.now() / 1000), status: 'open',
                    } as any);
                } catch {}
                const sd = symDataRef.current[sym];
                if (sd) sd.lastSignal = label;
                flushSym(sym);
                return true;
            } else {
                addLog(`Buy ok but no contract_id for ${SYMBOL_LABELS[sym]}`, 'info');
                tradeLockRef.current = false;
                return false;
            }
        } catch (err: any) {
            addLog(`Buy error ${SYMBOL_LABELS[sym]}: ${err?.error?.message || err?.message || 'timeout'}`, 'loss');
            tradeLockRef.current = false;
            return false;
        }
    }, [addLog, transactions, flushSym]);

    const processContractSold = useCallback((contractId: string, profit: number) => {
        const entry = contractMapRef.current.get(contractId);
        if (!entry) return;
        contractMapRef.current.delete(contractId);
        const { symbol: sym, stake: tradeStake, strategyNames } = entry;
        const won = profit >= 0;
        const sd = symDataRef.current[sym];
        strategyNames.forEach(n => recordOutcome(n, won));
        pnlRef.current += profit;
        setPnl(pnlRef.current);
        try {
            transactions.onBotContractEvent({
                contract_id: contractId, buy_price: tradeStake, profit, currency: 'USD',
                underlying: sym, display_name: SYMBOL_LABELS[sym],
                is_sold: true, is_completed: true, status: 'sold',
            } as any);
        } catch {}
        if (won) {
            if (sd) sd.wins++;
            currentStakeRef.current = baseStakeRef.current;
            addLog(`✅ WON +$${profit.toFixed(2)} on ${SYMBOL_LABELS[sym]} — stake reset | P&L $${pnlRef.current.toFixed(2)}`, 'win');
            if (vhStateRef.current.enabled && !vhStateRef.current.isVirtual) {
                vhStateRef.current.isVirtual = true;
                vhStateRef.current.lossCount = 0;
                addLog(`🤖 🔄 Real WIN — switching back to VIRTUAL mode`, 'recovery');
            }
        } else {
            if (sd) sd.losses++;
            const nextStake = Number((tradeStake * mgRef.current).toFixed(2));
            currentStakeRef.current = nextStake;
            addLog(`❌ LOST -$${Math.abs(profit).toFixed(2)} on ${SYMBOL_LABELS[sym]} — next stake $${nextStake.toFixed(2)} | P&L $${pnlRef.current.toFixed(2)}`, 'loss');
        }
        if (recoveryRef.current) {
            recoveryPnlRef.current += profit;
            if (recoveryPnlRef.current >= 0) {
                addLog(`🔄 RECOVERY COMPLETE — returning to Over/Under`, 'win');
                window.DBot.__recovery = null;
                stopKiller();
                if (typeof window.DBot.__switchToTab === 'function') {
                    window.DBot.__ou_auto_start = true;
                    window.DBot.__switchToTab('over_under');
                }
                return;
            }
            addLog(`🔄 Recovery progress: $${recoveryPnlRef.current.toFixed(2)} / $0.00`, 'info');
        }
        flushSym(sym);
        tradeLockRef.current = true;
        cooldownTimerRef.current = setTimeout(() => {
            tradeLockRef.current = false;
            cooldownTimerRef.current = null;
            if (runningRef.current) { flushAllSyms(); checkLimits(); }
        }, TRADE_COOLDOWN_MS);
    }, [addLog, transactions, flushSym, flushAllSyms, stopKiller, checkLimits]);

    const subscribePOC = useCallback(() => {
        if (window._newSystemWS?.readyState === WebSocket.OPEN) {
            window._newSystemWS.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
        }
    }, []);

    useEffect(() => {
        if (!running) return;
        subscribePOC();
        const unsub = onNewSystemMessage((event: MessageEvent) => {
            try {
                const data = JSON.parse(event.data);
                if (data.msg_type !== 'proposal_open_contract') return;
                const c = data.proposal_open_contract;
                if (!c?.is_sold) return;
                const cid = String(c.contract_id);
                if (!contractMapRef.current.has(cid)) return;
                processContractSold(cid, Number(c.profit));
            } catch {}
        });
        return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running, processContractSold, subscribePOC]);

    const onTickRef = useRef(() => {});
    onTickRef.current = () => {
        if (!runningRef.current) return;

        ALL_SYMBOLS.forEach(sym => {
            const sd = symDataRef.current[sym];
            if (!sd || sd.ticks.length < MIN_TICKS) return;
            updateDir(sym, sd.prices);
            flushSym(sym);
        });

        if (virtualRef.current) {
            const vt = virtualRef.current;
            const sd = symDataRef.current[vt.symbol];
            if (sd) {
                vt.ticksElapsed++;
                if (vt.ticksElapsed >= 1 && !vt.resolved) {
                    vt.resolved = true;
                    const capturedPrice = sd.prices[sd.prices.length - 1];
                    setTimeout(() => { resolveVirtualTrade(vt.symbol, capturedPrice); }, VIRTUAL_RESOLVE_DELAY_MS);
                }
            }
            return;
        }

        if (tradeLockRef.current) return;

        ALL_SYMBOLS.forEach(sym => {
            if (tradeLockRef.current) return;
            const sd = symDataRef.current[sym];
            if (!sd || sd.ticks.length < MIN_TICKS) return;
            const d = dirRef.current[sym] || { dir: null, count: 0 };
            if (d.count >= maxDirRef.current && d.dir) {
                const direction = d.dir === 'up' ? 'PUT' : 'CALL';
                const label = direction === 'CALL' ? 'RISE' : 'FALL';
                addLog(`TRIGGER ${SYMBOL_LABELS[sym]}: ${d.dir} ${d.count}x → ${label}`, 'trigger');
                dirRef.current[sym] = { dir: null, count: 0 };
                tradeLockRef.current = true;
                if (vhStateRef.current.enabled && vhStateRef.current.isVirtual) {
                    startVirtualTrade(sym, direction, currentStakeRef.current);
                } else {
                    executeBuy(sym, direction).catch(() => { tradeLockRef.current = false; });
                }
            }
        });
    };

    const startKiller = useCallback(() => {
        const stakeVal = Math.max(0.35, parseFloat(stake) || 0.35);
        const mgVal = Math.max(1, parseFloat(martingale) || 2);
        const tpVal = Math.max(0.5, parseFloat(takeProfit) || 10);
        const slVal = Math.max(0.5, parseFloat(stopLoss) || 5);
        const mdVal = Math.max(2, parseInt(maxDir) || 3);

        baseStakeRef.current = stakeVal;
        mgRef.current = mgVal;
        tpRef.current = tpVal;
        slRef.current = slVal;
        maxDirRef.current = mdVal;
        currentStakeRef.current = stakeVal;
        pnlRef.current = 0;
        tradeLockRef.current = false;
        virtualRef.current = null;
        contractMapRef.current.clear();
        dirRef.current = {};
        recoveryPnlRef.current = 0;
        if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); cooldownTimerRef.current = null; }

        vhStateRef.current = {
            enabled: vhEnabled, threshold: Math.max(1, parseInt(vhThreshold) || 1),
            isVirtual: vhEnabled, lossCount: 0,
        };
        if (vhEnabled) addLog(`🤖 Virtual Hook ON — ${vhStateRef.current.threshold} virtual losses before real trades`, 'recovery');

        const recovery = window.DBot?.__recovery;
        recoveryRef.current = null;
        recoveryPnlRef.current = 0;
        if (recovery?.active) {
            const vhThresh = Math.max(0, recovery.vhThreshold ?? 1);
            baseStakeRef.current = recovery.stake;
            mgRef.current = recovery.martingale;
            currentStakeRef.current = recovery.stake;
            recoveryPnlRef.current = -recovery.pending;
            recoveryRef.current = recovery;
            vhStateRef.current = { enabled: vhThresh > 0, threshold: vhThresh || 1, isVirtual: vhThresh > 0, lossCount: 0 };
            addLog(`🔄 RECOVERY MODE — recover $${recovery.pending.toFixed(2)} | stake $${recovery.stake} x${recovery.martingale}`, 'recovery');
        }

        symDataRef.current = {};
        ALL_SYMBOLS.forEach(sym => {
            symDataRef.current[sym] = { ticks: [], prices: [], lastSignal: '—', wins: 0, losses: 0, ready: false };
        });
        setSymDisplay({});

        runningRef.current = true;
        setRunning(true);
        setPnl(0);
        setLogs([]);
        addLog(`⚔ MARKET KILLER | stake $${stakeVal} MG x${mgVal} TP $${tpVal} SL $${slVal} | dir trigger: ${mdVal}`, 'info');

        if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }

        const handleMsg = (data: any) => {
            if (!runningRef.current) return;
            if (data.error?.msg_type === 'buy') {
                addLog(`Buy error: ${data.error.message}`, 'info');
                tradeLockRef.current = false;
                return;
            }
            if (data.error) return;
            switch (data.msg_type) {
                case 'history': {
                    const sym: string = data.echo_req?.ticks_history;
                    if (!sym || !symDataRef.current[sym]) return;
                    const sd = symDataRef.current[sym];
                    const pip = PIP_SIZES[sym] || 2;
                    const prices = (data.history.prices as (string | number)[]).map(p => Number(p));
                    sd.ticks = prices.map(p => Number(p.toFixed(pip).slice(-1))).slice(-MAX_TICKS);
                    sd.prices = prices.slice(-MAX_TICKS);
                    sd.ready = sd.ticks.length >= MIN_TICKS;
                    addLog(`Loaded ${sd.ticks.length} ticks — ${SYMBOL_LABELS[sym]}`, 'info');
                    break;
                }
                case 'tick': {
                    const tick = data.tick;
                    if (!tick) return;
                    const sym: string = tick.symbol;
                    if (!sym || !symDataRef.current[sym]) return;
                    const sd = symDataRef.current[sym];
                    const pip = PIP_SIZES[sym] || tick.pip_size || 2;
                    const price = Number(tick.quote);
                    const digit = Number(price.toFixed(pip).slice(-1));
                    sd.ticks = [...sd.ticks.slice(-(MAX_TICKS - 1)), digit];
                    sd.prices = [...sd.prices.slice(-(MAX_TICKS - 1)), price];
                    sd.ready = sd.ticks.length >= MIN_TICKS;
                    onTickRef.current();
                    break;
                }
                case 'buy': {
                    if (data.error) {
                        addLog(`Buy error: ${data.error.message}`, 'info');
                        tradeLockRef.current = false;
                        return;
                    }
                    if (!data.buy) { tradeLockRef.current = false; return; }
                    const cid = String(data.buy.contract_id);
                    if (!cid || cid === 'undefined') { tradeLockRef.current = false; return; }
                    const sym: string = data.echo_req?.parameters?.symbol;
                    if (sym) {
                        contractMapRef.current.set(cid, {
                            symbol: sym, stake: currentStakeRef.current, strategyNames: ['tick_direction'],
                        });
                    }
                    break;
                }
            }
        };

        const mws = openMakotiWS(handleMsg, () => {
            addLog('Connected — live tick stream active', 'info');
        }, () => {
            if (runningRef.current) { addLog('Connection lost. Stopping.', 'info'); stopKiller(); }
        });
        wsRef.current = mws;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stake, martingale, takeProfit, stopLoss, vhEnabled, vhThreshold, maxDir, addLog, stopKiller]);

    const totalWins = Object.values(symDisplay).reduce((a, b) => a + b.wins, 0);
    const totalLosses = Object.values(symDisplay).reduce((a, b) => a + b.losses, 0);
    const totalTrades = totalWins + totalLosses;
    const winRate = totalTrades > 0 ? (totalWins / totalTrades * 100).toFixed(1) : '\u2014';
    const isVirtual = vhStateRef.current.enabled && vhStateRef.current.isVirtual;

    return (
        <div className='mw-killer'>
            <div className='mw-killer__fields'>
                <div className='mw-field'>
                    <label className='mw-label'>Stake ($)</label>
                    <input className='mw-input' type='number' min='0.35' step='0.01'
                        value={stake} onChange={e => setStake(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Martingale x</label>
                    <input className='mw-input' type='number' min='1' step='0.1'
                        value={martingale} onChange={e => setMartingale(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Take Profit ($)</label>
                    <input className='mw-input' type='number' min='0.5' step='0.5'
                        value={takeProfit} onChange={e => setTakeProfit(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Stop Loss ($)</label>
                    <input className='mw-input' type='number' min='0.5' step='0.5'
                        value={stopLoss} onChange={e => setStopLoss(e.target.value)} disabled={running} />
                </div>
                <div className='mw-field'>
                    <label className='mw-label'>Max Tick Direction</label>
                    <input className='mw-input' type='number' min='2' max='20' step='1'
                        value={maxDir} onChange={e => setMaxDir(e.target.value)} disabled={running} />
                </div>
            </div>
            <div className='mw-killer__vh'>
                <label className='mw-killer__vh-toggle'>
                    <input type='checkbox' checked={vhEnabled}
                        onChange={e => setVhEnabled(e.target.checked)} disabled={running} />
                    <span>Virtual Hook</span>
                </label>
                {vhEnabled && (
                    <div className='mw-field mw-killer__vh-threshold'>
                        <label className='mw-label'>Loss Threshold:</label>
                        <input className='mw-input' type='number' min='1' step='1'
                            value={vhThreshold} onChange={e => setVhThreshold(e.target.value)} disabled={running} />
                    </div>
                )}
            </div>
            <button className={`mw-btn${running ? ' mw-btn--stop' : ' mw-btn--kill'}`}
                onClick={running ? stopKiller : startKiller}>
                {running ? <><span className='mw-pulse' /> STOP KILLER</> : 'KILL MARKET'}
            </button>
            {running && (
                <div className='mw-killer__mode-note'>
                    Tick Direction \u2014 trade opposite after N consecutive ticks
                    {isVirtual && <span className='mw-da__prog-status--recovery'> VIRTUAL MODE</span>}
                    {!isVirtual && vhStateRef.current.enabled && <span className='mw-win'> REAL MODE</span>}
                </div>
            )}
            {(running || totalTrades > 0) && (
                <div className='mw-killer__stats'>
                    <div className={`mw-killer__pnl${pnl >= 0 ? ' mw-killer__pnl--pos' : ' mw-killer__pnl--neg'}`}>
                        {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                    </div>
                    <div className='mw-killer__meta'>
                        <span>Trades: {totalTrades}</span>
                        <span>W/L: {totalWins}/{totalLosses}</span>
                        <span>Win rate: {winRate}%</span>
                        <span>Stake: ${currentStakeRef.current.toFixed(2)}</span>
                    </div>
                </div>
            )}
            <div className='mw-killer__symbols'>
                <div className='mw-da__progress-title'>Volatility Directions</div>
                {ALL_SYMBOLS.map(sym => {
                    const ss = symDisplay[sym];
                    if (!ss) return (
                        <div key={sym} className='mw-killer__sym-row'>
                            <span className='mw-killer__sym-name'>{SYMBOL_LABELS[sym]}</span>
                            <span className='mw-killer__sym-signal'>\u2014</span>
                        </div>
                    );
                    const baseStake = parseFloat(stake) || 0.35;
                    const isMgActive = ss.stake > baseStake + 0.001;
                    const dirPct = maxDirRef.current > 0 ? Math.min((ss.dirCount / maxDirRef.current) * 100, 100) : 0;
                    return (
                        <div key={sym} className='mw-killer__sym-row'>
                            <span className='mw-killer__sym-name'>{SYMBOL_LABELS[sym]}</span>
                            <span className='mw-killer__sym-digit' title='Last digit'>{ss.digit ?? '\u2014'}</span>
                            <span className='mw-killer__sym-signal' title='Direction'>
                                {ss.dir === 'up' ? '\u2191' : ss.dir === 'down' ? '\u2193' : '\u2014'}{ss.dirCount}
                            </span>
                            <div style={{ width: 60, height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${dirPct}%`, height: '100%', background: dirPct >= 100 ? '#ef4444' : '#f97316', borderRadius: 3, transition: 'width 0.3s' }} />
                            </div>
                            <span className='mw-killer__sym-wl'>
                                <span className='mw-win'>{ss.wins}W</span>
                                <span className='mw-loss'>{ss.losses}L</span>
                            </span>
                            {isMgActive && <span className='mw-killer__sym-stake'>${ss.stake.toFixed(2)}</span>}
                        </div>
                    );
                })}
            </div>
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
