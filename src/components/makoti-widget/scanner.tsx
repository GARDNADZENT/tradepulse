import React, { useCallback, useRef, useState, useEffect } from 'react';
import { ALL_SYMBOLS, SYMBOL_LABELS, PIP_SIZES, openMakotiWS, MakotiWS } from './makoti-ws';
import { onNewSystemMessage } from '@/auth/NewDerivAuth';
import { MwSelect } from './mw-select';
import DBotStore from '@/external/bot-skeleton/scratch/dbot-store';

type BotId = 'pvty_kill' | 'rf_v4';

interface SymbolDigitResult {
    symbol: string;
    label: string;
    pcts: number[];
    totalTicks: number;
    qualifies: boolean;
    detail: string;
}

interface SymbolDirectionResult {
    symbol: string;
    label: string;
    choppinessScore: number;
    bodyRatio: number;
    directionChanges: number;
    trendStrength: number;
    recentBodyRatio: number;
    qualifies: boolean;
    detail: string;
}

type ScanResult = SymbolDigitResult | SymbolDirectionResult;

function isDigitResult(r: ScanResult): r is SymbolDigitResult {
    return (r as SymbolDigitResult).pcts !== undefined;
}

function calcDigitPcts(digits: number[]): number[] {
    const counts = Array(10).fill(0);
    digits.forEach(d => { if (d >= 0 && d <= 9) counts[d]++; });
    const total = digits.length || 1;
    return counts.map(c => (c / total) * 100);
}

/* ── Micro-choppiness analysis on the current growing candle ────────────── */
// Analyzes tick-level price action within the current (still-open) candle.
// Measures direction flip frequency, tick-run length, and body indecision.
// Higher score = more random / choppy (bad for 1-tick predictions).
function calcMicroChoppiness(prices: number[]): SymbolDirectionResult {
    const len = prices.length;
    if (len < 5) {
        return { symbol: '', label: '', choppinessScore: 0, bodyRatio: 0, directionChanges: 0, trendStrength: 0, recentBodyRatio: 0, qualifies: false, detail: 'Insufficient ticks' };
    }

    const open = prices[0];
    const close = prices[len - 1];
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    const range = high - low || 1;

    // ── 1. Tick-level direction flips ───────────────────────────────
    let flips = 0, totalDir = 0, prevDir = 0;
    let runSum = 0, runCount = 0, curRun = 1;

    for (let i = 1; i < len; i++) {
        const dir = prices[i] > prices[i - 1] ? 1 : prices[i] < prices[i - 1] ? -1 : 0;
        if (dir === 0) continue;
        totalDir++;
        if (prevDir !== 0 && dir !== prevDir) {
            flips++;
            runSum += curRun;
            runCount++;
            curRun = 1;
        } else {
            curRun++;
        }
        prevDir = dir;
    }
    if (curRun > 0) { runSum += curRun; runCount++; }
    const avgRun = runCount > 0 ? runSum / runCount : 1;
    const flipRate = totalDir > 1 ? flips / (totalDir - 1) : 0;

    // ── 2. Body-to-range ratio (small = indecision = choppy) ─────────
    const body = Math.abs(close - open);
    const bodyRatio = body / range;

    // ── 3. Wick balance (balanced = indecision) ──────────────────────
    const upperWick = high - Math.max(open, close);
    const lowerWick = Math.min(open, close) - low;
    const totalWick = upperWick + lowerWick;
    const wickBalance = totalWick > 0 ? 1 - Math.abs(upperWick - lowerWick) / totalWick : 0.5;

    // ── 4. Reversal oscillation amplitude ───────────────────────────
    const rangePct = range / (open || 1);
    const rangeScore = rangePct > 0 ? Math.min(1, rangePct * 200) : 0;

    // ── Composite score ─────────────────────────────────────────────
    const score = Math.min(100, Math.round(
        flipRate             * 30 +   // frequent direction flips
        Math.max(0, 1 - avgRun / 3) * 25 +  // short tick runs
        (1 - bodyRatio)      * 25 +   // small body = indecision
        wickBalance          * 10 +   // balanced wicks = stalemate
        rangeScore           * 10     // wide range relative to price = noise
    ));

    return {
        symbol: '', label: '',
        choppinessScore: score,
        bodyRatio: Math.round(bodyRatio * 100),
        directionChanges: flips,
        trendStrength: Math.round(avgRun * 10),
        recentBodyRatio: Math.round(rangeScore * 100),
        qualifies: score >= 55,
        detail: `Score: ${score}% | Flips: ${flips}/${totalDir} | Run: ${avgRun.toFixed(1)}t | Body: ${(bodyRatio * 100).toFixed(0)}%`,
    };
}

