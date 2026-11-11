import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base } from '@/external/bot-skeleton';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';
import { useStore } from '@/hooks/useStore';
import { derivBus } from '@/lib/deriv/tick-bus';
import { getTenantBrandName, subscribeActiveTenantConfig } from '@/services/site-config/site-runtime-config';
import { executeLiveDerivTrade, normalizeDerivContractParams } from '@/utils/ai-bot-xml-builder';
import {
    checkTickPulseEntryCondition,
    clampPredictionForContract,
    computeNextTickPulseStake,
    createInitialRecoveryState,
    estimateNetProfitRatio,
    formatTickPulseSelectionLabel,
    getTickPulseContractMeta,
    isPredictionDigitAllowed,
    rankTickPulseMarkets,
    resolveTickPulseOrderSpec,
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
const SETTINGS_STORAGE_KEY = 'tp_tickpulse_settings_v1';
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

    // Saved settings defaults
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

    const [selectedMarket, setSelectedMarket] = useState<string>(
        initialSaved?.selectedMarket || ''
    );
    const [noEntryCondition, setNoEntryCondition] = useState<boolean>(
        initialSaved?.noEntryCondition !== false
    );
    const [customEntryCondition, setCustomEntryCondition] = useState<TickPulseEntryCondition>(
        initialSaved?.customEntryCondition || 'OPPOSITE_2'
    );

    const [tickVersion, setTickVersion] = useState<number>(0);
    const [isRunning, setIsRunning] = useState<boolean>(false);
    const [isExecuting, setIsExecuting] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<string>(
        'Ready to scan — Choose contracts, then find best market'
    );
    const [hasErrorBanner, setHasErrorBanner] = useState<boolean>(false);

    const [sessionPL, setSessionPL] = useState<number>(0);
    const [recoveryState, setRecoveryState] = useState<TickPulseRecoveryState>(() =>
        createInitialRecoveryState(recoverySplits)
    );
    const [historyRows, setHistoryRows] = useState<TickPulseHistoryRow[]>(() => loadSavedHistory());
    const [liveAfterProfitRatio, setLiveAfterProfitRatio] = useState<number | null>(null);

    // Persist user settings cleanly
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
                    selectedMarket,
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
        selectedMarket,
        noEntryCondition,
        customEntryCondition,
    ]);

    // Subscribe to all 13 Volatility Indices on DerivTickBus
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
        const unsubTick = derivBus.onTick((sym, tk) => {
            bump();
            void onIncomingMarketTickRef.current?.(sym, tk);
        });
        const release = derivBus.subscribe(allSymbols);
        bump();

        return () => {
            unsubHist();
            unsubTick();
            release();
        };
    }, []);

    // Query live Deriv proposal payout ratio for exact Recovery Split sizing
    useEffect(() => {
        let cancelled = false;
        const symbolToQuote = selectedMarket || '1HZ75V';
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

        setLiveAfterProfitRatio(null);
        const timer = window.setTimeout(() => {
            void fetchLiveRatio();
        }, 220);

        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [afterContract, afterPrediction, selectedMarket, activeCurrency]);

    // Ranked markets across all 13 Volatility Indices
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

    const activeMarketInfo = useMemo(() => {
        if (!rankedMarkets.length) return null;
        if (selectedMarket) {
            const match = rankedMarkets.find(m => m.symbol === selectedMarket);
            if (match) return match;
        }
        return rankedMarkets[0];
    }, [rankedMarkets, selectedMarket]);

    const sessionTradesStats = useMemo(() => {
        const total = historyRows.length;
        const settledRows = historyRows.filter(r => r.status === 'won' || r.status === 'lost');
        const settled = settledRows.length;
        const latest50 = settledRows.slice(0, 50);
        const wins50 = latest50.filter(r => r.status === 'won').length;
        const winRate50 = latest50.length > 0 ? Math.round((wins50 / latest50.length) * 100) : 0;
        return { total, settled, winRate50 };
    }, [historyRows]);

    //Mutable runtime refs for crisp zero-stale-closure tick execution
    const runningRef = useRef(false);
    const inFlightRef = useRef(false);
    const lastTradedEpochRef = useRef<number>(0);
    const sessionPLRef = useRef<number>(0);
    const recoveryRef = useRef<TickPulseRecoveryState>(createInitialRecoveryState(recoverySplits));

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
        selectedMarket,
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
        selectedMarket: selectedMarket || activeMarketInfo?.symbol || '1HZ75V',
        entryCondition: (noEntryCondition ? 'NONE' : customEntryCondition) as TickPulseEntryCondition,
        currency: activeCurrency,
        afterProfitRatio: effectiveAfterRatio,
    };

    const stopEngine = useCallback((reason: string, isError = false) => {
        runningRef.current = false;
        inFlightRef.current = false;
        setIsRunning(false);
        setIsExecuting(false);
        setHasErrorBanner(isError);
        setStatusMessage(reason);
    }, []);

    useEffect(() => {
        return () => {
            runningRef.current = false;
            inFlightRef.current = false;
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

    const executeTickPulseCycle = useCallback(
        async (symbol: string, latestTick?: { t: number; price: number }) => {
            if (!runningRef.current || inFlightRef.current) return;
            const cfg = runtimeCfgRef.current;
            if (symbol !== cfg.selectedMarket) return;

            const rawTicks = derivBus.getTicks(symbol);
            if (!rawTicks.length) return;
            const pipSize = derivBus.getPipSize(symbol);
            const latestEpoch = latestTick?.t ?? rawTicks[rawTicks.length - 1]?.t ?? 0;
            if (latestEpoch && lastTradedEpochRef.current === latestEpoch) return;

            const rec = recoveryRef.current;
            const activeKey = rec.inRecovery ? cfg.afterContract : cfg.beforeContract;
            const activePred = rec.inRecovery ? cfg.afterPrediction : cfg.beforePrediction;

            const readyToEnter = checkTickPulseEntryCondition({
                condition: cfg.entryCondition,
                contractKey: activeKey,
                prediction: activePred,
                rawTicks,
                pipSize,
            });
            if (!readyToEnter) return;

            const stakeToUse = computeNextTickPulseStake({
                initialStake: cfg.initialStake,
                recoveryState: rec,
                afterNetProfitRatio: cfg.afterProfitRatio,
            });

            const orderSpec = resolveTickPulseOrderSpec(activeKey, activePred);
            const marketDef = TICKPULSE_MARKETS.find(m => m.symbol === symbol);
            const marketLabel = marketDef?.label || symbol;
            const splitStepNumber = rec.totalSplits - rec.remainingSplits + 1;
            const phaseLabel = rec.inRecovery
                ? `After loss · Split ${Math.min(rec.totalSplits, Math.max(1, splitStepNumber))}/${rec.totalSplits}`
                : 'Before loss';

            inFlightRef.current = true;
            setIsExecuting(true);
            if (latestEpoch) lastTradedEpochRef.current = latestEpoch;

            setHasErrorBanner(false);
            setStatusMessage(
                `${phaseLabel}: Executing ${orderSpec.displayLabel} on ${marketLabel} (${stakeToUse.toFixed(2)} ${cfg.currency})…`
            );

            let settledOnce = false;
            let watchdog: ReturnType<typeof setTimeout> | undefined;

            const handleTerminal = (poc: any, contractId: number, buyPrice: number) => {
                if (settledOnce) return;
                settledOnce = true;
                if (watchdog !== undefined) clearTimeout(watchdog);

                const profit = Number(poc?.profit ?? 0);
                const entrySpot = poc?.entry_spot_display_value ?? poc?.entry_tick_display_value ?? poc?.entry_spot;
                const exitSpot = poc?.exit_spot_display_value ?? poc?.exit_tick_display_value ?? poc?.exit_spot;

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
                inFlightRef.current = false;

                if (!runningRef.current) return;

                if (nextPL >= cfg.takeProfit) {
                    const cleanRec = createInitialRecoveryState(cfg.recoverySplits);
                    recoveryRef.current = cleanRec;
                    setRecoveryState(cleanRec);
                    stopEngine(
                        `Take profit reached: +${nextPL.toFixed(2)} ${cfg.currency} on ${marketLabel}`
                    );
                    return;
                }

                if (nextPL <= -Math.abs(cfg.stopLoss)) {
                    const cleanRec = createInitialRecoveryState(cfg.recoverySplits);
                    recoveryRef.current = cleanRec;
                    setRecoveryState(cleanRec);
                    stopEngine(
                        `Stop loss reached: ${nextPL.toFixed(2)} ${cfg.currency} on ${marketLabel}`,
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
                        `Recovery Active (Split ${nextStep}/${nextRecovery.totalSplits}) — ${marketLabel} · Next: ${formatTickPulseSelectionLabel(cfg.afterContract, cfg.afterPrediction)} (${nextStake.toFixed(2)} ${cfg.currency})`
                    );
                } else {
                    setStatusMessage(
                        `Won +${profit.toFixed(2)} ${cfg.currency} — Running Before loss: ${formatTickPulseSelectionLabel(cfg.beforeContract, cfg.beforePrediction)} on ${marketLabel}`
                    );
                }
            };

            watchdog = setTimeout(() => {
                if (!settledOnce) {
                    settledOnce = true;
                    inFlightRef.current = false;
                    setIsExecuting(false);
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
        },
        [journal, transactions, summary_card, run_panel, stopEngine, upsertHistoryRow]
    );

    const onIncomingMarketTickRef = useRef(executeTickPulseCycle);
    onIncomingMarketTickRef.current = executeTickPulseCycle;

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
        if (!best) return;
        setSelectedMarket(best.symbol);
        setHasErrorBanner(false);
        setStatusMessage(
            `Ready to scan — Best Market: ${best.label} (${best.hitRatePct}% Hit Rate)`
        );
    };

    const handleToggleLoadAndRun = () => {
        if (isRunning) {
            stopEngine('Stopped — Ready to scan or adjust contracts');
            return;
        }

        const hasAuth =
            Boolean(client?.is_logged_in) ||
            Boolean((api_base as any)?.is_authorized) ||
            Boolean(typeof window !== 'undefined' && window.localStorage?.getItem('authToken'));

        if (!hasAuth) {
            setHasErrorBanner(true);
            setStatusMessage(
                'Connect your Deriv account (Login with Deriv or PAT Login) to run TickPulse.'
            );
            return;
        }

        let targetSymbol = selectedMarket;
        let targetMarketInfo = rankedMarkets.find(m => m.symbol === targetSymbol) || null;
        if (!targetSymbol || !targetMarketInfo) {
            targetMarketInfo = rankedMarkets[0] || null;
            targetSymbol = targetMarketInfo?.symbol || '1HZ75V';
            setSelectedMarket(targetSymbol);
        }

        const cleanRec = createInitialRecoveryState(recoverySplits);
        recoveryRef.current = cleanRec;
        setRecoveryState(cleanRec);
        inFlightRef.current = false;
        runningRef.current = true;
        setIsRunning(true);
        setHasErrorBanner(false);

        const marketName = targetMarketInfo?.label || targetSymbol;
        setStatusMessage(
            `Running Live — ${marketName} · Before loss: ${formatTickPulseSelectionLabel(beforeContract, beforePrediction)}`
        );

        runtimeCfgRef.current.selectedMarket = targetSymbol;
        const currentTicks = derivBus.getTicks(targetSymbol);
        if (currentTicks.length > 0) {
            void executeTickPulseCycle(targetSymbol, currentTicks[currentTicks.length - 1]);
        }
    };

    const handleResetSession = () => {
        if (isRunning) return;
        sessionPLRef.current = 0;
        setSessionPL(0);
        const cleanRec = createInitialRecoveryState(recoverySplits);
        recoveryRef.current = cleanRec;
        setRecoveryState(cleanRec);
        setHasErrorBanner(false);
        setStatusMessage('Session reset — Ready to scan');
    };

    const handleClearHistory = () => {
        setHistoryRows([]);
        saveHistory([]);
    };

    const beforeMeta = getTickPulseContractMeta(beforeContract);
    const afterMeta = getTickPulseContractMeta(afterContract);

    const statusBadgeText = isExecuting
        ? 'Executing'
        : isRunning
          ? recoveryState.inRecovery
              ? 'Recovery'
              : 'Running'
          : 'Ready';

    const formattedPL = `${sessionPL > 0 ? '+' : ''}${sessionPL.toFixed(2)} ${activeCurrency}`;

    return (
        <div className='tp-tickpulse' data-testid='tickpulse-page'>
            <div className='tp-tickpulse__shell'>
                {/* Header & Live Status Banner */}
                <header className='tp-tickpulse__header-card'>
                    <div className='tp-tickpulse__brand'>
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
                        <span>{statusMessage}</span>
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

                {/* 4 Live KPI Cards */}
                <section className='tp-tickpulse__kpis' aria-label='TickPulse live metrics'>
                    <div className='tp-tickpulse__kpi-card'>
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

                    <div className='tp-tickpulse__kpi-card'>
                        <span className='tp-tickpulse__kpi-label'>Trades / settled:</span>
                        <span className='tp-tickpulse__kpi-value' data-testid='tickpulse-trades-settled'>
                            {sessionTradesStats.total} / {sessionTradesStats.settled}
                        </span>
                    </div>

                    <div className='tp-tickpulse__kpi-card'>
                        <span className='tp-tickpulse__kpi-label'>Win rate (latest 50):</span>
                        <span className='tp-tickpulse__kpi-value' data-testid='tickpulse-win-rate'>
                            {sessionTradesStats.winRate50}%
                        </span>
                    </div>

                    <div className='tp-tickpulse__kpi-card'>
                        <span className='tp-tickpulse__kpi-label'>Markets / ticks:</span>
                        <span className='tp-tickpulse__kpi-value' data-testid='tickpulse-markets-ticks'>
                            {marketsConnectedStats.readyMarkets} / {marketsConnectedStats.avgTicks}
                        </span>
                    </div>
                </section>

                {/* Sub-View Switcher: Settings | Trade history */}
                <nav className='tp-tickpulse__subtabs' aria-label='TickPulse views'>
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
                            <span className='tp-tickpulse__subtab-count'>{historyRows.length}</span>
                        )}
                    </button>
                </nav>

                {subTab === 'settings' ? (
                    <section className='tp-tickpulse__card'>
                        <div className='tp-tickpulse__section-head'>
                            <h2 className='tp-tickpulse__section-title'>
                                Choose your trades — Before / After loss
                            </h2>
                            <div className='tp-tickpulse__phase-summary'>
                                <span className='tp-tickpulse__phase-chip tp-tickpulse__phase-chip--before'>
                                    Before: {formatTickPulseSelectionLabel(beforeContract, beforePrediction)}
                                </span>
                                <span className='tp-tickpulse__phase-chip tp-tickpulse__phase-chip--after'>
                                    After: {formatTickPulseSelectionLabel(afterContract, afterPrediction)}
                                </span>
                            </div>
                        </div>

                        <div className='tp-tickpulse__trade-rows'>
                            {/* Before Loss Selector */}
                            <div className='tp-tickpulse__trade-block'>
                                <div className='tp-tickpulse__row-label'>Before loss</div>
                                <div className='tp-tickpulse__selectors-stack'>
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
                                            const allowed = isPredictionDigitAllowed(beforeContract, d);
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
                            </div>

                            {/* After Loss Selector */}
                            <div className='tp-tickpulse__trade-block'>
                                <div className='tp-tickpulse__row-label'>After loss</div>
                                <div className='tp-tickpulse__selectors-stack'>
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
                        </div>

                        {/* 4-Column Money & Recovery Splits Row */}
                        <div className='tp-tickpulse__params-grid'>
                            <label className='tp-tickpulse__field'>
                                <span className='tp-tickpulse__field-label'>
                                    <span>Initial stake</span>
                                    <span className='tp-tickpulse__field-hint'>({activeCurrency})</span>
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
                                    <span>Recovery splits</span>
                                    <span className='tp-tickpulse__field-hint'>
                                        ~{Math.round(effectiveAfterRatio * 100)}% payout
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
                                    <span>Take profit</span>
                                    <span className='tp-tickpulse__field-hint'>({activeCurrency})</span>
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
                                    <span>Stop loss</span>
                                    <span className='tp-tickpulse__field-hint'>({activeCurrency})</span>
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

                        {/* Market Scanner & Entry Condition Bar */}
                        <div className='tp-tickpulse__scanner-bar'>
                            <div className='tp-tickpulse__scanner-left'>
                                <button
                                    type='button'
                                    disabled={isRunning}
                                    className='tp-tickpulse__scan-btn'
                                    onClick={handleFindBestMarket}
                                    data-testid='tickpulse-find-best-market'
                                >
                                    Find Best Market
                                </button>

                                <select
                                    className='tp-tickpulse__market-select'
                                    disabled={isRunning}
                                    value={activeMarketInfo?.symbol || ''}
                                    aria-label='Selected market'
                                    onChange={e => setSelectedMarket(e.target.value)}
                                >
                                    {rankedMarkets.map((m, idx) => (
                                        <option key={m.symbol} value={m.symbol}>
                                            #{idx + 1} {m.shortLabel} — {m.hitRatePct}% Hit ({m.tickCount}t)
                                        </option>
                                    ))}
                                </select>

                                {activeMarketInfo && activeMarketInfo.lastDigits.length > 0 && (
                                    <div className='tp-tickpulse__digits-strip'>
                                        <span>Last digits:</span>
                                        {activeMarketInfo.lastDigits.map((item, idx) => (
                                            <span
                                                key={`${activeMarketInfo.symbol}-d-${idx}`}
                                                className={`tp-tickpulse__digit-chip${
                                                    item.matched ? ' tp-tickpulse__digit-chip--win' : ''
                                                }`}
                                            >
                                                {item.digit}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className='tp-tickpulse__entry-right'>
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

                                <label className='tp-tickpulse__toggle-label'>
                                    <span>No entry condition after choosing a market</span>
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
                                                noEntryCondition ? ' tp-tickpulse__switch-knob--on' : ''
                                            }`}
                                        />
                                    </button>
                                </label>
                            </div>
                        </div>

                        {/* Top 4 Ranked Markets Strip */}
                        {rankedMarkets.length > 0 && (
                            <div className='tp-tickpulse__ranked-strip' aria-label='Top ranked markets'>
                                {rankedMarkets.slice(0, 4).map((m, idx) => (
                                    <button
                                        key={`rank-${m.symbol}`}
                                        type='button'
                                        disabled={isRunning}
                                        className={`tp-tickpulse__ranked-chip${
                                            activeMarketInfo?.symbol === m.symbol
                                                ? ' tp-tickpulse__ranked-chip--selected'
                                                : ''
                                        }`}
                                        onClick={() => {
                                            setSelectedMarket(m.symbol);
                                            setStatusMessage(
                                                `Selected ${m.label} (${m.hitRatePct}% Hit Rate)`
                                            );
                                        }}
                                    >
                                        <span>
                                            #{idx + 1} {m.shortLabel}
                                        </span>
                                        <span className='tp-tickpulse__ranked-pct'>{m.hitRatePct}%</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Risk Disclaimer + Primary Load & Run CTA */}
                        <div className='tp-tickpulse__footer-row'>
                            <div className='tp-tickpulse__disclaimer'>
                                <strong>Risk disclaimer:</strong> Automated trading can lose the full
                                stake. Recovery splits do not guarantee profit. Stop loss is checked
                                after settlement and may be exceeded.
                            </div>

                            <div className='tp-tickpulse__cta-group'>
                                {!isRunning && (sessionPL !== 0 || recoveryState.inRecovery) && (
                                    <button
                                        type='button'
                                        className='tp-tickpulse__reset-btn'
                                        onClick={handleResetSession}
                                    >
                                        Reset
                                    </button>
                                )}

                                <button
                                    type='button'
                                    className={`tp-tickpulse__run-btn${
                                        isRunning ? ' tp-tickpulse__run-btn--stop' : ''
                                    }`}
                                    onClick={handleToggleLoadAndRun}
                                    data-testid='tickpulse-load-and-run'
                                >
                                    <span aria-hidden='true'>{isRunning ? '■' : '▶'}</span>
                                    <span>{isRunning ? 'Stop TickPulse' : 'Load & Run'}</span>
                                </button>
                            </div>
                        </div>
                    </section>
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
                                contracts and click <strong>Load &amp; Run</strong>.
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
