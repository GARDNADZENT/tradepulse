import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_SYMBOLS, SYMBOL_LABELS, PIP_SIZES, openMakotiWS, MakotiWS } from './makoti-ws';
import { sendViaNewSystemWithPromise, onNewSystemMessage } from '@/auth/NewDerivAuth';
import { useStore } from '@/hooks/useStore';

interface LogEntry { time: string; msg: string; type: 'win' | 'loss' | 'info' | 'trade' | 'trigger' | 'recovery'; }
interface SymProgress {
    symbol: string;
    ticks: number;
    lastDigit: number | null;
    streakDigit: number | null;
    streakCount: number;
    status: string;
    wins: number;
    losses: number;
    dirCount: number;
    dirDir: string;
}

type RecoveryPhase = 'idle' | 'virtual' | 'real';

const DEFAULT_CFG = {
    stake: '0.35', martingale: '2', maxAppearance: '3',
    recoveryEnabled: 'false', lossThreshold: '3', maxTickDirection: '3',
};
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
    const [recoveryEnabled, setRecoveryEnabled] = useState(cfg.recoveryEnabled === 'true');
    const [lossThreshold, setLossThreshold] = useState(cfg.lossThreshold);
    const [maxTickDirection, setMaxTickDirection] = useState(cfg.maxTickDirection);
    const [running, setRunning] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [pnl, setPnl] = useState(0);
    const [trades, setTrades] = useState(0);
    const [wins, setWins] = useState(0);
    const [losses, setLosses] = useState(0);
    const [conn, setConn] = useState(false);
    const [symProg, setSymProg] = useState<Record<string, SymProgress>>({});
    const [recoveryDisplay, setRecoveryDisplay] = useState({ phase: 'idle' as RecoveryPhase, loss: 0, virtualLosses: 0, recovered: 0 });

    const wsRef = useRef<MakotiWS | null>(null);
    const runRef = useRef(false);
    const lockRef = useRef(false);
    const pnlRef = useRef(0);
    const cntRef = useRef(0);
    const winsRef = useRef(0);
    const lossesRef = useRef(0);
    const currentStakeRef = useRef(0.35);
    const cfgRef = useRef({ s: 0.35, m: 2, max: 3, recov: false, threshold: 3, maxDir: 3 });
    const bufRef = useRef<Record<string, number[]>>({});
    const priceBufRef = useRef<Record<string, number[]>>({});
    const streakRef = useRef<Record<string, { digit: number; count: number }>>({});
    const cmapRef = useRef<Map<string, { sym: string; amt: number; phase: 'differs' | 'recov_real' }>>(new Map());

    const recoveryPhaseRef = useRef<RecoveryPhase>('idle');
    const recoveryLossRef = useRef(0);
    const virtualLossCountRef = useRef(0);
    const realWinCountRef = useRef(0);
    const recoveryStakeRef = useRef(0.35);
    const recoveryPnlRef = useRef(0);
    const directionRef = useRef<Record<string, { dir: 'up' | 'down' | null; count: number }>>({});

    const virtualTradeRef = useRef<{
        symbol: string;
        entryPrice: number;
        direction: 'CALL' | 'PUT';
        stake: number;
        startTime: number;
        buyId: string;
        ticksElapsed: number;
        resolved: boolean;
    } | null>(null);
    const lastTickSymRef = useRef('');
    const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        saveCfg({ stake, martingale, maxAppearance, recoveryEnabled: String(recoveryEnabled), lossThreshold, maxTickDirection });
    }, [stake, martingale, maxAppearance, recoveryEnabled, lossThreshold, maxTickDirection]);
    useEffect(() => {
        cfgRef.current = {
            s: parseFloat(stake) || 0.35, m: parseFloat(martingale) || 2,
            max: parseInt(maxAppearance) || 3, recov: recoveryEnabled,
            threshold: parseInt(lossThreshold) || 3, maxDir: parseInt(maxTickDirection) || 3,
        };
    }, [stake, martingale, maxAppearance, recoveryEnabled, lossThreshold, maxTickDirection]);

    const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
        setLogs(p => [...p.slice(-200), { time: ts(), msg, type }]);
    }, []);

    /* ── Buy DIGITDIFF ── */
    const buyDiffers = useCallback(async (sym: string, digit: number, amt: number): Promise<boolean> => {
        if (window._newSystemWS?.readyState !== WebSocket.OPEN) return false;
        try {
            const r = await sendViaNewSystemWithPromise({
                buy: 1, price: amt,
                parameters: { amount: amt, basis: 'stake', currency: 'USD', duration: 1, duration_unit: 't', symbol: sym, contract_type: 'DIGITDIFF', barrier: String(digit) },
            });
            const cid = r?.buy?.contract_id ?? r?.contract_id;
            if (cid) {
                cmapRef.current.set(String(cid), { sym, amt, phase: 'differs' });
                addLog(`DIFFER ${SYMBOL_LABELS[sym]}: NOT ${digit} @ $${amt.toFixed(2)}`, 'trade');
                try { transactions.onBotContractEvent({ contract_id: cid, transaction_ids: { buy: r?.buy?.transaction_id }, buy_price: amt, currency: 'USD', contract_type: 'DIGITDIFF', underlying: sym, display_name: SYMBOL_LABELS[sym], date_start: Math.floor(Date.now() / 1000), status: 'open' } as any); } catch {}
                return true;
            }
            return false;
        } catch (e: any) { addLog(`BUY ERROR ${SYMBOL_LABELS[sym]}: ${e?.error?.message || e?.message}`, 'loss'); return false; }
    }, [addLog, transactions]);

    /* ── Buy Rise/Fall REAL ── */
    const buyRiseFallReal = useCallback(async (sym: string, direction: 'CALL' | 'PUT', amt: number): Promise<boolean> => {
        if (window._newSystemWS?.readyState !== WebSocket.OPEN) return false;
        const label = direction === 'CALL' ? 'RISE' : 'FALL';
        addLog(`🔴 REAL BUYING ${label} ${SYMBOL_LABELS[sym]} @ $${amt.toFixed(2)}`, 'trade');
        try {
            const r = await sendViaNewSystemWithPromise({
                buy: 1, price: amt,
                parameters: { amount: amt, basis: 'stake', currency: 'USD', duration: 1, duration_unit: 't', symbol: sym, contract_type: direction },
            });
            const cid = r?.buy?.contract_id ?? r?.contract_id;
            if (cid) {
                cmapRef.current.set(String(cid), { sym, amt, phase: 'recov_real' });
                try { transactions.onBotContractEvent({ contract_id: cid, transaction_ids: { buy: r?.buy?.transaction_id }, buy_price: amt, currency: 'USD', contract_type: direction, underlying: sym, display_name: SYMBOL_LABELS[sym], date_start: Math.floor(Date.now() / 1000), status: 'open' } as any); } catch {}
                return true;
            }
            return false;
        } catch (e: any) { addLog(`RECOVERY BUY ERROR ${SYMBOL_LABELS[sym]}: ${e?.error?.message || e?.message}`, 'loss'); return false; }
    }, [addLog, transactions]);

    /* ── Start virtual trade (simulated, NO API call) ── */
    const startVirtualTrade = useCallback((sym: string, direction: 'CALL' | 'PUT', stake: number) => {
        const buyId = `vt_${sym}_${Date.now()}`;
        virtualTradeRef.current = {
            symbol: sym,
            entryPrice: priceBufRef.current[sym]?.[priceBufRef.current[sym].length - 1] ?? 0,
            direction,
            stake,
            startTime: Math.floor(Date.now() / 1000),
            buyId,
            ticksElapsed: 0,
            resolved: false,
        };
        const label = direction === 'CALL' ? 'RISE' : 'FALL';
        addLog(`🤖 VIRTUAL ${label} ${SYMBOL_LABELS[sym]} @ $${stake.toFixed(2)} — tracking`, 'trade');
        try {
            transactions.onBotContractEvent({
                transaction_ids: { buy: buyId },
                contract_id: buyId,
                buy_price: stake,
                currency: 'USD',
                contract_type: direction,
                underlying: sym,
                display_name: SYMBOL_LABELS[sym],
                date_start: Math.floor(Date.now() / 1000),
                entry_tick_time: Math.floor(Date.now() / 1000),
                tick_count: 1,
                status: 'open',
                is_virtual: true,
            } as any);
        } catch {}
    }, [addLog, transactions]);

    /* ── Resolve virtual trade from tick data ── */
    const resolveVirtualTrade = useCallback((sym: string, currentPrice: number) => {
        const vt = virtualTradeRef.current;
        if (!vt || vt.symbol !== sym) return;

        const won = vt.direction === 'CALL'
            ? currentPrice > vt.entryPrice
            : currentPrice < vt.entryPrice;
        const label = vt.direction === 'CALL' ? 'RISE' : 'FALL';
        const profit = won ? vt.stake * 0.95 : -vt.stake;
        const sellPrice = won ? vt.stake * 1.95 : 0;
        const pip = PIP_SIZES[vt.symbol] || 2;

        try {
            const entrySpotStr = vt.entryPrice.toFixed(pip);
            const exitSpotStr = currentPrice.toFixed(pip);
            const displayName = won ? 'Virtual Win' : 'Virtual Loss';
            transactions.onBotContractEvent({
                transaction_ids: { buy: vt.buyId },
                contract_id: vt.buyId,
                buy_price: vt.stake,
                sell_price: sellPrice,
                currency: 'USD',
                contract_type: vt.direction,
                underlying: vt.symbol,
                display_name: displayName,
                date_start: vt.startTime,
                date_expiry: Math.floor(Date.now() / 1000),
                entry_spot: entrySpotStr,
                entry_tick: entrySpotStr,
                entry_tick_time: vt.startTime,
                exit_spot: exitSpotStr,
                exit_tick: exitSpotStr,
                exit_tick_time: Math.floor(Date.now() / 1000),
                profit: profit,
                is_sold: true,
                is_completed: true,
                status: 'sold',
                is_virtual: true,
            } as any);
        } catch {}

        pnlRef.current += profit;
        cntRef.current++;
        setPnl(pnlRef.current);
        setTrades(cntRef.current);

        if (won) {
            winsRef.current++;
            setWins(winsRef.current);
            virtualLossCountRef.current = 0;
            recoveryPnlRef.current += profit;
            addLog(`🤖 VIRTUAL WIN +$${profit.toFixed(2)} on ${SYMBOL_LABELS[sym]} | Recovery: $${recoveryPnlRef.current.toFixed(2)} / $${recoveryLossRef.current.toFixed(2)} | Virtual losses reset (consecutive)`, 'win');
            setRecoveryDisplay(p => ({ ...p, virtualLosses: 0, recovered: recoveryPnlRef.current }));
        } else {
            lossesRef.current++;
            setLosses(lossesRef.current);
            virtualLossCountRef.current++;
            recoveryPnlRef.current += profit;
            addLog(`🤖 VIRTUAL LOSS -$${Math.abs(profit).toFixed(2)} on ${SYMBOL_LABELS[sym]} | Virtual losses: ${virtualLossCountRef.current}/${cfgRef.current.threshold}`, 'loss');
            setRecoveryDisplay(p => ({ ...p, virtualLosses: virtualLossCountRef.current, recovered: recoveryPnlRef.current }));
            if (virtualLossCountRef.current >= cfgRef.current.threshold) {
                recoveryPhaseRef.current = 'real';
                recoveryStakeRef.current = cfgRef.current.s;
                addLog(`🔴 THRESHOLD REACHED (${virtualLossCountRef.current} virtual losses) — switching to REAL trades | First real stake: $${recoveryStakeRef.current.toFixed(2)} (base)`, 'recovery');
                setRecoveryDisplay(p => ({ ...p, phase: 'real' }));
            }
        }

        virtualTradeRef.current = null;
        lockRef.current = true;
        if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
        cooldownTimerRef.current = setTimeout(() => {
            lockRef.current = false;
            cooldownTimerRef.current = null;
        }, 1500);
    }, [addLog, transactions]);

    /* ── Enter recovery mode after a DIFFER loss ── */
    const enterRecovery = useCallback((lostAmount: number) => {
        if (!cfgRef.current.recov) {
            lockRef.current = false;
            return;
        }

        if (cfgRef.current.threshold <= 0) {
            recoveryPhaseRef.current = 'real';
            recoveryLossRef.current = lostAmount;
            virtualLossCountRef.current = 0;
            recoveryStakeRef.current = Number((cfgRef.current.s * cfgRef.current.m).toFixed(2));
            recoveryPnlRef.current = 0;
            directionRef.current = {};
            addLog(`🔴 RECOVERY START (threshold 0) — lost $${lostAmount.toFixed(2)} | Straight to REAL trades | Stake: $${recoveryStakeRef.current.toFixed(2)}`, 'recovery');
            setRecoveryDisplay({ phase: 'real', loss: lostAmount, virtualLosses: 0, recovered: 0 });
            lockRef.current = false;
            return;
        }

        recoveryPhaseRef.current = 'virtual';
        recoveryLossRef.current = lostAmount;
        virtualLossCountRef.current = 0;
        recoveryStakeRef.current = cfgRef.current.s;
        recoveryPnlRef.current = 0;
        directionRef.current = {};
        addLog(`🔄 RECOVERY START — lost $${lostAmount.toFixed(2)} | Virtual trades first | Max ${cfgRef.current.threshold} virtual losses before real`, 'recovery');
        setRecoveryDisplay({ phase: 'virtual', loss: lostAmount, virtualLosses: 0, recovered: 0 });
        lockRef.current = false;
    }, [addLog]);

    /* ── POC listener (differs + real recovery only) ── */
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
                const profit = Number(c.profit);
                const won = profit >= 0;

                pnlRef.current += profit;
                cntRef.current++;
                setPnl(pnlRef.current);
                setTrades(cntRef.current);

                if (e.phase === 'differs') {
                    if (won) {
                        winsRef.current++;
                        setWins(winsRef.current);
                        addLog(`✅ DIFFER WON +$${profit.toFixed(2)} on ${SYMBOL_LABELS[e.sym]} | P&L: $${pnlRef.current.toFixed(2)}`, 'win');
                        currentStakeRef.current = cfgRef.current.s;
                        lockRef.current = false;
                    } else {
                        lossesRef.current++;
                        setLosses(lossesRef.current);
                        const nextStake = Number((e.amt * cfgRef.current.m).toFixed(2));
                        currentStakeRef.current = nextStake;
                        addLog(`❌ DIFFER LOST -$${Math.abs(profit).toFixed(2)} on ${SYMBOL_LABELS[e.sym]} | P&L: $${pnlRef.current.toFixed(2)}`, 'loss');
                        if (cfgRef.current.recov) {
                            addLog(`Entering recovery mode... (recov=${cfgRef.current.recov}, threshold=${cfgRef.current.threshold})`, 'info');
                            enterRecovery(Math.abs(profit));
                        } else {
                            addLog(`No recovery — next differ stake: $${nextStake.toFixed(2)}`, 'info');
                            lockRef.current = false;
                        }
                    }
                } else if (e.phase === 'recov_real') {
                    if (won) {
                        realWinCountRef.current++;
                        recoveryPnlRef.current += profit;
                        winsRef.current++;
                        setWins(winsRef.current);
                        addLog(`🔴 REAL WIN +$${profit.toFixed(2)} on ${SYMBOL_LABELS[e.sym]} | Consecutive real wins: ${realWinCountRef.current} | Recovery: $${recoveryPnlRef.current.toFixed(2)} / $${recoveryLossRef.current.toFixed(2)}`, 'win');
                        if (realWinCountRef.current >= 2 && recoveryPnlRef.current >= recoveryLossRef.current) {
                            addLog(`🎉 2 REAL WINS + RECOVERY COMPLETE ($${recoveryPnlRef.current.toFixed(2)} >= $${recoveryLossRef.current.toFixed(2)}) — back to DIFFERS`, 'recovery');
                            recoveryPhaseRef.current = 'idle';
                            currentStakeRef.current = cfgRef.current.s;
                            realWinCountRef.current = 0;
                            setRecoveryDisplay({ phase: 'idle', loss: 0, virtualLosses: 0, recovered: 0 });
                        } else {
                            recoveryPhaseRef.current = 'virtual';
                            recoveryStakeRef.current = cfgRef.current.s;
                            virtualLossCountRef.current = 0;
                            const reason = realWinCountRef.current < 2 ? `${realWinCountRef.current}/2 wins` : `P&L $${recoveryPnlRef.current.toFixed(2)} < $${recoveryLossRef.current.toFixed(2)}`;
                            addLog(`🔄 Back to VIRTUAL trades — ${reason} | Virtual losses reset, stake: $${recoveryStakeRef.current.toFixed(2)} (base)`, 'recovery');
                            setRecoveryDisplay(p => ({ ...p, phase: 'virtual', virtualLosses: 0, recovered: recoveryPnlRef.current }));
                        }
                        lockRef.current = false;
                    } else {
                        realWinCountRef.current = 0;
                        lossesRef.current++;
                        setLosses(lossesRef.current);
                        recoveryPnlRef.current += profit;
                        const nextStake = Number((e.amt * cfgRef.current.m).toFixed(2));
                        recoveryStakeRef.current = nextStake;
                        addLog(`🔴 REAL LOSS -$${Math.abs(profit).toFixed(2)} on ${SYMBOL_LABELS[e.sym]} | Consecutive real wins reset | Next real stake: $${nextStake.toFixed(2)} | Recovery: $${recoveryPnlRef.current.toFixed(2)}`, 'loss');
                        setRecoveryDisplay(p => ({ ...p, recovered: recoveryPnlRef.current }));
                        lockRef.current = false;
                    }
                }
            } catch {}
        });
        return () => { unsub(); };
    }, [running, addLog, enterRecovery]);

    /* ── Tick handler ── */
    useEffect(() => {
        if (!running) return;
        const unsub = onNewSystemMessage((ev: MessageEvent) => {
            if (!runRef.current) return;
            try {
                const d = JSON.parse(ev.data);

                if (d.msg_type === 'history' && d.history) {
                    const sym = d.echo_req?.ticks_history;
                    if (!sym) return;
                    const prices = d.history.prices;
                    if (!Array.isArray(prices)) return;
                    if (!bufRef.current[sym]) bufRef.current[sym] = [];
                    if (!priceBufRef.current[sym]) priceBufRef.current[sym] = [];
                    prices.forEach((p: any) => {
                        const num = Number(p);
                        const digit = parseInt(String(p).slice(-1), 10);
                        if (!isNaN(digit)) bufRef.current[sym].push(digit);
                        if (!isNaN(num)) priceBufRef.current[sym].push(num);
                    });
                    if (bufRef.current[sym].length > MAX_TICKS) bufRef.current[sym] = bufRef.current[sym].slice(-MAX_TICKS);
                    if (priceBufRef.current[sym].length > MAX_TICKS) priceBufRef.current[sym] = priceBufRef.current[sym].slice(-MAX_TICKS);
                    initStreak(sym, bufRef.current[sym]);
                    return;
                }

                if (d.msg_type !== 'tick' || !d.tick) return;
                const sym = d.tick.symbol;
                const q = d.tick.quote;
                if (!sym || q === undefined) return;
                const numPrice = Number(q);
                const digit = parseInt(String(q).slice(-1), 10);
                if (isNaN(digit)) return;

                if (!bufRef.current[sym]) bufRef.current[sym] = [];
                if (!priceBufRef.current[sym]) priceBufRef.current[sym] = [];
                bufRef.current[sym].push(digit);
                priceBufRef.current[sym].push(numPrice);
                if (bufRef.current[sym].length > MAX_TICKS) bufRef.current[sym] = bufRef.current[sym].slice(-MAX_TICKS);
                if (priceBufRef.current[sym].length > MAX_TICKS) priceBufRef.current[sym] = priceBufRef.current[sym].slice(-MAX_TICKS);

                const buf = bufRef.current[sym];
                const prices = priceBufRef.current[sym];

                const prev = streakRef.current[sym];
                if (prev && prev.digit === digit) { prev.count++; } else { streakRef.current[sym] = { digit, count: 1 }; }
                const streak = streakRef.current[sym];

                updateDirection(sym, prices);

                lastTickSymRef.current = sym;

                const dirInfo = directionRef.current[sym] || { dir: null, count: 0 };
                const dirLabel = dirInfo.dir === 'up' ? '↑' : dirInfo.dir === 'down' ? '↓' : '—';

                setSymProg(p => ({
                    ...p,
                    [sym]: {
                        symbol: sym, ticks: buf.length,
                        lastDigit: digit,
                        streakDigit: streak.digit,
                        streakCount: streak.count,
                        status: streak.count >= cfgRef.current.max ? 'READY' : (recoveryPhaseRef.current !== 'idle' ? 'recovery' : 'scanning'),
                        wins: p[sym]?.wins || 0, losses: p[sym]?.losses || 0,
                        dirCount: dirInfo.count, dirDir: dirLabel,
                    },
                }));

                /* ── Virtual trade resolution (before lock check) ── */
                if (virtualTradeRef.current) {
                    const vt = virtualTradeRef.current;
                    if (vt.symbol === sym) {
                        vt.ticksElapsed++;
                        if (vt.ticksElapsed >= 1 && !vt.resolved) {
                            vt.resolved = true;
                            const capturedPrice = numPrice;
                            setTimeout(() => {
                                resolveVirtualTrade(sym, capturedPrice);
                            }, 1000);
                        }
                    }
                    return;
                }

                /* ── DIFFERS MODE ── */
                if (recoveryPhaseRef.current === 'idle') {
                    if (lockRef.current) return;
                    if (streak.count >= cfgRef.current.max) {
                        addLog(`TRIGGER ${SYMBOL_LABELS[sym]}: digit ${streak.digit} appeared ${streak.count}x → DIFFER`, 'trigger');
                        lockRef.current = true;
                        buyDiffers(sym, streak.digit, currentStakeRef.current);
                        streakRef.current[sym] = { digit, count: 0 };
                    }
                    return;
                }

                /* ── RECOVERY MODE — monitor for direction pattern ── */
                if (recoveryPhaseRef.current === 'virtual' || recoveryPhaseRef.current === 'real') {
                    if (lockRef.current) return;
                    if (dirInfo.count >= cfgRef.current.maxDir && dirInfo.dir) {
                        const direction = dirInfo.dir === 'up' ? 'PUT' : 'CALL';
                        const label = direction === 'CALL' ? 'FALL' : 'RISE';
                        const amt = recoveryStakeRef.current;
                        addLog(`RECOVERY TRIGGER ${SYMBOL_LABELS[sym]}: ${dirInfo.dir} ${dirInfo.count}x → ${label} | phase=${recoveryPhaseRef.current} | stake=$${amt.toFixed(2)}`, 'trigger');
                        lockRef.current = true;
                        directionRef.current[sym] = { dir: null, count: 0 };

                        if (recoveryPhaseRef.current === 'virtual') {
                            startVirtualTrade(sym, direction, amt);
                        } else {
                            buyRiseFallReal(sym, direction, amt);
                        }
                    }
                }
            } catch {}
        });
        return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running, addLog, buyDiffers, buyRiseFallReal, startVirtualTrade, resolveVirtualTrade]);

    const initStreak = useCallback((sym: string, buf: number[]) => {
        let streakDigit = buf.length > 0 ? buf[buf.length - 1] : null;
        let streakCount = 0;
        for (let i = buf.length - 1; i >= 0; i--) {
            if (buf[i] === streakDigit) streakCount++; else break;
        }
        streakRef.current[sym] = { digit: streakDigit ?? -1, count: streakCount };
        setSymProg(p => ({
            ...p,
            [sym]: {
                symbol: sym, ticks: buf.length,
                lastDigit: streakDigit, streakDigit, streakCount,
                status: streakCount >= cfgRef.current.max ? 'READY' : 'scanning',
                wins: p[sym]?.wins || 0, losses: p[sym]?.losses || 0,
                dirCount: p[sym]?.dirCount || 0, dirDir: p[sym]?.dirDir || '—',
            },
        }));
    }, []);

    const updateDirection = useCallback((sym: string, prices: number[]) => {
        if (prices.length < 2) return;
        const last = prices[prices.length - 1];
        const prev = prices[prices.length - 2];
        const cur = directionRef.current[sym] || { dir: null, count: 0 };
        if (last > prev) {
            if (cur.dir === 'up') { cur.count++; } else { cur.dir = 'up'; cur.count = 1; }
        } else if (last < prev) {
            if (cur.dir === 'down') { cur.count++; } else { cur.dir = 'down'; cur.count = 1; }
        } else {
            cur.count = 0; cur.dir = null;
        }
        directionRef.current[sym] = cur;
    }, []);

    const subscribeAll = useCallback(() => {
        if (window._newSystemWS?.readyState !== WebSocket.OPEN) return;
        ALL_SYMBOLS.forEach(sym => {
            if (!bufRef.current[sym] || bufRef.current[sym].length === 0) bufRef.current[sym] = [];
            if (!priceBufRef.current[sym] || priceBufRef.current[sym].length === 0) priceBufRef.current[sym] = [];
            streakRef.current[sym] = { digit: -1, count: 0 };
            directionRef.current[sym] = { dir: null, count: 0 };
            setSymProg(p => ({
                ...p,
                [sym]: { symbol: sym, ticks: p[sym]?.ticks || 0, lastDigit: null, streakDigit: null, streakCount: 0, status: 'scanning', wins: 0, losses: 0, dirCount: 0, dirDir: '—' },
            }));
            window._newSystemWS.send(JSON.stringify({ ticks_history: sym, style: 'ticks', count: 50, end: 'latest', subscribe: 1 }));
        });
        addLog(`Subscribed to ${ALL_SYMBOLS.length} volatilities`, 'info');
    }, [addLog]);

    const unsubscribeAll = useCallback(() => {
        if (window._newSystemWS?.readyState !== WebSocket.OPEN) return;
        ALL_SYMBOLS.forEach(sym => window._newSystemWS.send(JSON.stringify({ forget: sym })));
    }, []);

    const start = useCallback(() => {
        if (running) return;
        runRef.current = true; setRunning(true);
        lockRef.current = false;
        cmapRef.current.clear(); bufRef.current = {}; priceBufRef.current = {}; streakRef.current = {}; directionRef.current = {};
        pnlRef.current = 0; cntRef.current = 0; winsRef.current = 0; lossesRef.current = 0;
        currentStakeRef.current = cfgRef.current.s;
        recoveryPhaseRef.current = 'idle'; recoveryLossRef.current = 0; virtualLossCountRef.current = 0;
        realWinCountRef.current = 0;
        recoveryStakeRef.current = cfgRef.current.s; recoveryPnlRef.current = 0;
        virtualTradeRef.current = null; lastTickSymRef.current = '';
        setPnl(0); setTrades(0); setWins(0); setLosses(0); setLogs([]);
        setRecoveryDisplay({ phase: 'idle', loss: 0, virtualLosses: 0, recovered: 0 });

        addLog(`DIFFERS AUTO START | Stake: $${cfgRef.current.s} | MG: ${cfgRef.current.m}x | Max Appearance: ${cfgRef.current.max}`, 'info');
        if (cfgRef.current.recov) {
            addLog(`Recovery ON | Loss Threshold: ${cfgRef.current.threshold} | Max Tick Dir: ${cfgRef.current.maxDir}`, 'recovery');
        }

        if (!wsRef.current) {
            wsRef.current = openMakotiWS(() => {}, () => { setConn(true); addLog('Connected', 'info'); subscribeAll(); }, () => { setConn(false); }, { skipAuth: true });
        } else { subscribeAll(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running, addLog]);

    const stop = useCallback(() => {
        runRef.current = false; setRunning(false); lockRef.current = false;
        if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); cooldownTimerRef.current = null; }
        recoveryPhaseRef.current = 'idle';
        virtualTradeRef.current = null; lastTickSymRef.current = '';
        unsubscribeAll();
        if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
        addLog('STOPPED', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addLog]);

    useEffect(() => { return () => { runRef.current = false; unsubscribeAll(); if (cooldownTimerRef.current) { clearTimeout(cooldownTimerRef.current); } if (wsRef.current) { wsRef.current.close(); wsRef.current = null; } }; }, [unsubscribeAll]);

    const activeDiffersStake =
        recoveryPhaseRef.current !== 'idle'
            ? recoveryStakeRef.current
            : currentStakeRef.current;
    const daWinRate = trades > 0 ? ((wins / trades) * 100).toFixed(1) : '0.0';

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
                    <span className='at-kpi-card__label'>Total Trades: {trades}</span>
                    <div className='at-kpi-card__sub'>
                        ({wins}W / {losses}L • {daWinRate}%)
                    </div>
                </div>

                <div className='at-kpi-card'>
                    <span className='at-kpi-card__label'>Active Stake:</span>
                    <div className='at-kpi-card__row'>
                        <span className='at-kpi-card__val at-kpi-card__val--mono'>
                            USD {(running ? activeDiffersStake : parseFloat(stake) || 0).toFixed(2)}
                        </span>
                    </div>
                </div>

                <div className='at-kpi-card'>
                    <div className='at-kpi-card__top'>
                        <span className='at-kpi-card__label'>Engine Mode:</span>
                        <span
                            className={`at-status-dot ${
                                running ? 'at-status-dot--live' : conn ? 'at-status-dot--warn' : ''
                            }`}
                        />
                    </div>
                    <div className='at-kpi-card__sub' style={{ fontWeight: 700, color: 'var(--at-text-primary)' }}>
                        {running
                            ? recoveryPhaseRef.current === 'idle'
                                ? `Repeat ${cfgRef.current.max}× Trigger`
                                : `Recovery (${recoveryPhaseRef.current.toUpperCase()})`
                            : conn
                            ? 'Ready'
                            : 'Connecting…'}
                    </div>
                </div>
            </section>

            {/* 2-Column Workspace */}
            <div className='at-split'>
                {/* Left Column: Differs Auto Parameters */}
                <div className='at-col'>
                    <section className='at-card'>
                        <div className='at-card__header'>
                            <div>
                                <h2 className='at-card__title'>Differs Auto Config</h2>
                                <p className='at-card__subtitle'>
                                    Fires DIGITDIFF when any digit repeats N consecutive times
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
                                        step='0.01'
                                        min='0'
                                        value={stake}
                                        onChange={e => setStake(e.target.value)}
                                        disabled={running}
                                    />
                                </div>
                            </div>

                            <div className='at-param-row'>
                                <span className='at-param-row__label'>Martingale (x):</span>
                                <div className='at-param-row__control'>
                                    <input
                                        className='mw-input'
                                        type='number'
                                        step='0.1'
                                        min='1'
                                        value={martingale}
                                        onChange={e => setMartingale(e.target.value)}
                                        disabled={running}
                                    />
                                </div>
                            </div>

                            <div className='at-param-row'>
                                <span className='at-param-row__label'>Max Appearance:</span>
                                <div className='at-param-row__control'>
                                    <input
                                        className='mw-input'
                                        type='number'
                                        step='1'
                                        min='2'
                                        max='20'
                                        value={maxAppearance}
                                        onChange={e => setMaxAppearance(e.target.value)}
                                        disabled={running}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className='at-toggle-card'>
                            <label className='at-toggle-row'>
                                <div className='at-toggle-row__info'>
                                    <span className='at-toggle-row__title'>Rise / Fall Recovery</span>
                                    <span className='at-toggle-row__sub'>
                                        Recover digit losses via directional streak entries
                                    </span>
                                </div>
                                <span className='at-switch'>
                                    <input
                                        type='checkbox'
                                        checked={recoveryEnabled}
                                        onChange={e => setRecoveryEnabled(e.target.checked)}
                                        disabled={running}
                                    />
                                    <span className='at-switch__slider' />
                                </span>
                            </label>

                            {recoveryEnabled && (
                                <div className='at-field-grid' style={{ marginBottom: 0 }}>
                                    <div className='mw-field'>
                                        <label className='mw-label'>Loss Threshold</label>
                                        <input
                                            className='mw-input'
                                            type='number'
                                            step='1'
                                            min='1'
                                            max='20'
                                            value={lossThreshold}
                                            onChange={e => setLossThreshold(e.target.value)}
                                            disabled={running}
                                        />
                                    </div>
                                    <div className='mw-field'>
                                        <label className='mw-label'>Max Tick Direction</label>
                                        <input
                                            className='mw-input'
                                            type='number'
                                            step='1'
                                            min='2'
                                            max='20'
                                            value={maxTickDirection}
                                            onChange={e => setMaxTickDirection(e.target.value)}
                                            disabled={running}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        <button
                            type='button'
                            className={`mw-btn ${running ? 'mw-btn--stop' : 'mw-btn--kill'}`}
                            onClick={running ? stop : start}
                        >
                            {running ? (
                                <>
                                    <span className='mw-pulse' /> STOP DIFFERS AUTO
                                </>
                            ) : (
                                'RUN DIFFERS AUTO'
                            )}
                        </button>
                    </section>
                </div>

                {/* Right Column: Recovery Progress + Volatility Streaks + Activity Log */}
                <div className='at-col'>
                    {recoveryEnabled && recoveryDisplay.phase !== 'idle' && running && (
                        <section className='at-card'>
                            <div className='at-card__header'>
                                <h3 className='at-card__title'>Recovery Progress</h3>
                                <span className='at-pill-badge at-pill-badge--amber-soft'>
                                    {recoveryDisplay.phase.toUpperCase()}
                                </span>
                            </div>
                            <div className='at-vol-row__track' style={{ height: '10px', marginBottom: '12px' }}>
                                <div
                                    className='at-vol-row__fill at-vol-row__fill--indigo'
                                    style={{
                                        width: `${Math.min(
                                            (recoveryDisplay.recovered /
                                                Math.max(recoveryDisplay.loss, 0.01)) *
                                                100,
                                            100
                                        )}%`,
                                    }}
                                />
                            </div>
                            <div className='at-digit-chips' style={{ marginTop: 0 }}>
                                <span className='at-digit-chip'>
                                    Loss: ${recoveryDisplay.loss.toFixed(2)}
                                </span>
                                <span className='at-digit-chip'>
                                    Recovered: ${recoveryDisplay.recovered.toFixed(2)}
                                </span>
                                {recoveryDisplay.phase === 'virtual' && (
                                    <span className='at-digit-chip'>
                                        Virtual Losses: {recoveryDisplay.virtualLosses}/
                                        {cfgRef.current.threshold}
                                    </span>
                                )}
                            </div>
                        </section>
                    )}

                    <section className='at-card'>
                        <div className='at-card__header'>
                            <div>
                                <h2 className='at-card__title'>Live Volatility Digit Streaks</h2>
                                <p className='at-card__subtitle'>
                                    Consecutive identical digits across all 10 Volatility indices
                                </p>
                            </div>
                        </div>

                        <div className='at-vol-list'>
                            {ALL_SYMBOLS.map(sym => {
                                const p = symProg[sym];
                                const maxTarget = cfgRef.current.max || parseInt(maxAppearance) || 3;
                                const streakPct = p
                                    ? Math.min((p.streakCount / maxTarget) * 100, 100)
                                    : 0;
                                const isReady = p?.status === 'READY';
                                const isRecovery = p?.status === 'recovery';

                                return (
                                    <div key={sym} className='at-vol-row'>
                                        <span className='at-vol-row__sym'>
                                            {SYMBOL_LABELS[sym]}
                                        </span>
                                        <div className='at-vol-row__track'>
                                            <div
                                                className={`at-vol-row__fill${
                                                    isReady ? ' at-vol-row__fill--ready' : ''
                                                }`}
                                                style={{ width: `${streakPct}%` }}
                                            />
                                        </div>
                                        <span className='at-vol-row__badge'>
                                            D{p && p.streakDigit != null ? p.streakDigit : '—'} •{' '}
                                            {p?.streakCount || 0}/{maxTarget}
                                        </span>
                                        <span
                                            className={`at-pill-badge ${
                                                isReady
                                                    ? 'at-pill-badge--rose-soft'
                                                    : isRecovery
                                                    ? 'at-pill-badge--amber-soft'
                                                    : 'at-pill-badge--emerald-soft'
                                            }`}
                                        >
                                            {(p?.status || 'idle').toUpperCase()}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className='at-card'>
                        <div className='at-log-header'>
                            <h3 className='at-card__title'>Activity Log</h3>
                        </div>
                        {logs.length === 0 ? (
                            <div className='at-log-empty'>
                                Run Differs Auto to stream live digit streaks and contract settlements.
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
