import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ALL_SYMBOLS, SYMBOL_LABELS, PIP_SIZES, openMakotiWS, MakotiWS } from './makoti-ws';
import { analyzeSignals, recordOutcome, TradeSignal } from './prediction-engine';
import { sendViaNewSystemWithPromise, onNewSystemMessage } from '@/auth/NewDerivAuth';
import { useStore } from '@/hooks/useStore';
import { MwSelect } from './mw-select';

/* ── Types ─────────────────────────────────────────────────────────────────── */
type ContractSide = 'DIGITOVER' | 'DIGITUNDER';

interface SymbolState {
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
    type: 'win' | 'loss' | 'info' | 'trade';
}

/* ── Constants ─────────────────────────────────────────────────────────────── */
const MAX_TICKS              = 1000;
const MIN_TICKS_BEFORE_TRADE = 30;
const CONFIDENCE_THRESHOLD   = 75;

const CONTRACT_SIDES: { label: string; value: ContractSide }[] = [
    { label: 'Over',  value: 'DIGITOVER' },
    { label: 'Under', value: 'DIGITUNDER' },
];

const LS_CONFIG_KEY  = 'mw_ouk_config';
const LS_LOGS_KEY = 'mw_ouk_logs';

const DEFAULT_CONFIG = { stake: '0.35', martingale: '2', takeProfit: '10', stopLoss: '5', predictionDigit: '5', contractSide: 'DIGITOVER' as const, recoveryMode: false, manualRecovery: false, recoverySide: 'DIGITOVER' as const, recoveryDigit: '5', recoveryLossThreshold: '1', automate: false };

function loadConfig(): typeof DEFAULT_CONFIG {
    try {
        const raw = localStorage.getItem(LS_CONFIG_KEY);
        return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
    } catch {
        return DEFAULT_CONFIG;
    }
}
function saveConfig(cfg: typeof DEFAULT_CONFIG) {
    try { localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(cfg)); } catch {}
}

/* ── Digit frequency analysis helpers ─────────────────────────────────────── */
function calcDigitPcts(ticks: number[]): number[] {
    const counts = new Array(10).fill(0);
    ticks.forEach(d => { if (d >= 0 && d <= 9) counts[d]++; });
    const total = counts.reduce((a, v) => a + v, 0);
    return total > 0 ? counts.map(c => (c / total) * 100) : counts;
}

function analyzeDigitPsychology(ticks: number[]): {
    freq: number[];
    recentFreq: number[];
    dominantDigit: number;
    rareDigit: number;
    streakLen: number;
    streakDigit: number;
    reversalSignal: boolean;
} {
    const full = ticks.slice(-200);
    const recent = ticks.slice(-30);
    const freq = calcDigitPcts(full);
    const recentFreq = calcDigitPcts(recent);

    let dominantDigit = 0, maxPct = 0;
    let rareDigit = 0, minPct = 100;
    freq.forEach((p, i) => {
        if (p > maxPct) { maxPct = p; dominantDigit = i; }
        if (p < minPct) { minPct = p; rareDigit = i; }
    });

    const lastDigit = ticks[ticks.length - 1];
    let streakLen = 0;
    for (let i = ticks.length - 1; i >= 0; i--) {
        if (ticks[i] === lastDigit) streakLen++;
        else break;
    }

    const reversalSignal = maxPct > 30 && (dominantDigit === lastDigit) && streakLen >= 3;

    return { freq, recentFreq, dominantDigit, rareDigit, streakLen, streakDigit: lastDigit, reversalSignal };
}

