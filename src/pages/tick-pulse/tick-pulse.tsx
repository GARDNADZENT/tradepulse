import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base } from '@/external/bot-skeleton';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { useStore } from '@/hooks/useStore';
import { derivBus } from '@/lib/deriv/tick-bus';
import { getTenantBrandName, subscribeActiveTenantConfig } from '@/services/site-config/site-runtime-config';
import { executeLiveDerivTrade, normalizeDerivContractParams } from '@/utils/ai-bot-xml-builder';
import {
    clampPredictionForContract,
    computeNextTickPulseStake,
    createInitialRecoveryState,
    estimateNetProfitRatio,
    formatTickPulseSelectionLabel,
    getTickPulseContractMeta,
    isPredictionDigitAllowed,
    rankTickPulseMarkets,
    resolveTickPulseOrderSpec,
    selectBestReadyTickPulseMarket,
    settleTickPulseRecoveryState,
    TICKPULSE_CONTRACTS,
    TICKPULSE_MARKETS,
    TickPulseContractKey,
    TickPulseEntryCondition,
    TickPulseMarketRanking,
    TickPulseRecoveryState,
    TickPulseSplitCount,
} from './tick-pulse-engine';
import './tick-pulse.scss';

type SubViewTab = 'settings' | 'history';

interface TickPulseHistoryRow {
    contractId: number;
    timestamp: number;
    symbol: string;
    marketLabel: string;
    phaseLabel: string;
    isRecovery: boolean;
    contractLabel: string;
    stake: number;
    profit: number;
    currency: string;
    entrySpot?: string;
    exitSpot?: string;
    status: 'open' | 'won' | 'lost';
}

const HISTORY_STORAGE_KEY = 'tp_tickpulse_history_v1';
const SETTINGS_STORAGE_KEY = 'tp_tickpulse_settings_v2';
const DIGITS_0_TO_9 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function loadSavedHistory(): TickPulseHistoryRow[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.slice(0, 100);
    } catch {
        return [];
    }
}

function saveHistory(rows: TickPulseHistoryRow[]): void {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(rows.slice(0, 100)));
    } catch {
        // ignore storage quota errors
    }
}