// ─── Global POC listener (survives WS reconnect via onNewSystemMessage) ──
// Flags ONLY when a real (non-virtual) contract settles as a WIN, so the
// auto-switcher only changes volatility after a real-trade win — never on
// losses and never on virtual-hook wins/losses.
(window as any).__makoti_lastContractSettled = false;

let _pocUnsub: (() => void) | null = null;

function startPocListener() {
    if (_pocUnsub) return;
    _pocUnsub = onNewSystemMessage((event: MessageEvent) => {
        try {
            const d = JSON.parse(event.data);
            const c = d?.proposal_open_contract;
            if (d?.msg_type === 'proposal_open_contract' && c?.is_sold && !c.is_virtual && Number(c.profit) > 0) {
                (window as any).__makoti_lastContractSettled = true;
            }
        } catch (_) {}
    });
}

function stopPocListener() {
    if (_pocUnsub) {
        _pocUnsub();
        _pocUnsub = null;
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   Scanner Component
═══════════════════════════════════════════════════════════════════════════ */
export const Scanner: React.FC = () => {
    const [bot, setBot] = useState<BotId>('pvty_kill');
    const [scanning, setScanning] = useState(false);
    const [progress, setProgress] = useState('');
    const [results, setResults] = useState<ScanResult[]>([]);
    const [bestSymbols, setBestSymbols] = useState<string[]>([]);
    const [autoSwitch, setAutoSwitch] = useState(false);
    const [autoSwitcherActive, setAutoSwitcherActive] = useState(false);
    const [pendingSymbol, setPendingSymbol] = useState('');
    const [notification, setNotification] = useState<{ msg: string; type: 'info' | 'success' | 'warn' } | null>(null);

    // Refs for logic (avoid stale closures)
    const wsRef = useRef<MakotiWS | null>(null);
    const pendingRef = useRef<Set<string>>(new Set());
    const collectedRef = useRef<Map<string, any>>(new Map());
    const botRef = useRef<BotId>('pvty_kill');
    const autoSwitchRef = useRef(false);
    const scanningRef = useRef(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const currentBestRef = useRef<string>('');
    const pendingSymbolRef = useRef<string>('');
    const msgHandlerRef = useRef<(data: any) => void>(() => {});
    const cancelScanRef = useRef<(() => void) | null>(null);

    const showNotify = useCallback((msg: string, type: 'info' | 'success' | 'warn' = 'info') => {
        setNotification({ msg, type });
        setTimeout(() => setNotification(null), 3500);
    }, []);

    const setPending = useCallback((sym: string) => {
        setPendingSymbol(sym);
        pendingSymbolRef.current = sym;
    }, []);

    const clearPending = useCallback(() => {
        setPendingSymbol('');
        pendingSymbolRef.current = '';
    }, []);

    const applySwitch = useCallback((sym: string) => {
        currentBestRef.current = sym;
        clearPending();
        // 1. Runtime override — used by Purchase.js applyAlternateMarketsToCurrentTradeOptions
        try { window.DBot = window.DBot || {}; (window.DBot as any).__force_symbol = sym; } catch (_) {}
        // 2. QuickStrategy store — may or may not exist depending on the active tab
        try { const rs = (window as any).__store_instance; if (rs?.quick_strategy) rs.quick_strategy.setValue('symbol', sym); } catch (_) {}
        // 3. Blockly workspace — updates the trade_definition_market SYMBOL_LIST field.
        //    The block's onchange handler will call DBotStore.instance.dashboard.setBotBuilderSymbol automatically.
        try {
            const ws = (window as any).Blockly?.derivWorkspace;
            if (ws) {
                const b = ws.getAllBlocks().find((bl: any) => bl.type === 'trade_definition_market');
                if (b) b.setFieldValue('SYMBOL_LIST', sym);
            }
        } catch (_) {}
        // 4. Dashboard store — update directly via DBotStore.instance (the canonical access pattern).
        try {
            const store = DBotStore.instance;
            if (store?.dashboard?.setBotBuilderSymbol) store.dashboard.setBotBuilderSymbol(sym);
        } catch (_) {}
        (window as any).__makoti_lastContractSettled = false;
        showNotify(`Volatility Updated: ${SYMBOL_LABELS[sym]}`, 'success');
    }, [showNotify, clearPending]);

    const cleanup = useCallback(() => {
        try { wsRef.current?.close(); } catch (_) {}
        wsRef.current = null;
    }, []);

    /* ── Create persistent WS (reused across auto-scan cycles) ──────────── */
    const ensureWs = useCallback(() => {
        if (wsRef.current && wsRef.current.isOpen()) return wsRef.current;
        cleanup();
        const sendTicksRequest = () => {
            if (!window._newSystemWS || window._newSystemWS.readyState !== WebSocket.OPEN) return;
            const bot = botRef.current;
            const count = bot === 'pvty_kill' ? 1000 : 60;
            setProgress(`Fetching ${count} ticks from all 10 volatilities…`);
            ALL_SYMBOLS.forEach(sym => {
                window._newSystemWS.send(JSON.stringify({ ticks_history: sym, count, end: 'latest', style: 'ticks' }));
            });
        };
        const mws = openMakotiWS(
            (data) => msgHandlerRef.current(data),
            () => { if (scanningRef.current) sendTicksRequest(); },
            () => { cancelScanRef.current?.(); },
            { skipAuth: true }
        );
        wsRef.current = mws;
        return mws;
    }, [cleanup]);

    /* ── Perform a single scan ──────────────────────────────────────────── */
    const performScan = useCallback((initial = false) => {
        if (scanningRef.current) return;
        const currentBot = botRef.current;
        cancelScanRef.current = null;
        scanningRef.current = true;
        setScanning(true);
        setProgress('Connecting to Deriv API…');
        if (initial) { setResults([]); setBestSymbols([]); }

        let finalized = false;
        pendingRef.current = new Set(ALL_SYMBOLS);
        collectedRef.current = new Map();
        const timeoutMs = currentBot === 'pvty_kill' ? 20000 : 10000;
        const scanTimeout = setTimeout(() => {
            if (!finalized) finalize();
        }, timeoutMs);

        msgHandlerRef.current = (data: any) => {
            if (data.error) {
                if (data.msg_type === 'history') {
                    const sym: string = data.echo_req?.ticks_history;
                    if (sym && pendingRef.current.has(sym)) {
                        pendingRef.current.delete(sym);
                        setProgress(`Fetched ${ALL_SYMBOLS.length - pendingRef.current.size} / ${ALL_SYMBOLS.length}…`);
                        if (pendingRef.current.size === 0 && !finalized) { clearTimeout(scanTimeout); finalize(); }
                    }
                }
                return;
            }
            if (data.msg_type === 'history' && data.history?.prices) {
                const sym: string = data.echo_req?.ticks_history;
                if (!sym || !pendingRef.current.has(sym)) return;
                pendingRef.current.delete(sym);
                collectedRef.current.set(sym, data.history.prices.map(Number));
                setProgress(`Fetched ${ALL_SYMBOLS.length - pendingRef.current.size} / ${ALL_SYMBOLS.length}…`);
                if (pendingRef.current.size === 0 && !finalized) { clearTimeout(scanTimeout); finalize(); }
            }
        };

        const finalize = () => {
            if (finalized) return;
            finalized = true;
            cancelScanRef.current = null;
            clearTimeout(scanTimeout);

            let best: string[] = [];
            let bestScore = 0;
            if (currentBot === 'pvty_kill') {
                const scanResults: SymbolDigitResult[] = [];
                collectedRef.current.forEach((prices: number[], sym) => {
                    if (!prices || prices.length < 100) return;
                    const pipSize = PIP_SIZES[sym] || 2;
                    const digits = prices.map(p => Number(Number(p).toFixed(pipSize).slice(-1)));
                    const pcts = calcDigitPcts(digits);
                    const qualifies = pcts[7] < 10 && pcts[8] < 10 && pcts[9] < 10;
                    scanResults.push({
                        symbol: sym, label: SYMBOL_LABELS[sym],
                        pcts, totalTicks: prices.length,
                        qualifies,
                        detail: qualifies ? '✅ 7,8,9 below 10%' : `7:${pcts[7].toFixed(1)}% 8:${pcts[8].toFixed(1)}% 9:${pcts[9].toFixed(1)}%`,
                    });
                });
                scanResults.sort((a, b) => {
                    /* First: qualifying volatilities (all three below 10%) come first */
                    if (a.qualifies && !b.qualifies) return -1;
                    if (!a.qualifies && b.qualifies) return 1;
                    /* Then: lowest sum of 7+8+9 wins */
                    return (a.pcts[7] + a.pcts[8] + a.pcts[9]) - (b.pcts[7] + b.pcts[8] + b.pcts[9]);
                });
                best = scanResults.map(r => r.symbol);
                bestScore = Math.round(Math.max(scanResults[0]?.pcts[7] ?? 0, scanResults[0]?.pcts[8] ?? 0, scanResults[0]?.pcts[9] ?? 0));
                setResults(scanResults);
                setBestSymbols(best.slice(0, 3));
            } else {
                const scanResults: SymbolDirectionResult[] = [];
                collectedRef.current.forEach((prices: number[], sym) => {
                    if (!prices || prices.length < 5) return;
                    const a = calcMicroChoppiness(prices);
                    a.symbol = sym; a.label = SYMBOL_LABELS[sym];
                    scanResults.push(a);
                });
                scanResults.sort((a, b) => b.choppinessScore - a.choppinessScore);
                best = scanResults.map(r => r.symbol);
                bestScore = scanResults[0]?.choppinessScore ?? 0;
                setResults(scanResults);
                setBestSymbols(best.slice(0, 3));
            }

            setScanning(false);
            scanningRef.current = false;

            const bestSym = best[0] || '';
            const bestLabel = bestSym ? SYMBOL_LABELS[bestSym] : '—';

            if (currentBot === 'rf_v4') {
                if (bestSym && bestSym !== currentBestRef.current && autoSwitchRef.current) {
                    if ((window as any).__makoti_lastContractSettled) {
                        applySwitch(bestSym);
                    } else {
                        setPending(bestSym);
                        showNotify(`Waiting for contract settlement to switch to ${bestLabel}…`, 'warn');
                    }
                }

                const ps = pendingSymbolRef.current;
                if (ps && (window as any).__makoti_lastContractSettled && autoSwitchRef.current) {
                    if (best.indexOf(ps) >= 0) applySwitch(ps);
                    else clearPending();
                }

                if (autoSwitchRef.current) {
                    const p = pendingSymbolRef.current;
                    setProgress(p ? `Auto: Pending ${SYMBOL_LABELS[p]} (wait settle)` : `Auto: Best ${bestLabel} (${bestScore}%)`);
                } else {
                    setProgress(`Top: ${bestLabel} (${bestScore}%)`);
                    cleanup();
                }
            } else {
                setProgress(`Top: ${bestLabel} (max 7/8/9: ${bestScore}%)`);
                cleanup();
            }
        };
        cancelScanRef.current = finalize;

        const mws = ensureWs();
        if (mws.isOpen()) {
            if (currentBot === 'pvty_kill') {
                setProgress('Fetching 1000 ticks from all 10 volatilities…');
                ALL_SYMBOLS.forEach(sym => mws.send({ ticks_history: sym, count: 1000, end: 'latest', style: 'ticks' }));
            } else {
                setProgress('Fetching 60 ticks from all 10 volatilities…');
                ALL_SYMBOLS.forEach(sym => mws.send({ ticks_history: sym, count: 60, end: 'latest', style: 'ticks' }));
            }
        }
        // If not open yet, ensureWs will trigger onReady → which fires the requests
    }, [cleanup, ensureWs, showNotify, applySwitch, setPending, clearPending]);

    /* ── Manual analyze button ──────────────────────────────────────────── */
    const analyze = useCallback(() => {
        if (scanningRef.current) return;
        botRef.current = bot;

        if (autoSwitch && bot === 'rf_v4') {
            currentBestRef.current = '';
            clearPending();
            autoSwitchRef.current = true;
            setAutoSwitcherActive(true);
            startPocListener();
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => performScan(false), 3000);
            performScan(true); // initial scan with results cleared
        } else {
            autoSwitchRef.current = false;
            setAutoSwitcherActive(false);
            stopPocListener();
            if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            performScan(true);
        }
    }, [bot, autoSwitch, performScan, clearPending]);

    /* ── Toggle auto-switcher ───────────────────────────────────────────── */
    const toggleAutoSwitch = useCallback(() => {
        setAutoSwitch(prev => {
            if (prev) {
                autoSwitchRef.current = false;
                setAutoSwitcherActive(false);
                clearPending();
                currentBestRef.current = '';
                stopPocListener();
                if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
            }
            return !prev;
        });
    }, [clearPending]);

    useEffect(() => {
        return () => {
            autoSwitchRef.current = false;
            stopPocListener();
            if (intervalRef.current) clearInterval(intervalRef.current);
            try { wsRef.current?.close(); } catch (_) {}
        };
    }, []);

    return (
        <div className='at-view'>
            {notification && (
                <div className={`at-scanner-notif${notification.type === 'warn' ? ' at-scanner-notif--warn' : ''}`}>
                    {notification.msg}
                </div>
            )}

            {/* Horizontal Strategy Scanner Control Bar */}
            <section className='at-scanner-bar'>
                <div className='at-scanner-bar__col'>
                    <label className='mw-label'>Bot Strategy</label>
                    <MwSelect
                        value={bot}
                        options={[
                            { value: 'pvty_kill', label: 'Poverty Killer (1,000 Ticks Digit 7/8/9 Filter)' },
                            { value: 'rf_v4', label: 'Rise/Fall V4 (60-Tick Micro-Choppiness)' },
                        ]}
                        onChange={v => setBot(v as BotId)}
                        disabled={scanning}
                    />
                </div>

                <div className='at-scanner-bar__col at-scanner-bar__col--mid'>
                    <div className='at-scanner-bar__switch-head'>
                        {bot === 'rf_v4' ? (
                            <>
                                <label className='at-switch at-switch--emerald'>
                                    <input
                                        type='checkbox'
                                        checked={autoSwitch}
                                        onChange={toggleAutoSwitch}
                                    />
                                    <span className='at-switch__slider' />
                                </label>
                                <span style={{ fontWeight: 700, fontSize: '14px' }}>Auto Switcher</span>
                                {autoSwitcherActive && (
                                    <span className='at-pill-badge at-pill-badge--emerald-soft'>ACTIVE</span>
                                )}
                                {pendingSymbol && (
                                    <span className='at-pill-badge at-pill-badge--amber-soft'>WIN REQUIRED</span>
                                )}
                            </>
                        ) : (
                            <>
                                <span style={{ fontWeight: 700, fontSize: '14px' }}>Digit 7 / 8 / 9 Filter</span>
                                <span className='at-pill-badge at-pill-badge--emerald-soft'>1,000 TICKS</span>
                            </>
                        )}
                    </div>
                    <p className='at-scanner-bar__desc'>
                        {bot === 'pvty_kill'
                            ? 'Scans 1,000 ticks across all 10 Volatility indices to find calm digit 7, 8, 9 distributions under 10%.'
                            : 'Analyses 60 recent ticks per Volatility index to pinpoint choppy micro-markets — auto-switches every 3s.'}
                    </p>
                </div>

                <div className='at-scanner-bar__col'>
                    <button
                        type='button'
                        className={`mw-btn mw-btn--scan${scanning ? ' mw-btn--busy' : ''}`}
                        onClick={analyze}
                        disabled={scanning}
                    >
                        {scanning ? (
                            <>
                                <span className='mw-spin' /> Analyzing Markets…
                            </>
                        ) : (
                            'Analyze Markets'
                        )}
                    </button>

                    {(bestSymbols.length > 0 || progress) && (
                        <div className='at-scanner-bar__status-pill'>
                            <span>
                                {bestSymbols.length > 0
                                    ? `Best Match: ${bestSymbols.map(s => SYMBOL_LABELS[s]).join(', ')}${progress ? ` • ${progress.replace(/^Top:\s*[^()]+/, '').replace(/[()]/g, '').trim()}` : ''}`
                                    : progress}
                            </span>
                        </div>
                    )}
                </div>
            </section>

            {/* 3-Column Volatility Market Cards Grid */}
            {results.length === 0 ? (
                <div className='at-empty-scan'>
                    <h3 className='at-empty-scan__title'>Ready to Scan All 10 Volatility Indices</h3>
                    <p className='at-empty-scan__sub'>
                        Click &ldquo;Analyze Markets&rdquo; above to stream tick history and rank every synthetic market in real time.
                    </p>
                </div>
            ) : (
                <section className='at-scanner-grid'>
                    {results.map((r, idx) => {
                        const isBest = idx === 0 || bestSymbols.includes(r.symbol);
                        const tickSub = r.symbol.startsWith('1HZ') ? '10 indices • 1s tick' : '10 indices • 2s tick';

                        return (
                            <div
                                key={r.symbol}
                                className={`at-market-card${idx === 0 ? ' at-market-card--best' : ''}`}
                            >
                                <div className='at-market-card__head'>
                                    <div>
                                        <h3 className='at-market-card__title'>{r.label}</h3>
                                        <div className='at-market-card__meta'>
                                            {tickSub} • {r.detail}
                                        </div>
                                    </div>
                                    {idx === 0 ? (
                                        <span className='at-pill-badge at-pill-badge--emerald'>
                                            ★ BEST
                                        </span>
                                    ) : isBest ? (
                                        <span className='at-pill-badge at-pill-badge--emerald-soft'>
                                            MATCH
                                        </span>
                                    ) : null}
                                </div>

                                {isDigitResult(r) ? (
                                    <div className='at-market-card__bars'>
                                        {r.pcts.map((p, i) => {
                                            const isTarget = i >= 7;
                                            const isHot = isTarget && p >= 10;
                                            return (
                                                <div
                                                    key={i}
                                                    className='at-market-card__bar-col'
                                                    title={`Digit ${i}: ${p.toFixed(2)}%`}
                                                >
                                                    <span
                                                        className={`at-market-card__bar-pct${
                                                            isHot
                                                                ? ' at-market-card__bar-pct--hot'
                                                                : isTarget
                                                                ? ' at-market-card__bar-pct--hi'
                                                                : ''
                                                        }`}
                                                    >
                                                        {p.toFixed(1)}%
                                                    </span>
                                                    <div className='at-market-card__bar-track'>
                                                        <div
                                                            className={`at-market-card__bar-fill${
                                                                isHot
                                                                    ? ' at-market-card__bar-fill--hot'
                                                                    : isTarget
                                                                    ? ' at-market-card__bar-fill--target'
                                                                    : ''
                                                            }`}
                                                            style={{
                                                                height: `${Math.max(
                                                                    12,
                                                                    Math.min(100, p * 6.5)
                                                                )}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <span className='at-market-card__bar-digit'>{i}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    (() => {
                                        const dr = r as SymbolDirectionResult;
                                        return (
                                            <div className='at-market-card__chop'>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        fontSize: '13px',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    <span>Choppiness Score</span>
                                                    <span>{dr.choppinessScore}%</span>
                                                </div>
                                                <div className='at-market-card__chop-track'>
                                                    <div
                                                        className='at-market-card__chop-fill'
                                                        style={{
                                                            width: `${dr.choppinessScore}%`,
                                                            background:
                                                                dr.choppinessScore >= 70
                                                                    ? '#10b981'
                                                                    : dr.choppinessScore >= 55
                                                                    ? '#f59e0b'
                                                                    : '#e11d48',
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })()
                                )}
                            </div>
                        );
                    })}
                </section>
            )}
        </div>
    );
};