/* ═══════════════════════════════════════════════════════════════════════════
   OverUnderKiller
════════════════════════════════════════════════════════════════════════════ */
export const OverUnderKiller: React.FC = () => {
    const { transactions } = useStore();

    const initCfg = loadConfig();
    const [stake,       setStake]       = useState(initCfg.stake);
    const [martingale,  setMartingale]  = useState(initCfg.martingale);
    const [takeProfit,  setTakeProfit]  = useState(initCfg.takeProfit);
    const [stopLoss,    setStopLoss]    = useState(initCfg.stopLoss);
    const [predictionDigit, setPredictionDigit] = useState(initCfg.predictionDigit);
    const [contractSide, setContractSide] = useState<ContractSide>(initCfg.contractSide);
    const [recoveryMode, setRecoveryMode] = useState(initCfg.recoveryMode);
    const [manualRecovery, setManualRecovery] = useState(initCfg.manualRecovery);
    const [recoverySide, setRecoverySide] = useState<ContractSide>(initCfg.recoverySide);
    const [recoveryDigit, setRecoveryDigit] = useState(initCfg.recoveryDigit);
    const [recoveryLossThreshold, setRecoveryLossThreshold] = useState(initCfg.recoveryLossThreshold);
    const [automate,    setAutomate]    = useState(initCfg.automate);
    const [running,     setRunning]     = useState(false);
    const [pnl,         setPnl]         = useState(0);
    const [logs,        setLogs]        = useState<LogEntry[]>([]);
    const [activeContracts, setActiveContracts] = useState(0);
    const [digitAnalysis, setDigitAnalysis] = useState<ReturnType<typeof analyzeDigitPsychology> | null>(null);
    const [signalDisplay, setSignalDisplay] = useState<{
        confidence: number; side: string; barrier: string; strategies: string;
    } | null>(null);
    const [symbolDisplay, setSymbolDisplay] = useState<Record<string, { lastSignal: string; wins: number; losses: number; stake: number }>>({});

    /* ── Refs ─────────────────────────────────────────────────────────────── */
    const wsRef                 = useRef<MakotiWS | null>(null);
    const symbolDataRef         = useRef<Record<string, SymbolState>>({});
    const pnlRef                = useRef(0);
    const runningRef            = useRef(false);
    const stakeParsed           = useRef(0.35);
    const martingaleParsed      = useRef(2);
    const tpRef                 = useRef(10);
    const slRef                 = useRef(5);
    const predictionDigitRef    = useRef(5);
    const contractSideRef       = useRef<ContractSide>('DIGITOVER');
    const recoveryRef           = useRef(false);
    const manualRecoveryRef     = useRef(false);
    const recoverySideRef       = useRef<ContractSide>('DIGITOVER');
    const recoveryDigitRef      = useRef(5);
    const recoveryLossThresholdRef = useRef(1);
    const inManualRecoveryRef   = useRef(false);
    const automateRef           = useRef(false);

    const globalLock            = useRef(false);
    const activeContractsRef    = useRef(0);
    const globalStakeRef        = useRef(0.35);
    const contractMapRef        = useRef<Map<string, { symbol: string; stake: number; strategyNames: string[]; duration: number }>>(new Map());
    const consecutiveLossesRef  = useRef(0);
    const cooldownTicksRef      = useRef(0);
    const signalHistoryRef      = useRef<{ sym: string; type: string; conf: number }[]>([]);
    const lastTickSymRef        = useRef('');

    /* ── Persist ──────────────────────────────────────────────────────────── */
    useEffect(() => { saveConfig({ stake, martingale, takeProfit, stopLoss, predictionDigit, contractSide, recoveryMode, manualRecovery, recoverySide, recoveryDigit, recoveryLossThreshold, automate }); }, [stake, martingale, takeProfit, stopLoss, predictionDigit, contractSide, recoveryMode, manualRecovery, recoverySide, recoveryDigit, recoveryLossThreshold, automate]);

    /* ── Log helper (defined FIRST — no deps) ────────────────────────────── */
    const addLog = useCallback((msg: string, type: LogEntry['type'] = 'info') => {
        const time = new Date().toLocaleTimeString();
        setLogs(prev => [{ time, msg, type }, ...prev].slice(0, 120));
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
        localStorage.removeItem(LS_LOGS_KEY);
    }, []);

    /* ── stopKiller (dep: addLog) ───────────────────────────────────────── */
    const stopKiller = useCallback(() => {
        runningRef.current = false;
        globalLock.current = false;
        lastTickSymRef.current = '';
        inManualRecoveryRef.current = false;
        setRunning(false);
        try { wsRef.current?.close(); } catch (_) {}
        wsRef.current = null;
        activeContractsRef.current = 0;
        setActiveContracts(0);
        addLog('Over/Under Killer stopped.', 'info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addLog]);

    /* ── flushDisplay (no deps) ─────────────────────────────────────────── */
    const flushDisplay = useCallback((sym: string) => {
        const sd = symbolDataRef.current[sym];
        if (!sd) return;
        setSymbolDisplay(prev => ({
            ...prev,
            [sym]: {
                lastSignal: sd.lastSignal,
                wins: sd.wins,
                losses: sd.losses,
                stake: globalStakeRef.current,
            },
        }));
    }, []);

    /* ── checkLimits (dep: addLog, stopKiller from closure) ─────────────── */
    const checkLimits = useCallback(() => {
        if (pnlRef.current >= tpRef.current) {
            addLog(`✅ Take Profit +$${tpRef.current} reached! P&L: $${pnlRef.current.toFixed(2)}`, 'win');
            stopKiller();
            return true;
        }
        if (pnlRef.current <= -slRef.current) {
            addLog(`🛑 Stop Loss -$${slRef.current} hit! P&L: $${pnlRef.current.toFixed(2)}`, 'loss');
            stopKiller();
            return true;
        }
        return false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addLog]);

    /* ── handleRecovery (dep: addLog, stopKiller from closure) ──────────── */
    const handleRecovery = useCallback((sym: string, lossAmount: number) => {
        addLog(`🔄 RECOVERY MODE ACTIVATED — switching to Rise/Fall via Market Killer to recover $${lossAmount.toFixed(2)}`, 'info');
        stopKiller();
        window.DBot = window.DBot || {};
        window.DBot.__recovery = {
            active: true,
            pending: lossAmount,
            stake: stakeParsed.current,
            martingale: martingaleParsed.current,
            vhThreshold: recoveryLossThresholdRef.current,
        };
        window.DBot.__ou_config = {
            stake: stakeParsed.current,
            martingale: martingaleParsed.current,
            takeProfit: tpRef.current,
            stopLoss: slRef.current,
            predictionDigit: predictionDigitRef.current,
            contractSide: contractSideRef.current,
            recoveryMode: recoveryRef.current,
            manualRecovery: manualRecoveryRef.current,
            recoverySide: recoverySideRef.current,
            recoveryDigit: recoveryDigitRef.current,
            recoveryLossThreshold: recoveryLossThresholdRef.current,
        };
        window.DBot.__recovery_auto_start = true;
        if (typeof window.DBot.__switchToTab === 'function') {
            window.DBot.__switchToTab('market_killer');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [addLog]);

    /* ── POC listener (uses addLog, stopKiller, flushDisplay, checkLimits, handleRecovery) ── */
    const pocUnsubRef = useRef<(() => void) | null>(null);
    const subscribePOC = useCallback(() => {
        if (!window._newSystemWS) return;
        window._newSystemWS.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
    }, []);

    useEffect(() => {
        if (!running) return;
        subscribePOC();
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

                const { symbol: sym, stake: tradeStake, strategyNames, duration } = entry;
                const sd = symbolDataRef.current[sym];
                if (!sd) return;

                const profit = Number(c.profit);
                const won = profit >= 0;

                strategyNames.forEach(n => recordOutcome(n, won));

                pnlRef.current += profit;
                setPnl(pnlRef.current);

                if (won) {
                    sd.wins++;
                    const wasInRecovery = inManualRecoveryRef.current;
                    if (wasInRecovery) {
                        inManualRecoveryRef.current = false;
                        addLog(`✅ MANUAL RECOVERY WON — back to normal`, 'win');
                    }
                    consecutiveLossesRef.current = 0;
                    cooldownTicksRef.current = 0;
                    globalStakeRef.current = stakeParsed.current;
                    addLog(`✅ WON +$${profit.toFixed(2)} on ${SYMBOL_LABELS[sym]} | Next stake reset to $${stakeParsed.current.toFixed(2)} | P&L $${pnlRef.current.toFixed(2)}`, 'win');
                } else {
                    sd.losses++;
                    consecutiveLossesRef.current++;
                    globalStakeRef.current = Number((tradeStake * martingaleParsed.current).toFixed(2));
                    if (consecutiveLossesRef.current >= 3) {
                        cooldownTicksRef.current = 8;
                        addLog(`⚠ ${consecutiveLossesRef.current} consecutive losses — cooldown ${cooldownTicksRef.current} ticks`, 'loss');
                    }
                    addLog(`❌ LOST -$${Math.abs(profit).toFixed(2)} on ${SYMBOL_LABELS[sym]} | Next stake $${globalStakeRef.current.toFixed(2)} | P&L $${pnlRef.current.toFixed(2)}`, 'loss');

                    if (recoveryRef.current) {
                        handleRecovery(sym, Math.abs(profit));
                        return;
                    }
                    if (manualRecoveryRef.current && consecutiveLossesRef.current >= 2 && !inManualRecoveryRef.current) {
                        inManualRecoveryRef.current = true;
                        addLog(`🔄 MANUAL RECOVERY ACTIVATED — switching to ${recoverySideRef.current === 'DIGITOVER' ? 'OVER' : 'UNDER'} ${recoveryDigitRef.current} until win`, 'info');
                    }
                }

                flushDisplay(sym);
                globalLock.current = false;
                activeContractsRef.current = 0;
                setActiveContracts(0);
                checkLimits();
            } catch (_) {}
        });

        pocUnsubRef.current = unsub;
        return () => { unsub(); pocUnsubRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running]);

    /* ── executeTrade (dep: addLog, flushDisplay) ────────────────────────── */
    const executeTrade = useCallback(async (sym: string, signal: TradeSignal) => {
        if (!runningRef.current) return;
        const threshold = inManualRecoveryRef.current ? CONFIDENCE_THRESHOLD + 5 : CONFIDENCE_THRESHOLD;
        if (!signal || signal.confidence < threshold) return;

        const sd = symbolDataRef.current[sym];
        if (!sd) return;

        if (signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER') {
            const last3 = sd.ticks.slice(-3);
            if (last3.length === 3) {
                const rising = last3[0] < last3[1] && last3[1] < last3[2];
                const falling = last3[0] > last3[1] && last3[1] > last3[2];
                if (signal.contract_type === 'DIGITOVER' && falling) return;
                if (signal.contract_type === 'DIGITUNDER' && rising) return;
            }
        }

        globalLock.current = true;
        activeContractsRef.current = 1;
        setActiveContracts(1);

        const { contract_type, reason, confidence, details, barrier: signalBarrier } = signal;
        const tradeStake = Number(globalStakeRef.current.toFixed(2));
        const duration = 1;

        if (!automateRef.current) {
            const userSide = inManualRecoveryRef.current ? recoverySideRef.current : contractSideRef.current;
            if (contract_type !== userSide) {
                addLog(`⏳ Signal is ${contract_type === 'DIGITOVER' ? 'OVER' : 'UNDER'} but need ${userSide === 'DIGITOVER' ? 'OVER' : 'UNDER'} — waiting for alignment`, 'info');
                globalLock.current = false;
                activeContractsRef.current = 0;
                setActiveContracts(0);
                return;
            }
        }

        addLog(`Trade stake: $${tradeStake.toFixed(2)} (base: $${stakeParsed.current.toFixed(2)}, mg: ${martingaleParsed.current}x)`, 'trade');

        const strategyMatch = details.match(/Strategies: (.+)/);
        const strategyNames = strategyMatch
            ? strategyMatch[1].split(',').map(s => s.trim().split('(')[0])
            : ['ensemble'];

        const actualBarrier = automateRef.current ? (signalBarrier || '5') : (inManualRecoveryRef.current ? recoveryDigitRef.current : predictionDigitRef.current);
        const contractTypeStr = contract_type === 'DIGITOVER' ? 'DIGITOVER' : 'DIGITUNDER';

        const params: any = {
            amount: tradeStake, basis: 'stake', currency: 'USD',
            duration, duration_unit: 't',
            symbol: sym, contract_type: contractTypeStr,
            barrier: String(actualBarrier),
        };

        const label = contract_type === 'DIGITOVER' ? `OVER ${actualBarrier}` : `UNDER ${actualBarrier}`;

        if (window._newSystemWS?.readyState === WebSocket.OPEN) {
            try {
                const response = await sendViaNewSystemWithPromise({ buy: 1, price: tradeStake, parameters: params });
                const contractId = response?.buy?.contract_id ?? response?.contract_id;
                if (contractId) {
                    contractMapRef.current.set(String(contractId), { symbol: sym, stake: tradeStake, strategyNames, duration });
                    sd.lastSignal = label;
                    addLog(`🎯 [${confidence.toFixed(0)}%] ${SYMBOL_LABELS[sym]}: ${label} D${duration} @ $${tradeStake} — ${reason}`, 'trade');
                    addLog(`Contract ${contractId} open on ${SYMBOL_LABELS[sym]}`, 'info');
                    flushDisplay(sym);
                    try {
                        transactions.onBotContractEvent({
                            contract_id: contractId,
                            transaction_ids: { buy: response?.buy?.transaction_id },
                            buy_price: tradeStake,
                            currency: 'USD',
                            contract_type: contractTypeStr,
                            underlying: sym,
                            display_name: SYMBOL_LABELS[sym],
                            date_start: Math.floor(Date.now() / 1000),
                            status: 'open',
                        } as any);
                    } catch (_) {}
                } else {
                    addLog(`Buy ok but no contract_id: ${JSON.stringify(response).slice(0, 100)}`, 'info');
                    globalLock.current = false;
                    activeContractsRef.current = 0;
                    setActiveContracts(0);
                }
            } catch (err: any) {
                addLog(`Buy error: ${err?.error?.message || err?.message || 'Unknown'}`, 'info');
                globalLock.current = false;
                activeContractsRef.current = 0;
                setActiveContracts(0);
            }
        } else if (wsRef.current?.isOpen()) {
            wsRef.current.send({ buy: 1, price: tradeStake, parameters: params });
            sd.lastSignal = label;
            addLog(`🎯 [${confidence.toFixed(0)}%] ${SYMBOL_LABELS[sym]}: ${label} D${duration} @ $${tradeStake} — ${reason}`, 'trade');
            contractMapRef.current.set(sym + Date.now(), { symbol: sym, stake: tradeStake, strategyNames, duration });
            flushDisplay(sym);
            try {
                transactions.onBotContractEvent({
                    transaction_ids: { buy: sym + Date.now() },
                    contract_id: sym + Date.now(),
                    buy_price: tradeStake,
                    currency: 'USD',
                    contract_type: contractTypeStr,
                    underlying: sym,
                    display_name: SYMBOL_LABELS[sym],
                    date_start: Math.floor(Date.now() / 1000),
                    entry_tick_time: Math.floor(Date.now() / 1000),
                    status: 'open',
                } as any);
            } catch (_) {}
        } else {
            globalLock.current = false;
            activeContractsRef.current = 0;
            setActiveContracts(0);
        }
    }, [addLog, flushDisplay]);

    /* ── onTickReceived (dep: executeTrade) ─────────────────────────────── */
    const onTickReceived = useCallback(() => {
        if (!runningRef.current) return;
        if (globalLock.current) return;
        if (cooldownTicksRef.current > 0) { cooldownTicksRef.current--; return; }

        let bestSym  = '';
        let bestSig: TradeSignal | null = null;
        let bestConf = CONFIDENCE_THRESHOLD - 1;

        ALL_SYMBOLS.forEach(s => {
            const sd = symbolDataRef.current[s];
            if (!sd || sd.ticks.length < MIN_TICKS_BEFORE_TRADE) return;
            const sig = analyzeSignals(sd.ticks, sd.prices, ['DIGITOVER', 'DIGITUNDER']);
            if (sig && sig.confidence > bestConf) {
                bestConf = sig.confidence;
                bestSym  = s;
                bestSig  = sig;
            }
        });

        if (bestSym && symbolDataRef.current[bestSym]) {
            const sd = symbolDataRef.current[bestSym];
            const analysis = analyzeDigitPsychology(sd.ticks);
            setDigitAnalysis(analysis);
        }

        if (bestSig) {
            setSignalDisplay({
                confidence: bestSig.confidence,
                side: bestSig.contract_type,
                barrier: bestSig.barrier || String(predictionDigitRef.current),
                strategies: bestSig.details,
            });
        }

        if (bestSym && bestSig) {
            signalHistoryRef.current.push({ sym: bestSym, type: bestSig.contract_type, conf: bestSig.confidence });
            if (signalHistoryRef.current.length > 2) signalHistoryRef.current.shift();
            const last2 = signalHistoryRef.current;
            const confirmed = last2.length === 2 && last2.every(s => s.sym === bestSym && s.type === bestSig.contract_type);
            if (confirmed) {
                signalHistoryRef.current = [];
                executeTrade(bestSym, bestSig).catch(() => {});
            }
        }
    }, [executeTrade]);

    const onTickRef = useRef(onTickReceived);
    onTickRef.current = onTickReceived;

    /* ── Start ───────────────────────────────────────────────────────────── */
    const startKiller = useCallback(() => {
        const stakeVal = Math.max(0.35, parseFloat(stake) || 0.35);
        const mgVal    = Math.max(1,    parseFloat(martingale) || 2);
        const tpVal    = Math.max(0.5,  parseFloat(takeProfit) || 10);
        const slVal    = Math.max(0.5,  parseFloat(stopLoss)   || 5);
        const predVal  = Math.min(9, Math.max(0, parseInt(predictionDigit) || 5));

        stakeParsed.current      = stakeVal;
        martingaleParsed.current = mgVal;
        tpRef.current            = tpVal;
        slRef.current            = slVal;
        predictionDigitRef.current = predVal;
        contractSideRef.current  = contractSide;
        recoveryRef.current      = recoveryMode;
        manualRecoveryRef.current = manualRecovery;
        recoverySideRef.current   = recoverySide;
        recoveryDigitRef.current  = Math.min(9, Math.max(0, parseInt(recoveryDigit) || 5));
        const parsedRlt = parseInt(recoveryLossThreshold);
        recoveryLossThresholdRef.current = isNaN(parsedRlt) ? 1 : Math.max(0, parsedRlt);
        automateRef.current = automate;
        inManualRecoveryRef.current = false;
        globalLock.current       = false;
        lastTickSymRef.current   = '';
        activeContractsRef.current = 0;
        globalStakeRef.current   = stakeVal;
        consecutiveLossesRef.current = 0;
        cooldownTicksRef.current = 0;

        setActiveContracts(0);
        setSymbolDisplay({});
        setSignalDisplay(null);
        setDigitAnalysis(null);
        contractMapRef.current = new Map();

        // Don't reset symbol data if already populated from auto-subscription
        const hasData = Object.values(symbolDataRef.current).some(sd => sd.ticks.length > 0);
        if (!hasData) {
            symbolDataRef.current = {};
            ALL_SYMBOLS.forEach(sym => {
                symbolDataRef.current[sym] = {
                    ticks: [], prices: [], lastSignal: '—',
                    wins: 0, losses: 0, ready: false,
                };
            });
        }

        runningRef.current = true;
        setRunning(true);

        const modeDesc = automate ? 'Auto (OU) — any signal/barrier' : `${contractSide === 'DIGITOVER' ? 'OVER' : 'UNDER'} ${predVal}`;
        addLog(`⚔ Over/Under Killer — ${modeDesc} | stake $${stakeVal}  MG ×${mgVal}  TP $${tpVal}  SL $${slVal}`, 'info');
        if (recoveryMode) {
            addLog(`🔄 RECOVERY MODE ON — real losses switch to Rise/Fall via Market Killer`, 'info');
        }
        if (manualRecovery) {
            addLog(`🔄 MANUAL RECOVERY ON — 2 losses → switch to ${recoverySide === 'DIGITOVER' ? 'OVER' : 'UNDER'} ${recoveryDigitRef.current}`, 'info');
        }
        addLog('Connected — using live tick stream', 'info');

        if (wsRef.current) { try { wsRef.current.close(); } catch (_) {} wsRef.current = null; }

        const handleMsg = (data: any) => {
            if (!runningRef.current) return;

            if (data.error) {
                if (data.msg_type === 'buy') {
                    addLog(`Buy error: ${data.error.message}`, 'info');
                    globalLock.current = false;
                    activeContractsRef.current = 0;
                    setActiveContracts(0);
                }
                return;
            }

            switch (data.msg_type) {
                case 'history': {
                    const sym: string = data.echo_req?.ticks_history;
                    if (!sym || !symbolDataRef.current[sym]) return;
                    const sd  = symbolDataRef.current[sym];
                    const pip = PIP_SIZES[sym] || 2;
                    const prices = (data.history.prices as (string | number)[]).map(p => Number(p));
                    const digits = prices.map(p => Number(p.toFixed(pip).slice(-1)));
                    sd.ticks  = digits.slice(-MAX_TICKS);
                    sd.prices = prices.slice(-MAX_TICKS);
                    sd.ready  = sd.ticks.length >= MIN_TICKS_BEFORE_TRADE;
                    addLog(`Loaded ${digits.length} ticks — ${SYMBOL_LABELS[sym]}`, 'info');
                    break;
                }
                case 'tick': {
                    const tick = data.tick;
                    if (!tick) return;
                    const sym: string = tick.symbol;
                    if (!sym || !symbolDataRef.current[sym]) return;
                    const sd  = symbolDataRef.current[sym];
                    const pip = PIP_SIZES[sym] || tick.pip_size || 2;
                    const price = Number(tick.quote);
                    const digit = Number(price.toFixed(pip).slice(-1));
                    sd.ticks  = [...sd.ticks.slice(-(MAX_TICKS - 1)), digit];
                    sd.prices = [...sd.prices.slice(-(MAX_TICKS - 1)), price];
                    sd.ready  = sd.ticks.length >= MIN_TICKS_BEFORE_TRADE;
                    lastTickSymRef.current = sym;
                    onTickRef.current();
                    break;
                }
                case 'buy': {
                    const sym: string = data.echo_req?.parameters?.symbol;
                    if (!sym) return;
                    if (data.error) {
                        globalLock.current = false;
                        activeContractsRef.current = 0;
                        setActiveContracts(0);
                        return;
                    }
                    if (!data.buy) { globalLock.current = false; activeContractsRef.current = 0; setActiveContracts(0); return; }
                    const cid = String(data.buy.contract_id);
                    if (!cid || cid === 'undefined') { globalLock.current = false; activeContractsRef.current = 0; setActiveContracts(0); return; }
                    contractMapRef.current.set(cid, { symbol: sym, stake: globalStakeRef.current, strategyNames: ['ensemble'], duration: 1 });
                    addLog(`Contract ${cid} open on ${SYMBOL_LABELS[sym]}`, 'info');
                    break;
                }
                case 'proposal_open_contract': {
                    const c = data.proposal_open_contract;
                    if (!c?.is_sold) return;
                    const cid = String(c.contract_id);
                    const entry = contractMapRef.current.get(cid);
                    if (!entry) return;
                    contractMapRef.current.delete(cid);

                    const { symbol: sym, stake: tradeStake, strategyNames, duration } = entry;
                    const sd = symbolDataRef.current[sym];
                    if (!sd) return;

                    const profit = Number(c.profit);
                    const won = profit >= 0;
                    strategyNames.forEach(n => recordOutcome(n, won));

                    pnlRef.current += profit;
                    setPnl(pnlRef.current);

                    try {
                        const pocWithDisplay = !(c as any).display_name ? { ...c, display_name: SYMBOL_LABELS[sym] } : c;
                        transactions.onBotContractEvent(pocWithDisplay);
                    } catch (_) {}

                    if (won) {
                        sd.wins++;
                        const wasInRecovery = inManualRecoveryRef.current;
                        if (wasInRecovery) {
                            inManualRecoveryRef.current = false;
                            addLog(`✅ MANUAL RECOVERY WON — back to normal`, 'win');
                        }
                        consecutiveLossesRef.current = 0;
                        cooldownTicksRef.current = 0;
                        globalStakeRef.current = stakeParsed.current;
                        addLog(`✅ WON +$${profit.toFixed(2)} on ${SYMBOL_LABELS[sym]} | Next stake reset to $${stakeParsed.current.toFixed(2)} | P&L $${pnlRef.current.toFixed(2)}`, 'win');
                    } else {
                        sd.losses++;
                        consecutiveLossesRef.current++;
                        globalStakeRef.current = Number((tradeStake * martingaleParsed.current).toFixed(2));
                        if (consecutiveLossesRef.current >= 3) {
                            cooldownTicksRef.current = 8;
                            addLog(`⚠ ${consecutiveLossesRef.current} consecutive losses — cooldown ${cooldownTicksRef.current} ticks`, 'loss');
                        }
                        addLog(`❌ LOST -$${Math.abs(profit).toFixed(2)} on ${SYMBOL_LABELS[sym]} | Next stake $${globalStakeRef.current.toFixed(2)} | P&L $${pnlRef.current.toFixed(2)}`, 'loss');

                        if (recoveryRef.current) {
                            handleRecovery(sym, Math.abs(profit));
                            return;
                        }
                        if (manualRecoveryRef.current && consecutiveLossesRef.current >= 2 && !inManualRecoveryRef.current) {
                            inManualRecoveryRef.current = true;
                            addLog(`🔄 MANUAL RECOVERY ACTIVATED — switching to ${recoverySideRef.current === 'DIGITOVER' ? 'OVER' : 'UNDER'} ${recoveryDigitRef.current} until win`, 'info');
                        }
                    }

                    flushDisplay(sym);
                    globalLock.current = false;
                    activeContractsRef.current = 0;
                    setActiveContracts(0);
                    checkLimits();
                    break;
                }
            }
        };

        const mws = openMakotiWS(
            handleMsg,
            () => {
                addLog('Live tick stream active — trading immediately', 'info');
                if (!window._newSystemWS) {
                    mws.send({ proposal_open_contract: 1, subscribe: 1 });
                }
                // Skip ticks_history — live ticks already flowing from auto-subscription
            },
            () => {
                if (runningRef.current) {
                    addLog('Connection lost. Stopping.', 'info');
                    stopKiller();
                }
            }
        );
        wsRef.current = mws;
    }, [stake, martingale, takeProfit, stopLoss, predictionDigit, contractSide, recoveryMode, manualRecovery, recoverySide, recoveryDigit, recoveryLossThreshold, addLog, flushDisplay, checkLimits, stopKiller, onTickReceived]);

    const startKillerRef = useRef(startKiller);
    startKillerRef.current = startKiller;

    /* ── Auto-start on recovery return ──────────────────────────────────── */
    useEffect(() => {
        if (window.DBot?.__ou_auto_start) {
            window.DBot.__ou_auto_start = false;
            const cfg = window.DBot.__ou_config;
            if (cfg) {
                setStake(String(cfg.stake));
                setMartingale(String(cfg.martingale));
                setTakeProfit(String(cfg.takeProfit));
                setStopLoss(String(cfg.stopLoss));
                setPredictionDigit(String(cfg.predictionDigit));
                setContractSide(cfg.contractSide);
                setRecoveryMode(cfg.recoveryMode);
                if (cfg.manualRecovery !== undefined) {
                    setManualRecovery(cfg.manualRecovery);
                    setRecoverySide(cfg.recoverySide || 'DIGITOVER');
                    setRecoveryDigit(String(cfg.recoveryDigit ?? 5));
                }
                if (cfg.recoveryLossThreshold !== undefined) {
                    setRecoveryLossThreshold(String(cfg.recoveryLossThreshold));
                }
                window.DBot.__ou_config = null;
            }
            const t = setTimeout(() => startKillerRef.current(), 200);
            return () => clearTimeout(t);
        }
    }, []);

    /* ── Derived display values ──────────────────────────────────────────── */
    const totalWins   = Object.values(symbolDisplay).reduce((a, b) => a + b.wins,  0);
    const totalLosses = Object.values(symbolDisplay).reduce((a, b) => a + b.losses, 0);
    const totalTrades = totalWins + totalLosses;
    const winRate     = totalTrades > 0 ? (totalWins / totalTrades * 100).toFixed(1) : '—';

    const activeBarrier = signalDisplay ? signalDisplay.barrier : Number(predictionDigit) || 0;
    const activeSideLabel = signalDisplay
        ? signalDisplay.side === 'DIGITOVER'
            ? 'OVER'
            : 'UNDER'
        : contractSide === 'DIGITOVER'
        ? 'OVER'
        : 'UNDER';

    const digitFreqs = digitAnalysis ? digitAnalysis.freq : [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];

    /* ── Render ──────────────────────────────────────────────────────────── */
    return (
        <div className='at-view'>
            {/* 4-Card Session KPI Strip */}
            <section className='at-kpi-grid'>
                <div className='at-kpi-card'>
                    <span className='at-kpi-card__label'>Session Net P/L:</span>
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
                        <span className='at-kpi-card__label'>Live Signal:</span>
                        {signalDisplay && (
                            <span className='at-pill-badge at-pill-badge--indigo'>
                                {signalDisplay.confidence}% Confidence
                            </span>
                        )}
                    </div>
                    <div className='at-kpi-card__sub' style={{ fontWeight: 700, color: 'var(--at-text-primary)' }}>
                        {activeSideLabel} @ {activeBarrier}
                    </div>
                </div>

                <div className='at-kpi-card'>
                    <span className='at-kpi-card__label'>
                        Win Rate: {totalTrades > 0 ? `${winRate}%` : '0.0%'}
                    </span>
                    <div className='at-kpi-card__sub'>
                        ({totalWins}W / {totalLosses}L)
                    </div>
                </div>

                <div className='at-kpi-card'>
                    <div className='at-kpi-card__top'>
                        <span className='at-kpi-card__label'>Engine Status:</span>
                        <span
                            className={`at-status-dot ${
                                running
                                    ? activeContracts > 0
                                        ? 'at-status-dot--live'
                                        : 'at-status-dot--warn'
                                    : ''
                            }`}
                        />
                    </div>
                    <div className='at-kpi-card__sub' style={{ fontWeight: 700, color: 'var(--at-text-primary)' }}>
                        {running
                            ? activeContracts > 0
                                ? 'Trade Live'
                                : inManualRecoveryRef.current
                                ? `Manual Recovery (${recoverySideRef.current === 'DIGITOVER' ? 'OVER' : 'UNDER'} ${recoveryDigitRef.current})`
                                : automateRef.current
                                ? 'Automate Active'
                                : 'Streaming Ticks'
                            : 'Standby'}
                    </div>
                </div>
            </section>

            {/* 2-Column Workspace */}
            <div className='at-split'>
                {/* Left Column: Over / Under Strategy Config */}
                <div className='at-col'>
                    <section className='at-card'>
                        <div className='at-card__header'>
                            <div>
                                <h2 className='at-card__title'>Over / Under Strategy Config</h2>
                                <p className='at-card__subtitle'>
                                    Automated digit barrier entries with adaptive recovery
                                </p>
                            </div>
                        </div>

                        <div className='at-field-grid'>
                            <div className='mw-field'>
                                <label className='mw-label'>Contract Side</label>
                                <MwSelect
                                    value={contractSide}
                                    options={CONTRACT_SIDES.map(s => ({
                                        value: s.value,
                                        label: s.label,
                                    }))}
                                    onChange={v => setContractSide(v as ContractSide)}
                                    disabled={running}
                                />
                            </div>
                            <div className='mw-field'>
                                <label className='mw-label'>Prediction Digit</label>
                                <input
                                    className='mw-input'
                                    type='number'
                                    min='0'
                                    max='9'
                                    step='1'
                                    value={predictionDigit}
                                    onChange={e => setPredictionDigit(e.target.value)}
                                    disabled={running}
                                />
                            </div>
                        </div>

                        <div className='at-field-grid'>
                            <div className='mw-field'>
                                <label className='mw-label'>Stake ($)</label>
                                <input
                                    className='mw-input'
                                    type='number'
                                    min='0.35'
                                    step='0.01'
                                    value={stake}
                                    onChange={e => setStake(e.target.value)}
                                    disabled={running}
                                />
                            </div>
                            <div className='mw-field'>
                                <label className='mw-label'>Martingale (x)</label>
                                <input
                                    className='mw-input'
                                    type='number'
                                    min='1'
                                    step='0.1'
                                    value={martingale}
                                    onChange={e => setMartingale(e.target.value)}
                                    disabled={running}
                                />
                            </div>
                            <div className='mw-field'>
                                <label className='mw-label'>Take Profit ($)</label>
                                <input
                                    className='mw-input'
                                    type='number'
                                    min='0.5'
                                    step='0.5'
                                    value={takeProfit}
                                    onChange={e => setTakeProfit(e.target.value)}
                                    disabled={running}
                                />
                            </div>
                            <div className='mw-field'>
                                <label className='mw-label'>Stop Loss ($)</label>
                                <input
                                    className='mw-input'
                                    type='number'
                                    min='0.5'
                                    step='0.5'
                                    value={stopLoss}
                                    onChange={e => setStopLoss(e.target.value)}
                                    disabled={running}
                                />
                            </div>
                        </div>

                        {/* Recovery Mode Toggle */}
                        <div className='at-toggle-card'>
                            <label className='at-toggle-row'>
                                <div className='at-toggle-row__info'>
                                    <span className='at-toggle-row__title'>
                                        Recovery Mode (RF via Market Killer)
                                    </span>
                                    <span className='at-toggle-row__sub'>
                                        Switches to Rise/Fall recovery on loss
                                    </span>
                                </div>
                                <span className='at-switch'>
                                    <input
                                        type='checkbox'
                                        checked={recoveryMode}
                                        onChange={e => setRecoveryMode(e.target.checked)}
                                        disabled={running}
                                    />
                                    <span className='at-switch__slider' />
                                </span>
                            </label>

                            {recoveryMode && !running && (
                                <div className='mw-field'>
                                    <label className='mw-label'>
                                        Recovery Virtual Loss Threshold
                                    </label>
                                    <input
                                        className='mw-input'
                                        type='number'
                                        min='0'
                                        step='1'
                                        value={recoveryLossThreshold}
                                        onChange={e => setRecoveryLossThreshold(e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Manual Recovery Toggle */}
                        <div className='at-toggle-card'>
                            <label className='at-toggle-row'>
                                <div className='at-toggle-row__info'>
                                    <span className='at-toggle-row__title'>Manual Recovery</span>
                                    <span className='at-toggle-row__sub'>
                                        After 2 losses, switch side &amp; digit
                                    </span>
                                </div>
                                <span className='at-switch'>
                                    <input
                                        type='checkbox'
                                        checked={manualRecovery}
                                        onChange={e => setManualRecovery(e.target.checked)}
                                        disabled={running}
                                    />
                                    <span className='at-switch__slider' />
                                </span>
                            </label>

                            {manualRecovery && !running && (
                                <div className='at-field-grid' style={{ marginBottom: 0 }}>
                                    <div className='mw-field'>
                                        <label className='mw-label'>Recovery Digit</label>
                                        <input
                                            className='mw-input'
                                            type='number'
                                            min='0'
                                            max='9'
                                            step='1'
                                            value={recoveryDigit}
                                            onChange={e => setRecoveryDigit(e.target.value)}
                                        />
                                    </div>
                                    <div className='mw-field'>
                                        <label className='mw-label'>Recovery Side</label>
                                        <MwSelect
                                            value={recoverySide}
                                            options={CONTRACT_SIDES.map(s => ({
                                                value: s.value,
                                                label: s.label,
                                            }))}
                                            onChange={v => setRecoverySide(v as ContractSide)}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Automate Signals Toggle */}
                        <div className='at-toggle-card'>
                            <label className='at-toggle-row'>
                                <div className='at-toggle-row__info'>
                                    <span className='at-toggle-row__title'>Automate Signals</span>
                                    <span className='at-toggle-row__sub'>
                                        Trade highest-confidence barrier automatically
                                    </span>
                                </div>
                                <span className='at-switch'>
                                    <input
                                        type='checkbox'
                                        checked={automate}
                                        onChange={e => setAutomate(e.target.checked)}
                                        disabled={running}
                                    />
                                    <span className='at-switch__slider' />
                                </span>
                            </label>
                        </div>

                        <button
                            type='button'
                            className={`mw-btn${running ? ' mw-btn--stop' : ' mw-btn--kill'}`}
                            onClick={running ? stopKiller : startKiller}
                        >
                            {running ? (
                                <>
                                    <span className='mw-pulse' /> STOP KILLER
                                </>
                            ) : (
                                'RUN O/U KILLER'
                            )}
                        </button>
                    </section>
                </div>

                {/* Right Column: 200-Tick Digit Distribution + Per-Symbol + Execution Feed */}
                <div className='at-col'>
                    <section className='at-card'>
                        <div className='at-card__header'>
                            <div>
                                <h2 className='at-card__title'>
                                    200-Tick Digit Distribution (0–9)
                                </h2>
                                <p className='at-card__subtitle'>
                                    {signalDisplay
                                        ? signalDisplay.strategies.slice(0, 90)
                                        : 'Live frequency distribution across recent 200 ticks'}
                                </p>
                            </div>
                        </div>

                        <div className='at-digit-chart'>
                            {digitFreqs.map((p, i) => {
                                const isBarrier = i === activeBarrier;
                                const isStreak =
                                    digitAnalysis != null && i === digitAnalysis.streakDigit;
                                return (
                                    <div
                                        key={i}
                                        className='at-digit-chart__col'
                                        title={`Digit ${i}: ${p.toFixed(1)}%`}
                                    >
                                        <span
                                            className={`at-digit-chart__num${
                                                isBarrier ? ' at-digit-chart__num--active' : ''
                                            }`}
                                        >
                                            {i}
                                        </span>
                                        <div className='at-digit-chart__pill-track'>
                                            <div
                                                className={`at-digit-chart__pill-fill${
                                                    isBarrier
                                                        ? ' at-digit-chart__pill-fill--active'
                                                        : isStreak
                                                        ? ' at-digit-chart__pill-fill--streak'
                                                        : ''
                                                }`}
                                                style={{
                                                    height: `${Math.max(
                                                        14,
                                                        Math.min(100, p * 5.5)
                                                    )}%`,
                                                }}
                                            />
                                        </div>
                                        <span className='at-digit-chart__pct'>
                                            {digitAnalysis ? `${p.toFixed(0)}%` : '—'}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className='at-digit-chips'>
                            <span className='at-digit-chip'>
                                Streak:{' '}
                                {digitAnalysis
                                    ? `${digitAnalysis.streakDigit}×${digitAnalysis.streakLen}`
                                    : '—'}
                            </span>
                            <span className='at-digit-chip'>
                                Dominant: {digitAnalysis ? digitAnalysis.dominantDigit : '—'}
                            </span>
                            {digitAnalysis?.reversalSignal && (
                                <span className='at-pill-badge at-pill-badge--amber-soft'>
                                    REVERSAL
                                </span>
                            )}
                            <span className='at-digit-chip'>
                                Active Stake: ${globalStakeRef.current.toFixed(2)}
                            </span>
                        </div>
                    </section>

                    {Object.keys(symbolDisplay).length > 0 && (
                        <section className='at-card'>
                            <div className='at-card__header'>
                                <h3 className='at-card__title'>Active Volatility Breakdown</h3>
                            </div>
                            <div className='at-vol-list'>
                                {ALL_SYMBOLS.filter(s => symbolDisplay[s]).map(sym => {
                                    const ss = symbolDisplay[sym];
                                    const baseStake = parseFloat(stake) || 0.35;
                                    const isMgActive = ss.stake > baseStake + 0.001;
                                    return (
                                        <div key={sym} className='at-vol-row'>
                                            <span className='at-vol-row__sym'>
                                                {SYMBOL_LABELS[sym]}
                                            </span>
                                            <span className='at-vol-row__badge'>
                                                {ss.lastSignal}
                                            </span>
                                            <span />
                                            <span className='at-vol-row__wl'>
                                                <span className='mw-win'>{ss.wins}W</span> /{' '}
                                                <span className='mw-loss'>{ss.losses}L</span>
                                                {isMgActive ? ` ($${ss.stake.toFixed(2)})` : ''}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    <section className='at-card'>
                        <div className='at-log-header'>
                            <h3 className='at-card__title'>Live Execution Feed</h3>
                            {logs.length > 0 && (
                                <button
                                    type='button'
                                    className='mw-btn-clear'
                                    onClick={clearLogs}
                                    title='Clear log'
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                        {logs.length === 0 ? (
                            <div className='at-log-empty'>
                                Run O/U Killer to stream live signal evaluations and contract settlements.
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

export default OverUnderKiller;