function buildMiniSparkPath(values: number[]): string {
    const pts = values.length >= 2 ? values : [0, 0.2, 0.15, 0.45, 0.38, 0.72, 0.9];
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const span = max - min || 1;
    const w = 74;
    const h = 30;
    return pts
        .map((v, i) => {
            const x = (i / Math.max(1, pts.length - 1)) * w;
            const y = h - 4 - ((v - min) / span) * (h - 8);
            return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');
}

const TickPulse: React.FC = observer(() => {
    const store = useStore();
    const client = store?.client;
    const { journal, transactions, summary_card, run_panel } = store || ({} as any);

    const [brandName, setBrandName] = useState<string>(() => getTenantBrandName());
    useEffect(() => {
        return subscribeActiveTenantConfig(() => {
            setBrandName(getTenantBrandName());
        });
    }, []);

    const activeCurrency =
        client?.currency || (api_base?.account_info as any)?.currency || 'USD';

    const initialSaved = useMemo(() => {
        if (typeof window === 'undefined') return null;
        try {
            const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }, []);

    const [subTab, setSubTab] = useState<SubViewTab>('settings');
    const [beforeContract, setBeforeContract] = useState<TickPulseContractKey>(
        initialSaved?.beforeContract || 'OVER'
    );
    const [beforePrediction, setBeforePrediction] = useState<number>(
        typeof initialSaved?.beforePrediction === 'number' ? initialSaved.beforePrediction : 2
    );
    const [afterContract, setAfterContract] = useState<TickPulseContractKey>(
        initialSaved?.afterContract || 'EVEN'
    );
    const [afterPrediction, setAfterPrediction] = useState<number>(
        typeof initialSaved?.afterPrediction === 'number' ? initialSaved.afterPrediction : 4
    );

    const [initialStakeInput, setInitialStakeInput] = useState<string>(
        initialSaved?.initialStakeInput || '1.00'
    );
    const [recoverySplits, setRecoverySplits] = useState<TickPulseSplitCount>(
        initialSaved?.recoverySplits === 1 || initialSaved?.recoverySplits === 3
            ? initialSaved.recoverySplits
            : 2
    );
    const [takeProfitInput, setTakeProfitInput] = useState<string>(
        initialSaved?.takeProfitInput || '20.00'
    );
    const [stopLossInput, setStopLossInput] = useState<string>(
        initialSaved?.stopLossInput || '25.00'
    );

    // Continuous All-13-Markets Auto-Switch ON by default
    const [autoBestMarket, setAutoBestMarket] = useState<boolean>(
        initialSaved?.autoBestMarket !== false
    );
    const [pinnedMarket, setPinnedMarket] = useState<string | null>(
        initialSaved?.autoBestMarket === false && initialSaved?.pinnedMarket
            ? String(initialSaved.pinnedMarket)
            : null
    );
    const [executingSymbol, setExecutingSymbol] = useState<string | null>(null);

    const [noEntryCondition, setNoEntryCondition] = useState<boolean>(
        initialSaved?.noEntryCondition !== false
    );
    const [customEntryCondition, setCustomEntryCondition] = useState<TickPulseEntryCondition>(
        initialSaved?.customEntryCondition || 'OPPOSITE_2'
    );

    const [tickVersion, setTickVersion] = useState<number>(0);
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [isExecuting, setIsExecuting] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<string>('');
    const [hasErrorBanner, setHasErrorBanner] = useState<boolean>(false);

    const [sessionPL, setSessionPL] = useState<number>(0);
    const [recoveryState, setRecoveryState] = useState<TickPulseRecoveryState>(() =>
        createInitialRecoveryState(recoverySplits)
    );
    const [historyRows, setHistoryRows] = useState<TickPulseHistoryRow[]>(() => loadSavedHistory());
    const [liveAfterProfitRatio, setLiveAfterProfitRatio] = useState<number | null>(null);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(
                SETTINGS_STORAGE_KEY,
                JSON.stringify({
                    beforeContract,
                    beforePrediction,
                    afterContract,
                    afterPrediction,
                    initialStakeInput,
                    recoverySplits,
                    takeProfitInput,
                    stopLossInput,
                    autoBestMarket,
                    pinnedMarket,
                    noEntryCondition,
                    customEntryCondition,
                })
            );
        } catch {
            // ignore
        }
    }, [
        beforeContract,
        beforePrediction,
        afterContract,
        afterPrediction,
        initialStakeInput,
        recoverySplits,
        takeProfitInput,
        stopLossInput,
        autoBestMarket,
        pinnedMarket,
        noEntryCondition,
        customEntryCondition,
    ]);

    // Subscribe simultaneously to ALL 13 Deriv Volatility Indices
    useEffect(() => {
        const allSymbols = TICKPULSE_MARKETS.map(m => m.symbol);
        let rafPending = false;
        const bump = () => {
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                setTickVersion(v => v + 1);
            });
        };

        const unsubHist = derivBus.onHistory(() => bump());
        const unsubTick = derivBus.onTick(() => {
            bump();
            void onAnyMarketTickRef.current?.();
        });
        const release = derivBus.subscribe(allSymbols);
        bump();

        return () => {
            unsubHist();
            unsubTick();
            release();
        };
    }, []);

    // Real-time ranking across ALL 13 Volatility Indices for the currently active phase
    const rankedMarkets: TickPulseMarketRanking[] = useMemo(() => {
        void tickVersion;
        const activeKey = recoveryState.inRecovery ? afterContract : beforeContract;
        const activePred = recoveryState.inRecovery ? afterPrediction : beforePrediction;
        return rankTickPulseMarkets({
            getTicks: s => derivBus.getTicks(s),
            getPipSize: s => derivBus.getPipSize(s),
            contractKey: activeKey,
            prediction: activePred,
        });
    }, [
        tickVersion,
        beforeContract,
        beforePrediction,
        afterContract,
        afterPrediction,
        recoveryState.inRecovery,
    ]);

    const topRankedMarket = rankedMarkets[0] || null;
    const effectiveTargetMarket = useMemo(() => {
        if (!autoBestMarket && pinnedMarket) {
            return rankedMarkets.find(m => m.symbol === pinnedMarket) || topRankedMarket;
        }
        return topRankedMarket;
    }, [autoBestMarket, pinnedMarket, rankedMarkets, topRankedMarket]);

    // Query live Deriv proposal payout ratio on current target symbol for exact Split-1/2/3 recovery sizing
    useEffect(() => {
        let cancelled = false;
        const symbolToQuote = effectiveTargetMarket?.symbol || '1HZ75V';
        const orderSpec = resolveTickPulseOrderSpec(afterContract, afterPrediction);
        const norm = normalizeDerivContractParams({
            contractType: orderSpec.apiContractType,
            duration: orderSpec.duration,
            barrier: orderSpec.barrier,
        });

        const fetchLiveRatio = async () => {
            try {
                const transport: any = api_base?.api?.send ? api_base.api : chart_api?.api;
                if (!transport?.send) return;
                const req: Record<string, any> = {
                    proposal: 1,
                    amount: 1,
                    basis: 'stake',
                    contract_type: norm.apiContractType,
                    currency: activeCurrency || 'USD',
                    duration: norm.duration,
                    duration_unit: norm.durationUnit,
                    symbol: symbolToQuote,
                };
                if (norm.barrier !== undefined) req.barrier = norm.barrier;

                const res = await transport.send(req);
                const ask = Number(res?.proposal?.ask_price || 1);
                const payout = Number(res?.proposal?.payout || 0);
                if (!cancelled && payout > ask && ask > 0) {
                    setLiveAfterProfitRatio((payout - ask) / ask);
                }
            } catch {
                if (!cancelled) setLiveAfterProfitRatio(null);
            }
        };

        const timer = window.setTimeout(() => {
            void fetchLiveRatio();
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [afterContract, afterPrediction, effectiveTargetMarket?.symbol, activeCurrency]);

    const marketsConnectedStats = useMemo(() => {
        void tickVersion;
        let readyMarkets = 0;
        let totalTicks = 0;
        for (const m of TICKPULSE_MARKETS) {
            const len = derivBus.getTicks(m.symbol).length;
            if (len > 0) {
                readyMarkets += 1;
                totalTicks += Math.min(120, len);
            }
        }
        const avgTicks = readyMarkets > 0 ? Math.round(totalTicks / readyMarkets) : 0;
        return { readyMarkets, avgTicks };
    }, [tickVersion]);

    const sessionTradesStats = useMemo(() => {
        const total = historyRows.length;
        const settledRows = historyRows.filter(r => r.status === 'won' || r.status === 'lost');
        const settled = settledRows.length;
        const latest50 = settledRows.slice(0, 50);
        const wins50 = latest50.filter(r => r.status === 'won').length;
        const winRate50 = latest50.length > 0 ? Math.round((wins50 / latest50.length) * 100) : 0;

        // Build cumulative equity curve for KPI sparkline
        const chronological = [...settledRows].slice(0, 24).reverse();
        let cum = 0;
        const curve = [0];
        for (const r of chronological) {
            cum += Number(r.profit || 0);
            curve.push(cum);
        }

        return { total, settled, winRate50, plSparkPath: buildMiniSparkPath(curve) };
    }, [historyRows]);

    // Mutable runtime refs for crisp zero-stale-closure multi-market execution
    const runningRef = useRef(false);
    const inFlightRef = useRef(false);
    const lastTradedEpochsRef = useRef<Record<string, number>>({});
    const sessionPLRef = useRef<number>(0);
    const recoveryRef = useRef<TickPulseRecoveryState>(createInitialRecoveryState(recoverySplits));
    const nextTradeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const effectiveAfterRatio =
        liveAfterProfitRatio ?? estimateNetProfitRatio(afterContract, afterPrediction);

    const runtimeCfgRef = useRef({
        beforeContract,
        beforePrediction,
        afterContract,
        afterPrediction,
        initialStake: Math.max(0.35, Number(initialStakeInput) || 1),
        recoverySplits,
        takeProfit: Math.max(0.5, Number(takeProfitInput) || 20),
        stopLoss: Math.max(0.5, Number(stopLossInput) || 25),
        autoBestMarket,
        pinnedMarket,
        entryCondition: (noEntryCondition ? 'NONE' : customEntryCondition) as TickPulseEntryCondition,
        currency: activeCurrency,
        afterProfitRatio: effectiveAfterRatio,
    });

    runtimeCfgRef.current = {
        beforeContract,
        beforePrediction,
        afterContract,
        afterPrediction,
        initialStake: Math.max(0.35, Number(initialStakeInput) || 1),
        recoverySplits,
        takeProfit: Math.max(0.5, Number(takeProfitInput) || 20),
        stopLoss: Math.max(0.5, Number(stopLossInput) || 25),
        autoBestMarket,
        pinnedMarket,
        entryCondition: (noEntryCondition ? 'NONE' : customEntryCondition) as TickPulseEntryCondition,
        currency: activeCurrency,
        afterProfitRatio: effectiveAfterRatio,
    };

    const stopEngine = useCallback((reason: string, isError = false) => {
        runningRef.current = false;
        inFlightRef.current = false;
        if (nextTradeTimerRef.current !== undefined) {
            clearTimeout(nextTradeTimerRef.current);
            nextTradeTimerRef.current = undefined;
        }
        setIsRunning(false);
        setIsExecuting(false);
        setExecutingSymbol(null);
        setHasErrorBanner(isError);
        setStatusMessage(reason);
    }, []);

    useEffect(() => {
        return () => {
            runningRef.current = false;
            inFlightRef.current = false;
            if (nextTradeTimerRef.current !== undefined) {
                clearTimeout(nextTradeTimerRef.current);
            }
        };
    }, []);

    const upsertHistoryRow = useCallback((nextRow: TickPulseHistoryRow) => {
        setHistoryRows(prev => {
            const idx = prev.findIndex(r => r.contractId === nextRow.contractId);
            let updated: TickPulseHistoryRow[];
            if (idx >= 0) {
                updated = [...prev];
                updated[idx] = nextRow;
            } else {
                updated = [nextRow, ...prev].slice(0, 100);
            }
            saveHistory(updated);
            return updated;
        });
    }, []);

    // Evaluates ALL 13 markets and immediately executes on the #1 highest-scoring ready market
    const attemptAutoBestTrade = useCallback(async () => {
        if (!runningRef.current || inFlightRef.current) return;
        const cfg = runtimeCfgRef.current;
        const rec = recoveryRef.current;
        const activeKey = rec.inRecovery ? cfg.afterContract : cfg.beforeContract;
        const activePred = rec.inRecovery ? cfg.afterPrediction : cfg.beforePrediction;

        const chosen = selectBestReadyTickPulseMarket({
            getTicks: s => derivBus.getTicks(s),
            getPipSize: s => derivBus.getPipSize(s),
            contractKey: activeKey,
            prediction: activePred,
            condition: cfg.entryCondition,
            lastTradedEpochs: lastTradedEpochsRef.current,
            pinnedSymbol: cfg.autoBestMarket ? null : cfg.pinnedMarket,
        });

        if (!chosen) return;

        const { ranking, latestEpoch } = chosen;
        const symbol = ranking.symbol;
        const marketLabel = ranking.label;

        const stakeToUse = computeNextTickPulseStake({
            initialStake: cfg.initialStake,
            recoveryState: rec,
            afterNetProfitRatio: cfg.afterProfitRatio,
        });

        const orderSpec = resolveTickPulseOrderSpec(activeKey, activePred);
        const splitStepNumber = rec.totalSplits - rec.remainingSplits + 1;
        const phaseLabel = rec.inRecovery
            ? `After loss · Split ${Math.min(rec.totalSplits, Math.max(1, splitStepNumber))}/${rec.totalSplits}`
            : 'Before loss';

        inFlightRef.current = true;
        setIsExecuting(true);
        setExecutingSymbol(symbol);
        if (latestEpoch) {
            lastTradedEpochsRef.current[symbol] = latestEpoch;
        }

        setHasErrorBanner(false);
        setStatusMessage(
            `${cfg.autoBestMarket ? 'AUTO #1' : 'PINNED'} · ${phaseLabel}: ${orderSpec.displayLabel} on ${marketLabel} (${ranking.hitRatePct}% Hit · ${stakeToUse.toFixed(2)} ${cfg.currency})`
        );

        let settledOnce = false;
        let watchdog: ReturnType<typeof setTimeout> | undefined;

        const handleTerminal = (poc: any, contractId: number, buyPrice: number) => {
            if (settledOnce) return;
            settledOnce = true;
            if (watchdog !== undefined) clearTimeout(watchdog);

            const profit = Number(poc?.profit ?? 0);
            const entrySpot =
                poc?.entry_spot_display_value ?? poc?.entry_tick_display_value ?? poc?.entry_spot;
            const exitSpot =
                poc?.exit_spot_display_value ?? poc?.exit_tick_display_value ?? poc?.exit_spot;

            upsertHistoryRow({
                contractId,
                timestamp: Date.now(),
                symbol,
                marketLabel,
                phaseLabel,
                isRecovery: rec.inRecovery,
                contractLabel: orderSpec.displayLabel,
                stake: Number(poc?.buy_price ?? buyPrice),
                profit,
                currency: poc?.currency || cfg.currency,
                entrySpot: entrySpot !== undefined ? String(entrySpot) : undefined,
                exitSpot: exitSpot !== undefined ? String(exitSpot) : undefined,
                status: profit >= 0 ? 'won' : 'lost',
            });

            const nextPL = Number((sessionPLRef.current + profit).toFixed(2));
            sessionPLRef.current = nextPL;
            setSessionPL(nextPL);

            const nextRecovery = settleTickPulseRecoveryState({
                prev: recoveryRef.current,
                profit,
                configuredSplits: cfg.recoverySplits,
            });
            recoveryRef.current = nextRecovery;
            setRecoveryState(nextRecovery);

            setIsExecuting(false);
            setExecutingSymbol(null);
            inFlightRef.current = false;

            if (!runningRef.current) return;

            if (nextPL >= cfg.takeProfit) {
                const cleanRec = createInitialRecoveryState(cfg.recoverySplits);
                recoveryRef.current = cleanRec;
                setRecoveryState(cleanRec);
                stopEngine(
                    `Take profit reached: +${nextPL.toFixed(2)} ${cfg.currency} (last trade on ${marketLabel})`
                );
                return;
            }

            if (nextPL <= -Math.abs(cfg.stopLoss)) {
                const cleanRec = createInitialRecoveryState(cfg.recoverySplits);
                recoveryRef.current = cleanRec;
                setRecoveryState(cleanRec);
                stopEngine(
                    `Stop loss reached: ${nextPL.toFixed(2)} ${cfg.currency} (last trade on ${marketLabel})`,
                    true
                );
                return;
            }

            if (nextRecovery.inRecovery) {
                const nextStake = computeNextTickPulseStake({
                    initialStake: cfg.initialStake,
                    recoveryState: nextRecovery,
                    afterNetProfitRatio: runtimeCfgRef.current.afterProfitRatio,
                });
                const nextStep = nextRecovery.totalSplits - nextRecovery.remainingSplits + 1;
                setStatusMessage(
                    `Recovery Split ${nextStep}/${nextRecovery.totalSplits} — Scanning all 13 markets for best ${formatTickPulseSelectionLabel(cfg.afterContract, cfg.afterPrediction)} setup (${nextStake.toFixed(2)} ${cfg.currency})…`
                );
            } else {
                setStatusMessage(
                    `Won +${profit.toFixed(2)} ${cfg.currency} on ${marketLabel} — Auto-scanning all 13 markets for next #1 target…`
                );
            }

            // Immediately scan all 13 markets for the next ready #1 market
            if (nextTradeTimerRef.current !== undefined) clearTimeout(nextTradeTimerRef.current);
            nextTradeTimerRef.current = setTimeout(() => {
                void onAnyMarketTickRef.current?.();
            }, 140);
        };

        watchdog = setTimeout(() => {
            if (!settledOnce) {
                settledOnce = true;
                inFlightRef.current = false;
                setIsExecuting(false);
                setExecutingSymbol(null);
            }
        }, 30000);

        try {
            const res = await executeLiveDerivTrade({
                symbol,
                contractType: orderSpec.apiContractType,
                stake: stakeToUse,
                duration: orderSpec.duration,
                barrier: orderSpec.barrier,
                currency: cfg.currency,
                stores: { journal, transactions, summary_card, run_panel },
                onContractUpdate: (poc, isTerminal) => {
                    if (isTerminal) {
                        handleTerminal(poc, Number(poc?.contract_id || 0), stakeToUse);
                    }
                },
            });

            if (!settledOnce) {
                upsertHistoryRow({
                    contractId: res.contractId,
                    timestamp: Date.now(),
                    symbol,
                    marketLabel,
                    phaseLabel,
                    isRecovery: rec.inRecovery,
                    contractLabel: orderSpec.displayLabel,
                    stake: res.buyPrice,
                    profit: 0,
                    currency: cfg.currency,
                    status: 'open',
                });
            }
        } catch (err: any) {
            if (watchdog !== undefined) clearTimeout(watchdog);
            settledOnce = true;
            const msg = err?.message || 'Live Deriv trade failed.';
            stopEngine(msg, true);
        }
    }, [journal, transactions, summary_card, run_panel, stopEngine, upsertHistoryRow]);

    const onAnyMarketTickRef = useRef(attemptAutoBestTrade);
    onAnyMarketTickRef.current = attemptAutoBestTrade;

    const handleSelectBeforeContract = (key: TickPulseContractKey) => {
        setBeforeContract(key);
        setBeforePrediction(prev => clampPredictionForContract(key, prev));
    };

    const handleSelectAfterContract = (key: TickPulseContractKey) => {
        setAfterContract(key);
        setAfterPrediction(prev => clampPredictionForContract(key, prev));
    };

    const handleFindBestMarket = () => {
        const best = rankedMarkets[0];
        setAutoBestMarket(true);
        setPinnedMarket(null);
        setHasErrorBanner(false);
        if (best) {
            const edgeStr = best.edgePct >= 0 ? `+${best.edgePct}%` : `${best.edgePct}%`;
            setStatusMessage(
                `AUTO-SCANNING ALL 13 MARKETS — Best Market: ${best.label} (${best.hitRatePct}% Hit Rate · ${edgeStr} Edge)`
            );
        }
    };

    const handleToggleLoadAndRun = () => {
        if (isRunning) {
            stopEngine('Auto-scanner paused — Ready to scan all 13 markets');
            return;
        }

        const hasAuth =
            Boolean(client?.is_logged_in) ||
            Boolean((api_base as any)?.is_authorized) ||
            Boolean(typeof window !== 'undefined' && window.localStorage?.getItem('authToken'));

        if (!hasAuth) {
            setHasErrorBanner(true);
            setStatusMessage(
                'Connect your Deriv account (Login with Deriv or PAT Login) to start auto-trading.'
            );
            return;
        }

        const cleanRec = createInitialRecoveryState(recoverySplits);
        recoveryRef.current = cleanRec;
        setRecoveryState(cleanRec);
        inFlightRef.current = false;
        runningRef.current = true;
        setIsRunning(true);
        setHasErrorBanner(false);

        const targetName = effectiveTargetMarket?.label || 'All 13 Volatility Markets';
        setStatusMessage(
            autoBestMarket
                ? `AUTO-SCANNING ALL 13 MARKETS — Trading #1 Best Market: ${targetName}`
                : `Running Pinned Market — ${targetName}`
        );

        void attemptAutoBestTrade();
    };

    const handleResetSession = () => {
        if (isRunning) return;
        sessionPLRef.current = 0;
        setSessionPL(0);
        const cleanRec = createInitialRecoveryState(recoverySplits);
        recoveryRef.current = cleanRec;
        setRecoveryState(cleanRec);
        setHasErrorBanner(false);
        setStatusMessage('');
    };

    const handleClearHistory = () => {
        setHistoryRows([]);
        saveHistory([]);
    };

    const beforeMeta = getTickPulseContractMeta(beforeContract);
    const afterMeta = getTickPulseContractMeta(afterContract);

    const liveBannerMessage = useMemo(() => {
        if (statusMessage) return statusMessage;
        if (effectiveTargetMarket) {
            const edgeStr =
                effectiveTargetMarket.edgePct >= 0
                    ? `+${effectiveTargetMarket.edgePct}%`
                    : `${effectiveTargetMarket.edgePct}%`;
            if (autoBestMarket) {
                return `AUTO-SCANNING ALL 13 MARKETS — Best Market: ${effectiveTargetMarket.label} (${effectiveTargetMarket.hitRatePct}% Hit Rate · ${edgeStr} Edge)`;
            }
            return `PINNED MARKET — ${effectiveTargetMarket.label} (${effectiveTargetMarket.hitRatePct}% Hit Rate · ${edgeStr} Edge)`;
        }
        return 'AUTO-SCANNING ALL 13 MARKETS — Streaming live Volatility ticks…';
    }, [statusMessage, effectiveTargetMarket, autoBestMarket]);

    const statusBadgeText = isExecuting
        ? 'EXECUTING'
        : isRunning
          ? recoveryState.inRecovery
              ? 'RECOVERY'
              : 'AUTO LIVE'
          : autoBestMarket
            ? 'AUTO READY'
            : 'PINNED';

    const formattedPL = `${sessionPL > 0 ? '+' : ''}${sessionPL.toFixed(2)} ${activeCurrency}`;
    const activePhaseLabel = recoveryState.inRecovery
        ? formatTickPulseSelectionLabel(afterContract, afterPrediction)
        : formatTickPulseSelectionLabel(beforeContract, beforePrediction);

    return (
        <div className='tp-tickpulse' data-testid='tickpulse-page'>
            <div className='tp-tickpulse__shell'>
                {/* Elevated Header & Live Radar Banner */}
                <header className='tp-tickpulse__header-card'>
                    <div className='tp-tickpulse__brand'>
                        <span className='tp-tickpulse__radar-orb' aria-hidden='true'>
                            <svg width='18' height='18' viewBox='0 0 24 24' fill='none'>
                                <path
                                    d='M3 12h3.5l2.2-5 3.6 10 2.7-6.5 1.8 1.5H21'
                                    stroke='currentColor'
                                    strokeWidth='2.2'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                />
                            </svg>
                        </span>
                        <span>TickPulse</span>
                        <span className='tp-tickpulse__brand-sep'>·</span>
                        <span className='tp-tickpulse__brand-sub'>{brandName}</span>
                    </div>

                    <div
                        className={`tp-tickpulse__banner${
                            hasErrorBanner
                                ? ' tp-tickpulse__banner--error'
                                : recoveryState.inRecovery && isRunning
                                  ? ' tp-tickpulse__banner--recovery'
                                  : isRunning
                                    ? ' tp-tickpulse__banner--running'
                                    : ''
                        }`}
                        data-testid='tickpulse-status-banner'
                    >
                        <span
                            className={`tp-tickpulse__banner-dot${
                                hasErrorBanner
                                    ? ' tp-tickpulse__banner-dot--error'
                                    : recoveryState.inRecovery && isRunning
                                      ? ' tp-tickpulse__banner-dot--recovery'
                                      : isRunning
                                        ? ' tp-tickpulse__banner-dot--running'
                                        : ''
                            }`}
                        />
                        <span>{liveBannerMessage}</span>
                    </div>

                    <span
                        className={`tp-tickpulse__status-pill${
                            recoveryState.inRecovery && isRunning
                                ? ' tp-tickpulse__status-pill--recovery'
                                : isRunning
                                  ? ' tp-tickpulse__status-pill--running'
                                  : ''
                        }`}
                        data-testid='tickpulse-status-pill'
                    >
                        {statusBadgeText}
                    </span>
                </header>

                {/* 4 Elevated Top-Accented KPI Cards */}
                <section className='tp-tickpulse__kpis' aria-label='TickPulse live metrics'>
                    <div className='tp-tickpulse__kpi-card tp-tickpulse__kpi-card--emerald'>
                        <div className='tp-tickpulse__kpi-main'>
                            <span className='tp-tickpulse__kpi-label'>Session P/L:</span>
                            <span
                                className={`tp-tickpulse__kpi-value${
                                    sessionPL > 0
                                        ? ' tp-tickpulse__kpi-value--pos'
                                        : sessionPL < 0
                                          ? ' tp-tickpulse__kpi-value--neg'
                                          : ''
                                }`}
                                data-testid='tickpulse-session-pl'
                            >
                                {formattedPL}
                            </span>
                        </div>
                        <svg viewBox='0 0 74 30' className='tp-tickpulse__kpi-spark' aria-hidden='true'>
                            <path
                                d={sessionTradesStats.plSparkPath}
                                fill='none'
                                stroke={sessionPL < 0 ? '#f87171' : '#10b981'}
                                strokeWidth='2.2'
                                strokeLinecap='round'
                            />
                        </svg>
                    </div>

                    <div className='tp-tickpulse__kpi-card tp-tickpulse__kpi-card--amber'>
                        <div className='tp-tickpulse__kpi-main'>
                            <span className='tp-tickpulse__kpi-label'>Trades / Settled:</span>
                            <span
                                className='tp-tickpulse__kpi-value'
                                data-testid='tickpulse-trades-settled'
                            >
                                {sessionTradesStats.total} / {sessionTradesStats.settled}
                            </span>
                        </div>
                        <svg viewBox='0 0 74 30' className='tp-tickpulse__kpi-spark' aria-hidden='true'>
                            <path
                                d='M2,24 L18,18 L32,20 L48,11 L62,13 L72,6'
                                fill='none'
                                stroke='#f59e0b'
                                strokeWidth='2'
                                strokeLinecap='round'
                            />
                        </svg>
                    </div>

                    <div className='tp-tickpulse__kpi-card tp-tickpulse__kpi-card--slate'>
                        <div className='tp-tickpulse__kpi-main'>
                            <span className='tp-tickpulse__kpi-label'>Win Rate (Latest 50):</span>
                            <span className='tp-tickpulse__kpi-value' data-testid='tickpulse-win-rate'>
                                {sessionTradesStats.winRate50}%
                            </span>
                        </div>
                        <svg viewBox='0 0 74 30' className='tp-tickpulse__kpi-spark' aria-hidden='true'>
                            <path
                                d='M2,22 L16,16 L30,19 L44,10 L58,12 L72,5'
                                fill='none'
                                stroke='#38bdf8'
                                strokeWidth='2'
                                strokeLinecap='round'
                            />
                        </svg>
                    </div>

                    <div className='tp-tickpulse__kpi-card tp-tickpulse__kpi-card--blue'>
                        <div className='tp-tickpulse__kpi-main'>
                            <span className='tp-tickpulse__kpi-label'>Live Scanner:</span>
                            <span
                                className='tp-tickpulse__kpi-value'
                                data-testid='tickpulse-markets-ticks'
                            >
                                {marketsConnectedStats.readyMarkets} / {marketsConnectedStats.avgTicks}
                            </span>
                        </div>
                        <svg viewBox='0 0 74 30' className='tp-tickpulse__kpi-spark' aria-hidden='true'>
                            <path
                                d='M2,18 L14,12 L26,16 L38,7 L50,14 L62,6 L72,9'
                                fill='none'
                                stroke='#0066ff'
                                strokeWidth='2.2'
                                strokeLinecap='round'
                            />
                        </svg>
                    </div>
                </section>

                {/* Sub-View Switcher */}
                <nav className='tp-tickpulse__subtabs' aria-label='TickPulse views'>
                    <div className='tp-tickpulse__subtabs-left'>
                        <button
                            type='button'
                            className={`tp-tickpulse__subtab${
                                subTab === 'settings' ? ' tp-tickpulse__subtab--active' : ''
                            }`}
                            onClick={() => setSubTab('settings')}
                        >
                            Settings
                        </button>
                        <button
                            type='button'
                            className={`tp-tickpulse__subtab${
                                subTab === 'history' ? ' tp-tickpulse__subtab--active' : ''
                            }`}
                            onClick={() => setSubTab('history')}
                        >
                            <span>Trade history</span>
                            {historyRows.length > 0 && (
                                <span className='tp-tickpulse__subtab-count'>
                                    {historyRows.length}
                                </span>
                            )}
                        </button>
                    </div>

                    <div className='tp-tickpulse__mode-indicator'>
                        <span>Scanner Target:</span>
                        <strong>
                            {autoBestMarket
                                ? `All 13 Markets → #1 ${topRankedMarket?.shortLabel || 'Best'}`
                                : `Pinned: ${effectiveTargetMarket?.shortLabel || pinnedMarket}`}
                        </strong>
                    </div>
                </nav>

                {subTab === 'settings' ? (
                    <div className='tp-tickpulse__workspace-grid'>
                        {/* Left Column: Strategy & Split-Recovery Deck */}
                        <section className='tp-tickpulse__card'>
                            <div className='tp-tickpulse__section-head'>
                                <h2 className='tp-tickpulse__section-title'>
                                    Strategy &amp; Split-Recovery Deck
                                </h2>
                                <div className='tp-tickpulse__phase-summary'>
                                    <span className='tp-tickpulse__phase-chip tp-tickpulse__phase-chip--before'>
                                        Before:{' '}
                                        {formatTickPulseSelectionLabel(
                                            beforeContract,
                                            beforePrediction
                                        )}
                                    </span>
                                    <span className='tp-tickpulse__phase-chip tp-tickpulse__phase-chip--after'>
                                        After:{' '}
                                        {formatTickPulseSelectionLabel(afterContract, afterPrediction)}
                                    </span>
                                </div>
                            </div>

                            <div className='tp-tickpulse__trade-rows'>
                                {/* Before Loss Framed Container */}
                                <div className='tp-tickpulse__trade-panel tp-tickpulse__trade-panel--before'>
                                    <div className='tp-tickpulse__trade-panel-head'>
                                        <span className='tp-tickpulse__row-label'>Before loss</span>
                                        <span className='tp-tickpulse__row-tag'>
                                            Primary Entry ·{' '}
                                            {formatTickPulseSelectionLabel(
                                                beforeContract,
                                                beforePrediction
                                            )}
                                        </span>
                                    </div>

                                    <div
                                        className='tp-tickpulse__contract-grid'
                                        role='group'
                                        aria-label='Before loss contract'
                                    >
                                        {TICKPULSE_CONTRACTS.map(ct => (
                                            <button
                                                key={`before-${ct.key}`}
                                                type='button'
                                                disabled={isRunning}
                                                className={`tp-tickpulse__pill${
                                                    beforeContract === ct.key
                                                        ? ' tp-tickpulse__pill--active-blue'
                                                        : ''
                                                }`}
                                                onClick={() => handleSelectBeforeContract(ct.key)}
                                                data-testid={`before-contract-${ct.key}`}
                                            >
                                                {ct.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div
                                        className={`tp-tickpulse__digit-grid${
                                            !beforeMeta.usesPrediction
                                                ? ' tp-tickpulse__digit-grid--muted'
                                                : ''
                                        }`}
                                        role='group'
                                        aria-label='Before loss prediction digit'
                                    >
                                        {DIGITS_0_TO_9.map(d => {
                                            const allowed = isPredictionDigitAllowed(
                                                beforeContract,
                                                d
                                            );
                                            const active =
                                                beforeMeta.usesPrediction &&
                                                clampPredictionForContract(
                                                    beforeContract,
                                                    beforePrediction
                                                ) === d;
                                            return (
                                                <button
                                                    key={`before-digit-${d}`}
                                                    type='button'
                                                    disabled={isRunning || !allowed}
                                                    className={`tp-tickpulse__digit-pill${
                                                        active
                                                            ? ' tp-tickpulse__digit-pill--active-blue'
                                                            : ''
                                                    }`}
                                                    onClick={() => setBeforePrediction(d)}
                                                    data-testid={`before-digit-${d}`}
                                                >
                                                    {d}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* After Loss Framed Container */}
                                <div className='tp-tickpulse__trade-panel tp-tickpulse__trade-panel--after'>
                                    <div className='tp-tickpulse__trade-panel-head'>
                                        <span className='tp-tickpulse__row-label'>After loss</span>
                                        <span className='tp-tickpulse__row-tag'>
                                            Split-{recoverySplits} Recovery ·{' '}
                                            {formatTickPulseSelectionLabel(
                                                afterContract,
                                                afterPrediction
                                            )}
                                        </span>
                                    </div>

                                    <div
                                        className='tp-tickpulse__contract-grid'
                                        role='group'
                                        aria-label='After loss contract'
                                    >
                                        {TICKPULSE_CONTRACTS.map(ct => (
                                            <button
                                                key={`after-${ct.key}`}
                                                type='button'
                                                disabled={isRunning}
                                                className={`tp-tickpulse__pill${
                                                    afterContract === ct.key
                                                        ? ' tp-tickpulse__pill--active-amber'
                                                        : ''
                                                }`}
                                                onClick={() => handleSelectAfterContract(ct.key)}
                                                data-testid={`after-contract-${ct.key}`}
                                            >
                                                {ct.label}
                                            </button>
                                        ))}
                                    </div>

                                    <div
                                        className={`tp-tickpulse__digit-grid${
                                            !afterMeta.usesPrediction
                                                ? ' tp-tickpulse__digit-grid--muted'
                                                : ''
                                        }`}
                                        role='group'
                                        aria-label='After loss prediction digit'
                                    >
                                        {DIGITS_0_TO_9.map(d => {
                                            const allowed = isPredictionDigitAllowed(afterContract, d);
                                            const active =
                                                afterMeta.usesPrediction &&
                                                clampPredictionForContract(
                                                    afterContract,
                                                    afterPrediction
                                                ) === d;
                                            return (
                                                <button
                                                    key={`after-digit-${d}`}
                                                    type='button'
                                                    disabled={isRunning || !allowed}
                                                    className={`tp-tickpulse__digit-pill${
                                                        active
                                                            ? ' tp-tickpulse__digit-pill--active-amber'
                                                            : ''
                                                    }`}
                                                    onClick={() => setAfterPrediction(d)}
                                                    data-testid={`after-digit-${d}`}
                                                >
                                                    {d}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* 4-Column Stake, Splits, TP & SL */}
                            <div className='tp-tickpulse__params-grid'>
                                <label className='tp-tickpulse__field'>
                                    <span className='tp-tickpulse__field-label'>
                                        <span>Initial Stake</span>
                                        <span className='tp-tickpulse__field-hint'>
                                            {activeCurrency}
                                        </span>
                                    </span>
                                    <input
                                        type='number'
                                        min='0.35'
                                        step='0.01'
                                        disabled={isRunning}
                                        value={initialStakeInput}
                                        onChange={e => setInitialStakeInput(e.target.value)}
                                        className='tp-tickpulse__input'
                                        data-testid='tickpulse-initial-stake'
                                    />
                                </label>

                                <div className='tp-tickpulse__field'>
                                    <span className='tp-tickpulse__field-label'>
                                        <span>Recovery Splits</span>
                                        <span className='tp-tickpulse__field-hint'>
                                            ~{Math.round(effectiveAfterRatio * 100)}%
                                        </span>
                                    </span>
                                    <div
                                        className='tp-tickpulse__splits-group'
                                        role='group'
                                        aria-label='Recovery splits'
                                    >
                                        {([1, 2, 3] as TickPulseSplitCount[]).map(sp => (
                                            <button
                                                key={`split-${sp}`}
                                                type='button'
                                                disabled={isRunning}
                                                className={`tp-tickpulse__split-btn${
                                                    recoverySplits === sp
                                                        ? ' tp-tickpulse__split-btn--active'
                                                        : ''
                                                }`}
                                                onClick={() => {
                                                    setRecoverySplits(sp);
                                                    if (!recoveryRef.current.inRecovery) {
                                                        const next = createInitialRecoveryState(sp);
                                                        recoveryRef.current = next;
                                                        setRecoveryState(next);
                                                    }
                                                }}
                                                data-testid={`tickpulse-split-${sp}`}
                                            >
                                                Split-{sp}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <label className='tp-tickpulse__field'>
                                    <span className='tp-tickpulse__field-label'>
                                        <span>Take Profit</span>
                                        <span className='tp-tickpulse__field-hint'>
                                            {activeCurrency}
                                        </span>
                                    </span>
                                    <input
                                        type='number'
                                        min='0.5'
                                        step='0.5'
                                        disabled={isRunning}
                                        value={takeProfitInput}
                                        onChange={e => setTakeProfitInput(e.target.value)}
                                        className='tp-tickpulse__input'
                                        data-testid='tickpulse-take-profit'
                                    />
                                </label>

                                <label className='tp-tickpulse__field'>
                                    <span className='tp-tickpulse__field-label'>
                                        <span>Stop Loss</span>
                                        <span className='tp-tickpulse__field-hint'>
                                            {activeCurrency}
                                        </span>
                                    </span>
                                    <input
                                        type='number'
                                        min='0.5'
                                        step='0.5'
                                        disabled={isRunning}
                                        value={stopLossInput}
                                        onChange={e => setStopLossInput(e.target.value)}
                                        className='tp-tickpulse__input'
                                        data-testid='tickpulse-stop-loss'
                                    />
                                </label>
                            </div>

                            {/* Auto-Switch Best Market & Entry Condition Switches */}
                            <div className='tp-tickpulse__switches-box'>
                                <div className='tp-tickpulse__switch-row'>
                                    <label className='tp-tickpulse__toggle-label'>
                                        <button
                                            type='button'
                                            role='switch'
                                            aria-checked={autoBestMarket}
                                            disabled={isRunning}
                                            className={`tp-tickpulse__switch${
                                                autoBestMarket ? ' tp-tickpulse__switch--on' : ''
                                            }`}
                                            onClick={() => {
                                                setAutoBestMarket(prev => {
                                                    const next = !prev;
                                                    if (next) setPinnedMarket(null);
                                                    else if (!pinnedMarket && topRankedMarket) {
                                                        setPinnedMarket(topRankedMarket.symbol);
                                                    }
                                                    return next;
                                                });
                                            }}
                                            data-testid='tickpulse-auto-best-switch'
                                        >
                                            <span
                                                className={`tp-tickpulse__switch-knob${
                                                    autoBestMarket
                                                        ? ' tp-tickpulse__switch-knob--on'
                                                        : ''
                                                }`}
                                            />
                                        </button>
                                        <span>
                                            Auto-Switch to #1 Best Market Every Trade (All 13 Markets)
                                        </span>
                                    </label>

                                    <button
                                        type='button'
                                        disabled={isRunning}
                                        className='tp-tickpulse__scan-btn'
                                        onClick={handleFindBestMarket}
                                        data-testid='tickpulse-find-best-market'
                                    >
                                        Find Best Market
                                    </button>
                                </div>

                                <div className='tp-tickpulse__switch-row'>
                                    <label className='tp-tickpulse__toggle-label'>
                                        <button
                                            type='button'
                                            role='switch'
                                            aria-checked={noEntryCondition}
                                            disabled={isRunning}
                                            className={`tp-tickpulse__switch${
                                                noEntryCondition ? ' tp-tickpulse__switch--on' : ''
                                            }`}
                                            onClick={() => setNoEntryCondition(v => !v)}
                                            data-testid='tickpulse-no-entry-switch'
                                        >
                                            <span
                                                className={`tp-tickpulse__switch-knob${
                                                    noEntryCondition
                                                        ? ' tp-tickpulse__switch-knob--on'
                                                        : ''
                                                }`}
                                            />
                                        </button>
                                        <span>No entry condition after choosing best market</span>
                                    </label>

                                    {!noEntryCondition && (
                                        <select
                                            className='tp-tickpulse__market-select'
                                            disabled={isRunning}
                                            value={customEntryCondition}
                                            aria-label='Entry streak condition'
                                            onChange={e =>
                                                setCustomEntryCondition(
                                                    e.target.value as TickPulseEntryCondition
                                                )
                                            }
                                        >
                                            <option value='OPPOSITE_1'>Wait 1 opposite tick</option>
                                            <option value='OPPOSITE_2'>Wait 2 opposite ticks</option>
                                            <option value='OPPOSITE_3'>Wait 3 opposite ticks</option>
                                            <option value='CONFIRM_1'>Confirm 1 matching tick</option>
                                        </select>
                                    )}
                                </div>
                            </div>

                            {/* Primary Gradient CTA + Risk Disclaimer */}
                            <div className='tp-tickpulse__cta-stack'>
                                <div className='tp-tickpulse__cta-group'>
                                    <button
                                        type='button'
                                        className={`tp-tickpulse__run-btn${
                                            isRunning ? ' tp-tickpulse__run-btn--stop' : ''
                                        }`}
                                        onClick={handleToggleLoadAndRun}
                                        data-testid='tickpulse-load-and-run'
                                    >
                                        <span aria-hidden='true'>{isRunning ? '■' : '▶'}</span>
                                        <span>
                                            {isRunning
                                                ? 'Stop Auto-Trading'
                                                : autoBestMarket
                                                  ? 'Load & Auto-Trade Best Market'
                                                  : `Load & Run (${
                                                        effectiveTargetMarket?.shortLabel || 'Pinned'
                                                    })`}
                                        </span>
                                    </button>

                                    {!isRunning &&
                                        (sessionPL !== 0 || recoveryState.inRecovery) && (
                                            <button
                                                type='button'
                                                className='tp-tickpulse__reset-btn'
                                                onClick={handleResetSession}
                                            >
                                                Reset
                                            </button>
                                        )}
                                </div>

                                <div className='tp-tickpulse__disclaimer'>
                                    <strong>Risk disclaimer:</strong> Automated trading can lose the
                                    full stake. Recovery splits do not guarantee profit. Stop loss is
                                    checked after settlement and may be exceeded.
                                </div>
                            </div>
                        </section>

                        {/* Right Column: Live 13-Market Radar (Ranked Real-Time) */}
                        <aside
                            className='tp-tickpulse__radar-card'
                            aria-label='Live 13-Market Radar'
                            data-testid='tickpulse-live-radar'
                        >
                            <div className='tp-tickpulse__section-head'>
                                <h2 className='tp-tickpulse__section-title'>
                                    Live 13-Market Radar (Ranked Real-Time)
                                </h2>
                                {!autoBestMarket && (
                                    <button
                                        type='button'
                                        disabled={isRunning}
                                        className='tp-tickpulse__scan-btn'
                                        onClick={() => {
                                            setAutoBestMarket(true);
                                            setPinnedMarket(null);
                                        }}
                                    >
                                        Auto All 13
                                    </button>
                                )}
                            </div>

                            <div className='tp-tickpulse__radar-sub'>
                                <span>
                                    Ranking live edge for{' '}
                                    <strong style={{ color: '#f8fafc' }}>{activePhaseLabel}</strong>
                                </span>
                                <span>
                                    {autoBestMarket
                                        ? 'Click any market to pin · Auto #1 active'
                                        : 'Pinned mode · Click Auto All 13 to unlock'}
                                </span>
                            </div>

                            <div className='tp-tickpulse__radar-list'>
                                {rankedMarkets.map((m, idx) => {
                                    const isRank1 = idx === 0;
                                    const isPinned = !autoBestMarket && pinnedMarket === m.symbol;
                                    const isExec = executingSymbol === m.symbol;
                                    const edgeSign = m.edgePct >= 0 ? `+${m.edgePct}%` : `${m.edgePct}%`;

                                    return (
                                        <button
                                            key={m.symbol}
                                            type='button'
                                            disabled={isRunning}
                                            className={
                                                'tp-tickpulse__radar-row' +
                                                (isRank1 && autoBestMarket
                                                    ? ' tp-tickpulse__radar-row--best'
                                                    : '') +
                                                (isExec ? ' tp-tickpulse__radar-row--executing' : '') +
                                                (isPinned ? ' tp-tickpulse__radar-row--pinned' : '')
                                            }
                                            onClick={() => {
                                                if (isPinned) {
                                                    setAutoBestMarket(true);
                                                    setPinnedMarket(null);
                                                } else {
                                                    setAutoBestMarket(false);
                                                    setPinnedMarket(m.symbol);
                                                    setStatusMessage(
                                                        `Pinned ${m.label} (${m.hitRatePct}% Hit Rate)`
                                                    );
                                                }
                                            }}
                                            data-testid={`radar-row-${m.symbol}`}
                                        >
                                            <span
                                                className={
                                                    'tp-tickpulse__rank-num' +
                                                    (idx === 0
                                                        ? ' tp-tickpulse__rank-num--top1'
                                                        : idx === 1
                                                          ? ' tp-tickpulse__rank-num--top2'
                                                          : idx === 2
                                                            ? ' tp-tickpulse__rank-num--top3'
                                                            : '')
                                                }
                                            >
                                                #{idx + 1}
                                            </span>

                                            <div className='tp-tickpulse__radar-market'>
                                                <div className='tp-tickpulse__radar-name-line'>
                                                    <span className='tp-tickpulse__radar-name'>
                                                        {m.shortLabel.replace(/^V/, 'Volatility ')}
                                                    </span>
                                                    {isExec ? (
                                                        <span className='tp-tickpulse__target-badge tp-tickpulse__target-badge--exec'>
                                                            ⚡ TRADING
                                                        </span>
                                                    ) : isPinned ? (
                                                        <span className='tp-tickpulse__target-badge tp-tickpulse__target-badge--pin'>
                                                            PINNED
                                                        </span>
                                                    ) : isRank1 && autoBestMarket ? (
                                                        <span className='tp-tickpulse__target-badge'>
                                                            ★ BEST TARGET
                                                        </span>
                                                    ) : null}
                                                </div>
                                                <span className='tp-tickpulse__radar-quote'>
                                                    Spot {m.lastQuote} · {m.tickCount}t
                                                </span>
                                            </div>

                                            <div className='tp-tickpulse__radar-meter'>
                                                <div className='tp-tickpulse__bar-track'>
                                                    <div
                                                        className='tp-tickpulse__bar-fill'
                                                        style={{
                                                            width: `${Math.min(
                                                                100,
                                                                Math.max(8, m.hitRatePct)
                                                            )}%`,
                                                        }}
                                                    />
                                                </div>
                                                <span className='tp-tickpulse__hit-pct'>
                                                    {m.hitRatePct}%
                                                </span>
                                                <span
                                                    className={`tp-tickpulse__edge-pill${
                                                        m.edgePct < 0
                                                            ? ' tp-tickpulse__edge-pill--neg'
                                                            : ''
                                                    }`}
                                                >
                                                    {edgeSign}
                                                </span>
                                            </div>

                                            <div className='tp-tickpulse__digits-mini'>
                                                {m.lastDigits.slice(-6).map((item, dIdx) => (
                                                    <span
                                                        key={`${m.symbol}-d-${dIdx}`}
                                                        className={`tp-tickpulse__digit-chip${
                                                            item.matched
                                                                ? ' tp-tickpulse__digit-chip--win'
                                                                : ''
                                                        }`}
                                                    >
                                                        {item.digit}
                                                    </span>
                                                ))}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </aside>
                    </div>
                ) : (
                    /* Trade History Sub-View */
                    <section className='tp-tickpulse__card' data-testid='tickpulse-history-panel'>
                        <div className='tp-tickpulse__history-head'>
                            <h2 className='tp-tickpulse__section-title'>TickPulse Trade History</h2>
                            {historyRows.length > 0 && (
                                <button
                                    type='button'
                                    disabled={isRunning}
                                    className='tp-tickpulse__reset-btn'
                                    onClick={handleClearHistory}
                                >
                                    Clear history
                                </button>
                            )}
                        </div>

                        {historyRows.length === 0 ? (
                            <div className='tp-tickpulse__history-empty'>
                                No TickPulse trades recorded yet. Configure your Before / After loss
                                contracts and click <strong>Load &amp; Auto-Trade Best Market</strong>.
                            </div>
                        ) : (
                            <div className='tp-tickpulse__table-wrap'>
                                <table className='tp-tickpulse__table'>
                                    <thead>
                                        <tr>
                                            <th>Time</th>
                                            <th>Market</th>
                                            <th>Phase</th>
                                            <th>Contract</th>
                                            <th>Spots</th>
                                            <th>Stake</th>
                                            <th>P/L</th>
                                            <th>Status</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyRows.map(row => (
                                            <tr key={row.contractId}>
                                                <td>
                                                    {new Date(row.timestamp).toLocaleTimeString()}
                                                </td>
                                                <td>{row.marketLabel}</td>
                                                <td>
                                                    <span
                                                        className={`tp-tickpulse__phase-chip ${
                                                            row.isRecovery
                                                                ? 'tp-tickpulse__phase-chip--after'
                                                                : 'tp-tickpulse__phase-chip--before'
                                                        }`}
                                                    >
                                                        {row.phaseLabel}
                                                    </span>
                                                </td>
                                                <td>{row.contractLabel}</td>
                                                <td>
                                                    {row.entrySpot
                                                        ? `${row.entrySpot}${
                                                              row.exitSpot ? ` → ${row.exitSpot}` : ''
                                                          }`
                                                        : '—'}
                                                </td>
                                                <td>
                                                    {row.stake.toFixed(2)} {row.currency}
                                                </td>
                                                <td
                                                    style={{
                                                        color:
                                                            row.status === 'open'
                                                                ? '#94a3b8'
                                                                : row.profit >= 0
                                                                  ? '#10b981'
                                                                  : '#ef4444',
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    {row.status === 'open'
                                                        ? 'Pending…'
                                                        : `${row.profit > 0 ? '+' : ''}${row.profit.toFixed(
                                                              2
                                                          )} ${row.currency}`}
                                                </td>
                                                <td>
                                                    <span
                                                        className={`tp-tickpulse__badge tp-tickpulse__badge--${row.status}`}
                                                    >
                                                        {row.status.toUpperCase()}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                )}
            </div>
        </div>
    );
});

export default TickPulse;
