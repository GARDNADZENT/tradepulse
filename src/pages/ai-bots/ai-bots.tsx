import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { api_base, MessageTypes } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { derivBus } from '@/lib/deriv/tick-bus';
import { executeLiveDerivTrade } from '@/utils/ai-bot-xml-builder';
import { autoDockRunPanel, triggerTpSlModal } from '@/components/tp-sl-modal';
import {
    AI_SCANNER_MARKETS,
    AIScannerRowEvaluation,
    evaluateAIScannerMarket,
    RISK_MANAGER_AI_BOTS,
    RiskManagerAIBotCard,
    RiskManagerAIBotId,
} from './ai-bot-presets';
import { advanceVirtualRecovery, VirtualRecoveryContract, VirtualRecoveryTrade } from './virtual-recovery';
import './ai-bots.scss';

const RobotIcon: React.FC = () => (
    <svg
        className='rm-ai-bots__robot-icon'
        width='20'
        height='20'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        aria-hidden='true'
    >
        <path d='M12 8V4H8' />
        <rect width='16' height='12' x='4' y='8' rx='2' />
        <path d='M2 14h2' />
        <path d='M20 14h2' />
        <path d='M15 13v2' />
        <path d='M9 13v2' />
    </svg>
);

// Keep the lock across AI Bots unmount/remounts while a real contract is unresolved.
// A full page reload clears it, so traders should check open contracts before restarting.
let virtualBotUnsettledOrder: symbol | null = null;
type SuspendedVirtualRecovery = { virtualMode: boolean; stake: number; totalPL: number };
// Preserve a recovery gate across scanner stops and tab changes in this page session.
const virtualRecoveryByAccount = new Map<string, SuspendedVirtualRecovery>();

const COUNT_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const RISE_FALL_COUNT_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

interface LiveMarketSnapshot {
    symbol: string;
    label: string;
    quoteDisplay: string;
    evalResult: AIScannerRowEvaluation;
}

const TradingRuleBox: React.FC<{
    bot: RiskManagerAIBotCard;
    entryCount: number;
    recoveryCount: number;
    disabled: boolean;
    onChangeEntryCount: (n: number) => void;
    onChangeRecoveryCount: (n: number) => void;
}> = ({ bot, entryCount, recoveryCount, disabled, onChangeEntryCount, onChangeRecoveryCount }) => {
    const countOptions = bot.id === 'rise-fall-ai' ? RISE_FALL_COUNT_OPTIONS : COUNT_OPTIONS;

    const renderCountSelect = (value: number, onChange: (n: number) => void, ariaLabel: string) => (
        <select
            className='rm-ai-scanner__rule-select'
            value={value}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={e => onChange(Number(e.target.value) || 2)}
        >
            {countOptions.map(n => (
                <option key={n} value={n}>
                    {n}
                </option>
            ))}
        </select>
    );

    if (bot.id === 'even-odd-ai') {
        return (
            <div className='rm-ai-scanner__rule-box' data-testid='ai-scanner-trading-rule'>
                <div className='rm-ai-scanner__rule-heading'>TRADING RULE</div>
                <p className='rm-ai-scanner__rule-line'>
                    If the last {renderCountSelect(entryCount, onChangeEntryCount, 'Entry digit count')} digits are{' '}
                    <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>all Even</span> , then trade{' '}
                    <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>Odd</span> .
                </p>
                <p className='rm-ai-scanner__rule-line'>
                    Else, if they are <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>all Odd</span> ,
                    then trade <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>Even</span> .
                </p>
                <p className='rm-ai-scanner__rule-note'>
                    Otherwise, continue scanning until either condition is confirmed.
                </p>
            </div>
        );
    }

    if (bot.id === 'over4-under5-ai') {
        return (
            <div className='rm-ai-scanner__rule-box' data-testid='ai-scanner-trading-rule'>
                <div className='rm-ai-scanner__rule-heading'>TRADING RULE</div>
                <p className='rm-ai-scanner__rule-line'>
                    If the last {renderCountSelect(entryCount, onChangeEntryCount, 'Entry digit count')} digits are{' '}
                    <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>below 4</span> , then trade{' '}
                    <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>Over 4</span> .
                </p>
                <p className='rm-ai-scanner__rule-line'>
                    Else, if they are <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>above 5</span> ,
                    then trade <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>Under 5</span> .
                </p>
                <p className='rm-ai-scanner__rule-note'>
                    Otherwise, continue scanning until either condition is confirmed.
                </p>
            </div>
        );
    }

    if (bot.id === 'rise-fall-ai') {
        return (
            <div className='rm-ai-scanner__rule-box' data-testid='ai-scanner-trading-rule'>
                <div className='rm-ai-scanner__rule-heading'>TRADING RULE</div>
                <p className='rm-ai-scanner__rule-line'>
                    If the last {renderCountSelect(entryCount, onChangeEntryCount, 'Run tick count')} ticks form a{' '}
                    <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>rising run</span> , then trade{' '}
                    <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>Fall</span> .
                </p>
                <p className='rm-ai-scanner__rule-line'>
                    Else, if they form a{' '}
                    <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>falling run</span> , then trade{' '}
                    <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>Rise</span> .
                </p>
                <p className='rm-ai-scanner__rule-note'>
                    Otherwise, continue scanning until either condition is confirmed.
                </p>
            </div>
        );
    }

    const isOver2Primary = bot.id === 'over2-rec-evenodd' || bot.id === 'over2-rec-range';
    const isEvenOddRecovery = ['over2-rec-evenodd', 'under7-rec-evenodd', 'under7-rec-evenodd-virtual'].includes(bot.id);

    return (
        <div className='rm-ai-scanner__rule-box' data-testid='ai-scanner-trading-rule'>
            <div className='rm-ai-scanner__rule-heading'>TRADING RULE</div>
            <p className='rm-ai-scanner__rule-line'>
                If the last {renderCountSelect(entryCount, onChangeEntryCount, 'Entry digit count')} digits are{' '}
                {isOver2Primary ? (
                    <>
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--amber'>below 2</span> , then trade{' '}
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>Over 2</span> .
                    </>
                ) : (
                    <>
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>above 7</span> , then trade{' '}
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>Under 7</span> .
                    </>
                )}
            </p>
            <p className='rm-ai-scanner__rule-line'>
                After a loss, if the last{' '}
                {renderCountSelect(recoveryCount, onChangeRecoveryCount, 'Recovery digit count')} digits are{' '}
                {isEvenOddRecovery ? (
                    <>
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>all Even</span> →{' '}
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>Odd</span> , or{' '}
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>all Odd</span> →{' '}
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>Even</span> .
                    </>
                ) : (
                    <>
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>below 4</span> →{' '}
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--green'>Over 4</span> , or{' '}
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>above 5</span> →{' '}
                        <span className='rm-ai-scanner__badge rm-ai-scanner__badge--red'>Under 5</span> .
                    </>
                )}
            </p>
            <p className='rm-ai-scanner__rule-note'>
                Resets to initial entry mode and base stake immediately after a recovery win.
            </p>
            {bot.id === 'under7-rec-evenodd-virtual' && (
                <p className='rm-ai-scanner__rule-note'>
                    After a real loss, simulate each recovery signal until a virtual loss; then wait for the next
                    recovery signal to trade real. Virtual results do not change real P/L, recovery mode or stake.
                    Simulation uses subsequent market ticks and may differ from a real contract.
                    Stopping keeps the recovery gate while this page remains open; reloading resets it.
                    Check open contracts before restarting after a reload.
                </p>
            )}
        </div>
    );
};

const AIBots = observer(() => {
    const { client, journal, transactions, summary_card, run_panel } = useStore();
    const currency = client?.currency || 'USD';

    const [selectedBotId, setSelectedBotId] = useState<RiskManagerAIBotId | null>(null);
    const selectedBot = useMemo(
        () => RISK_MANAGER_AI_BOTS.find(b => b.id === selectedBotId) || null,
        [selectedBotId]
    );

    const [entryCount, setEntryCount] = useState(5);
    const [recoveryCount, setRecoveryCount] = useState(3);
    const [marketScope, setMarketScope] = useState<string>('ALL');
    const [stakeInput, setStakeInput] = useState('0.5');
    const [ticksInput, setTicksInput] = useState('1');
    const [takeProfitInput, setTakeProfitInput] = useState('5');
    const [stopLossInput, setStopLossInput] = useState('30');
    const [martingaleInput, setMartingaleInput] = useState('2');

    const [isRunning, setIsRunning] = useState(false);
    const [inRecovery, setInRecovery] = useState(false);
    const [virtualMode, setVirtualMode] = useState(false);
    const [isExecutingTrade, setIsExecutingTrade] = useState(false);
    const [totalPL, setTotalPL] = useState(0);
    const [footerMessage, setFooterMessage] = useState('Scanner idle — configure setup and start scanning.');
    const [tickVersion, setTickVersion] = useState(0);

    const runningRef = useRef(false);
    const inFlightRef = useRef(false);
    const inRecoveryRef = useRef(false);
    const virtualModeRef = useRef(false);
    const virtualTradeRef = useRef<VirtualRecoveryTrade | null>(null);
    const virtualTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // An unresolved real order must not be duplicated by stopping and restarting.
    const runGenerationRef = useRef(0);
    const runningAccountRef = useRef('');
    const currentStakeRef = useRef(0.5);
    const totalPLRef = useRef(0);
    const lastFiredEpochBySymbolRef = useRef<Record<string, number>>({});

    const configRef = useRef({
        selectedBotId: null as RiskManagerAIBotId | null,
        hasRecovery: false,
        entryCount: 5,
        recoveryCount: 3,
        marketScope: 'ALL',
        baseStake: 0.5,
        durationTicks: 1,
        takeProfit: 5,
        stopLoss: 30,
        martingale: 2,
        currency: 'USD',
        accountKey: '',
    });

    configRef.current = {
        selectedBotId,
        hasRecovery: Boolean(selectedBot?.hasRecovery),
        entryCount,
        recoveryCount,
        marketScope,
        baseStake: Math.max(0.35, Number(stakeInput) || 0.5),
        durationTicks: Math.max(1, Math.min(10, Math.round(Number(ticksInput) || 1))),
        takeProfit: Math.max(0.5, Number(takeProfitInput) || 5),
        stopLoss: Math.max(0.5, Number(stopLossInput) || 30),
        martingale: Math.max(1, Number(martingaleInput) || 2),
        currency,
        accountKey: String(client?.loginid || (api_base as any)?.account_info?.loginid ||
            (typeof window !== 'undefined' ? window.localStorage?.getItem('active_loginid') : '') || ''),
    };

    const stopScannerInternal = useCallback((reason?: string) => {
        runningRef.current = false;
        runGenerationRef.current += 1;
        inFlightRef.current = false;
        virtualModeRef.current = false;
        virtualTradeRef.current = null;
        if (virtualTimerRef.current) clearTimeout(virtualTimerRef.current);
        virtualTimerRef.current = null;
        setVirtualMode(false);
        setIsRunning(false);
        setIsExecutingTrade(false);
        if (reason) {
            setFooterMessage(reason);
        }
    }, []);

    const handleOpenBot = (bot: RiskManagerAIBotCard) => {
        stopScannerInternal();
        setSelectedBotId(bot.id);
        setEntryCount(bot.defaultEntryCount);
        setRecoveryCount(bot.defaultRecoveryCount);
        setInRecovery(false);
        inRecoveryRef.current = false;
        setTotalPL(0);
        totalPLRef.current = 0;
        setFooterMessage('Scanner idle — configure setup and start scanning.');
    };

    const handleBackToStrategies = () => {
        stopScannerInternal('Scanner stopped.');
        setSelectedBotId(null);
    };

    const attemptAutoTradeOnTick = useCallback(
        async (sym: string, latestTick?: { t: number; price: number }) => {
            if (!runningRef.current || inFlightRef.current) return;
            const cfg = configRef.current;
            if (!cfg.selectedBotId) return;
            if (cfg.selectedBotId === 'under7-rec-evenodd-virtual' && cfg.accountKey !== runningAccountRef.current) {
                stopScannerInternal('Account changed. Scanner stopped; check your account before restarting.');
                return;
            }
            if (cfg.marketScope !== 'ALL' && cfg.marketScope !== sym) return;

            const rawTicks = derivBus.getTicks(sym);
            if (!rawTicks.length) return;
            const pipSize = derivBus.getPipSize(sym);

            const latestEpoch = latestTick?.t ?? rawTicks[rawTicks.length - 1]?.t ?? 0;
            if (latestEpoch && lastFiredEpochBySymbolRef.current[sym] === latestEpoch) return;

            const evalResult = evaluateAIScannerMarket({
                botId: cfg.selectedBotId,
                rawTicks,
                pipSize,
                entryCount: cfg.entryCount,
                recoveryCount: cfg.recoveryCount,
                inRecovery: inRecoveryRef.current,
            });

            if (!evalResult.matched || !evalResult.contractType) return;

            const marketMeta = AI_SCANNER_MARKETS.find(m => m.symbol === sym);
            const marketLabel = marketMeta?.label || sym;
            const stakeToUse = Math.max(0.35, Number(currentStakeRef.current.toFixed(2)));
            const isVirtualBot = cfg.selectedBotId === 'under7-rec-evenodd-virtual';

            if (isVirtualBot && virtualModeRef.current) {
                // Use the same scanner and tick duration, but never call the buy API.
                if (
                    !latestEpoch || !Number.isFinite(latestEpoch) ||
                    !Number.isFinite(latestTick?.price ?? rawTicks[rawTicks.length - 1]?.price) ||
                    !Number.isInteger(pipSize) || pipSize < 0 || pipSize > 10 ||
                    !['DIGITEVEN', 'DIGITODD'].includes(evalResult.contractType)
                ) {
                    stopScannerInternal('Cannot safely simulate this recovery signal. Scanner stopped.');
                    return;
                }
                inFlightRef.current = true;
                setIsExecutingTrade(true);
                lastFiredEpochBySymbolRef.current[sym] = latestEpoch;
                virtualTradeRef.current = {
                    symbol: sym, marketLabel, contractType: evalResult.contractType as VirtualRecoveryContract,
                    pipSize, ticksRemaining: cfg.durationTicks, lastTickTime: latestEpoch,
                    entrySpot: latestTick?.price ?? rawTicks[rawTicks.length - 1].price,
                    currency: cfg.currency,
                };
                const message = `[VIRTUAL] Simulating ${evalResult.actionLabel.replace('Trade ', '')} on ${marketLabel} for ${cfg.durationTicks} tick(s). No contract purchased.`;
                setFooterMessage(message);
                journal?.pushMessage?.(message, MessageTypes.NOTIFY, '');
                virtualTimerRef.current = setTimeout(() => {
                    if (virtualTradeRef.current) {
                        stopScannerInternal('Virtual trade timed out without enough live ticks. Scanner stopped; no real trade placed.');
                    }
                }, 90000);
                return;
            }

            const orderGeneration = runGenerationRef.current;
            const orderPriorPL = totalPLRef.current;
            const realOrderToken = isVirtualBot ? Symbol('ai-virtual-real-order') : null;
            if (realOrderToken) virtualBotUnsettledOrder = realOrderToken;
            inFlightRef.current = true;
            setIsExecutingTrade(true);
            if (latestEpoch) {
                lastFiredEpochBySymbolRef.current[sym] = latestEpoch;
            }
            setFooterMessage(
                `Executing ${evalResult.actionLabel} on ${marketLabel} (${cfg.currency} ${stakeToUse.toFixed(2)})…`
            );

            let settledHandled = false;
            let safetyTimer: ReturnType<typeof setTimeout> | undefined;

            const finalizeSettlement = (profit: number) => {
                if (settledHandled) return;
                settledHandled = true;
                if (safetyTimer !== undefined) clearTimeout(safetyTimer);

                if (isVirtualBot) {
                    if (virtualBotUnsettledOrder === realOrderToken) virtualBotUnsettledOrder = null;
                    // Remember a late real loss even if the scanner was stopped or the tab closed.
                    if (!runningRef.current || runGenerationRef.current !== orderGeneration ||
                        configRef.current.accountKey !== cfg.accountKey) {
                        if (runningRef.current && runGenerationRef.current === orderGeneration) {
                            stopScannerInternal('Account changed. Scanner stopped; check your account before restarting.');
                        }
                        if (profit > 0) virtualRecoveryByAccount.delete(cfg.accountKey);
                        else virtualRecoveryByAccount.set(cfg.accountKey, {
                            virtualMode: true,
                            stake: Number((stakeToUse * cfg.martingale).toFixed(2)),
                            totalPL: Number((orderPriorPL + profit).toFixed(2)),
                        });
                        return;
                    }
                }
                const nextPL = Number((totalPLRef.current + profit).toFixed(2));
                totalPLRef.current = nextPL;
                setTotalPL(nextPL);
                setIsExecutingTrade(false);
                inFlightRef.current = false;

                if (!runningRef.current) return;

                if (nextPL >= cfg.takeProfit) {
                    if (isVirtualBot) virtualRecoveryByAccount.delete(cfg.accountKey);
                    inRecoveryRef.current = false;
                    setInRecovery(false);
                    stopScannerInternal(`Take profit reached: +${nextPL.toFixed(2)}`);
                    triggerTpSlModal({
                        type: 'tp',
                        amount: nextPL,
                        currency: cfg.currency,
                        source: 'ai-bots',
                    });
                    return;
                }

                if (nextPL <= -Math.abs(cfg.stopLoss)) {
                    if (isVirtualBot) virtualRecoveryByAccount.delete(cfg.accountKey);
                    inRecoveryRef.current = false;
                    setInRecovery(false);
                    stopScannerInternal(`Stop loss reached: ${nextPL.toFixed(2)}`);
                    triggerTpSlModal({
                        type: 'sl',
                        amount: nextPL,
                        currency: cfg.currency,
                        source: 'ai-bots',
                    });
                    return;
                }

                if (profit > 0) {
                    if (isVirtualBot) virtualRecoveryByAccount.delete(cfg.accountKey);
                    currentStakeRef.current = cfg.baseStake;
                    inRecoveryRef.current = false;
                    setInRecovery(false);
                    setFooterMessage(
                        `Won +${profit.toFixed(2)} ${cfg.currency} on ${marketLabel} · Scanning for next signal…`
                    );
                } else {
                    currentStakeRef.current = Number((stakeToUse * cfg.martingale).toFixed(2));
                    if (cfg.hasRecovery) {
                        inRecoveryRef.current = true;
                        setInRecovery(true);
                        if (isVirtualBot) {
                            virtualModeRef.current = true;
                            virtualRecoveryByAccount.set(cfg.accountKey, {
                                virtualMode: true, stake: currentStakeRef.current, totalPL: nextPL,
                            });
                            setVirtualMode(true);
                            const message = `Real loss ${profit.toFixed(2)} ${cfg.currency} on ${marketLabel} · Virtual recovery scanning (next real stake ${currentStakeRef.current.toFixed(2)})`;
                            setFooterMessage(message);
                            journal?.pushMessage?.(`[VIRTUAL] ${message}`, MessageTypes.NOTIFY, '');
                        } else {
                            setFooterMessage(
                                `Lost ${profit.toFixed(2)} ${cfg.currency} on ${marketLabel} · Recovery mode active (next stake ${currentStakeRef.current.toFixed(2)})`
                            );
                        }
                    } else {
                        setFooterMessage(
                            `Lost ${profit.toFixed(2)} ${cfg.currency} on ${marketLabel} · Next stake ${currentStakeRef.current.toFixed(2)}`
                        );
                    }
                }
            };

            safetyTimer = setTimeout(() => {
                if (!settledHandled) {
                    if (isVirtualBot) {
                        // The outcome is unknown: never release the real-order lock on a timer.
                        if (runningRef.current && runGenerationRef.current === orderGeneration) {
                            stopScannerInternal('Real contract settlement timed out. Scanner stopped; wait for settlement before restarting.');
                        }
                    } else {
                        settledHandled = true;
                        inFlightRef.current = false;
                        setIsExecutingTrade(false);
                    }
                }
            }, 25000);

            try {
                await executeLiveDerivTrade({
                    symbol: sym,
                    contractType: evalResult.contractType,
                    stake: stakeToUse,
                    duration: cfg.durationTicks,
                    barrier: evalResult.barrier,
                    currency: cfg.currency,
                    stores: { journal, transactions, summary_card, run_panel },
                    onContractUpdate: (poc, isTerminal) => {
                        if (isTerminal) {
                            if (settledHandled) return;
                            if (isVirtualBot && (poc?.profit == null || !Number.isFinite(Number(poc.profit)))) {
                                if (safetyTimer !== undefined) clearTimeout(safetyTimer);
                                // The outcome is unknown, so keep the lock and allow a later valid update.
                                if (runningRef.current && runGenerationRef.current === orderGeneration) {
                                    stopScannerInternal('Real settlement has no valid profit. Scanner stopped; check the contract before restarting.');
                                }
                                return;
                            }
                            finalizeSettlement(Number(poc?.profit ?? 0));
                        }
                    },
                });
            } catch (err: any) {
                if (settledHandled) return;
                if (safetyTimer !== undefined) clearTimeout(safetyTimer);
                settledHandled = !isVirtualBot;
                // A failed network request may still have reached Deriv. Keep the lock until
                // a known settlement or page reload, after manually checking open contracts.
                inFlightRef.current = false;
                setIsExecutingTrade(false);
                const msg = err?.message || 'Trade execution failed.';
                stopScannerInternal(isVirtualBot ? `${msg} Check your account for an open contract before reloading or restarting.` : msg);
            }
        },
        [stopScannerInternal, journal, transactions, summary_card, run_panel]
    );

    useEffect(() => {
        if (!selectedBotId) return;

        const allSymbols = AI_SCANNER_MARKETS.map(m => m.symbol);
        let flushScheduled = false;
        const scheduleRefresh = () => {
            if (flushScheduled) return;
            flushScheduled = true;
            requestAnimationFrame(() => {
                flushScheduled = false;
                setTickVersion(v => v + 1);
            });
        };

        const unsubHist = derivBus.onHistory(() => {
            scheduleRefresh();
        });
        const unsubTick = derivBus.onTick((sym, tk) => {
            scheduleRefresh();
            const pending = virtualTradeRef.current;
            if (pending && configRef.current.accountKey !== runningAccountRef.current) {
                stopScannerInternal('Account changed. Scanner stopped; check your account before restarting.');
                return;
            }
            if (pending) {
                const result = advanceVirtualRecovery(pending, sym, tk);
                virtualTradeRef.current = result.trade;
                if (result.outcome) {
                    virtualTradeRef.current = null;
                    if (virtualTimerRef.current) clearTimeout(virtualTimerRef.current);
                    virtualTimerRef.current = null;
                    inFlightRef.current = false;
                    setIsExecutingTrade(false);
                    const didWin = result.outcome === 'won';
                    virtualModeRef.current = didWin;
                    const saved = virtualRecoveryByAccount.get(runningAccountRef.current);
                    if (saved) virtualRecoveryByAccount.set(runningAccountRef.current, { ...saved, virtualMode: didWin });
                    setVirtualMode(didWin);
                    transactions?.pushVirtualTransaction?.({
                        display_name: pending.marketLabel,
                        underlying_symbol: pending.symbol,
                        contract_type: pending.contractType,
                        entry_spot: pending.entrySpot.toFixed(pending.pipSize),
                        exit_spot: tk.price.toFixed(pending.pipSize),
                        currency: pending.currency,
                        outcome: result.outcome,
                    }, runningAccountRef.current);
                    const action = didWin ? 'Continue virtual scanning' : 'Wait for the next real recovery signal';
                    const message = `[VIRTUAL] ${pending.contractType === 'DIGITEVEN' ? 'Even' : 'Odd'} on ${pending.marketLabel} · digit ${result.digit} · ${didWin ? 'WIN' : 'LOSS'} · ${action}. No money wagered.`;
                    setFooterMessage(message);
                    journal?.pushMessage?.(message, MessageTypes.NOTIFY, '');
                }
                return;
            }
            void attemptAutoTradeOnTick(sym, tk);
        });
        const release = derivBus.subscribe(allSymbols);
        scheduleRefresh();

        return () => {
            unsubHist();
            unsubTick();
            release();
        };
    }, [selectedBotId, attemptAutoTradeOnTick, journal, transactions]);

    useEffect(() => {
        return () => {
            runningRef.current = false;
            runGenerationRef.current += 1;
            inFlightRef.current = false;
            virtualTradeRef.current = null;
            if (virtualTimerRef.current) clearTimeout(virtualTimerRef.current);
        };
    }, []);

    const handleToggleScanner = () => {
        if (isRunning) {
            stopScannerInternal(virtualBotUnsettledOrder
                ? 'Scanner stopped. The real contract is still settling; wait before restarting.'
                : 'Scanner stopped by user.');
            return;
        }

        if (virtualBotUnsettledOrder) {
            setFooterMessage('A real contract is still unsettled. Wait for settlement before restarting.');
            return;
        }
        const hasAuth =
            Boolean(client?.is_logged_in) ||
            Boolean((api_base as any)?.is_authorized) ||
            Boolean(typeof window !== 'undefined' && window.localStorage?.getItem('authToken'));

        if (!hasAuth) {
            setFooterMessage('Please log in with Deriv or PAT Login first to start live AI Scanner trading.');
            return;
        }

        const isVirtualBot = selectedBotId === 'under7-rec-evenodd-virtual';
        const accountKey = configRef.current.accountKey;
        if (isVirtualBot && !accountKey) {
            setFooterMessage('Wait for your account ID to load before starting this strategy.');
            return;
        }
        const saved = isVirtualBot ? virtualRecoveryByAccount.get(accountKey) : undefined;
        if (saved && (saved.totalPL >= configRef.current.takeProfit || saved.totalPL <= -Math.abs(configRef.current.stopLoss))) {
            virtualRecoveryByAccount.delete(accountKey);
            setFooterMessage('The previous run reached its take profit or stop loss while stopped. Review it before starting a new run.');
            return;
        }
        const baseStake = Math.max(0.35, Number(stakeInput) || 0.5);
        currentStakeRef.current = saved?.stake ?? baseStake;
        inRecoveryRef.current = Boolean(saved);
        setInRecovery(Boolean(saved));
        totalPLRef.current = saved?.totalPL ?? 0;
        setTotalPL(totalPLRef.current);
        inFlightRef.current = false;
        virtualModeRef.current = saved?.virtualMode ?? false;
        virtualTradeRef.current = null;
        setVirtualMode(virtualModeRef.current);
        runningAccountRef.current = accountKey;
        runGenerationRef.current += 1;
        runningRef.current = true;
        setIsRunning(true);
        autoDockRunPanel(run_panel, 1);
        setFooterMessage(saved
            ? `Resuming ${saved.virtualMode ? 'virtual' : 'real'} recovery scanning · next real stake ${saved.stake.toFixed(2)}. Waiting for a new signal.`
            : `Scanning ${marketScope === 'ALL' ? 'All Markets' : marketScope} for confirmed ${selectedBot?.title || 'AI'} signal…`
        );
        // A restarted recovery must wait for a new live tick, not reuse a stale signal.
        if (saved) return;

        const candidateSymbols =
            marketScope === 'ALL' ? AI_SCANNER_MARKETS.map(m => m.symbol) : [marketScope];
        for (const sym of candidateSymbols) {
            if (inFlightRef.current || !runningRef.current) break;
            const ticks = derivBus.getTicks(sym);
            if (ticks.length > 0) {
                void attemptAutoTradeOnTick(sym, ticks[ticks.length - 1]);
                if (inFlightRef.current) break;
            }
        }
    };

    const marketRows: LiveMarketSnapshot[] = useMemo(() => {
        if (!selectedBot) return [];
        // Reference tickVersion so memo updates as live ticks stream in
        void tickVersion;

        return AI_SCANNER_MARKETS.map(m => {
            const rawTicks = derivBus.getTicks(m.symbol);
            const pipSize = derivBus.getPipSize(m.symbol);
            const lastPrice = rawTicks.length ? rawTicks[rawTicks.length - 1].price : null;
            const quoteDisplay = lastPrice !== null ? String(Math.trunc(lastPrice)) : '—';
            const evalResult = evaluateAIScannerMarket({
                botId: selectedBot.id,
                rawTicks,
                pipSize,
                entryCount,
                recoveryCount,
                inRecovery,
            });
            return {
                symbol: m.symbol,
                label: m.label,
                quoteDisplay,
                evalResult,
            };
        });
    }, [selectedBot, tickVersion, entryCount, recoveryCount, inRecovery]);

    const signalsReadyCount = useMemo(
        () =>
            marketRows.filter(
                r => (marketScope === 'ALL' || r.symbol === marketScope) && r.evalResult.matched
            ).length,
        [marketRows, marketScope]
    );

    if (!selectedBot) {
        return (
            <div className='rm-ai-bots' data-testid='rm-ai-bots-page'>
                <div className='rm-ai-bots__grid'>
                    {RISK_MANAGER_AI_BOTS.map(bot => (
                        <article
                            key={bot.id}
                            className={`rm-ai-bots__card rm-ai-bots__card--${bot.accent}`}
                            data-testid={`ai-bot-card-${bot.number}`}
                        >
                            <div className='rm-ai-bots__card-body'>
                                <div className='rm-ai-bots__card-head'>
                                    <div className='rm-ai-bots__title-wrap'>
                                        <RobotIcon />
                                        <h3 className='rm-ai-bots__title'>{bot.title}</h3>
                                    </div>
                                    <span className='rm-ai-bots__number'>{bot.number}</span>
                                </div>
                                <p className='rm-ai-bots__desc'>{bot.description}</p>
                            </div>

                            <button
                                type='button'
                                className='rm-ai-bots__load-btn'
                                onClick={() => handleOpenBot(bot)}
                            >
                                <span>Load AI Bot</span>
                                <span className='rm-ai-bots__arrow' aria-hidden='true'>
                                    →
                                </span>
                            </button>
                        </article>
                    ))}
                </div>
            </div>
        );
    }

    const statusBadgeLabel = isExecutingTrade
        ? virtualMode ? 'VIRTUAL TRADE' : 'EXECUTING TRADE'
        : isRunning
          ? virtualMode ? 'VIRTUAL SCANNING' : inRecovery ? 'RECOVERY SCANNING' : 'SCANNER ACTIVE'
          : 'SCANNER IDLE';

    return (
        <div className='rm-ai-bots rm-ai-bots--scanner' data-testid='rm-ai-scanner-workspace'>
            <div className='rm-ai-scanner'>
                {/* Top Strategy Header Bar */}
                <header className='rm-ai-scanner__topbar'>
                    <div className='rm-ai-scanner__topbar-info'>
                        <h2 className='rm-ai-scanner__topbar-title'>{selectedBot.title}</h2>
                        <p className='rm-ai-scanner__topbar-desc'>{selectedBot.description}</p>
                    </div>
                    <div className='rm-ai-scanner__topbar-actions'>
                        <button
                            type='button'
                            className='rm-ai-scanner__back-btn'
                            onClick={handleBackToStrategies}
                        >
                            <span aria-hidden='true'>←</span>
                            <span>Strategies</span>
                        </button>
                        <div
                            className={`rm-ai-scanner__status-pill${
                                isRunning ? ' rm-ai-scanner__status-pill--active' : ''
                            }${inRecovery ? ' rm-ai-scanner__status-pill--recovery' : ''}`}
                            data-testid='ai-scanner-status-pill'
                        >
                            <span className='rm-ai-scanner__status-dot' />
                            <span>{statusBadgeLabel}</span>
                        </div>
                    </div>
                </header>

                {/* Main 2-Column Scanner Grid */}
                <div className='rm-ai-scanner__main'>
                    {/* Left Panel: Scanner setup */}
                    <section className='rm-ai-scanner__setup-card'>
                        <div className='rm-ai-scanner__setup-head'>
                            <span className='rm-ai-scanner__setup-icon' aria-hidden='true'>
                                <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
                                    <circle cx='12' cy='12' r='9' />
                                    <circle cx='12' cy='12' r='4' />
                                </svg>
                            </span>
                            <div>
                                <h3 className='rm-ai-scanner__setup-title'>Scanner setup</h3>
                                <div className='rm-ai-scanner__setup-sub'>CONFIGURE ENTRY CONFIRMATION</div>
                            </div>
                        </div>

                        <button
                            type='button'
                            className={`rm-ai-scanner__start-btn${
                                isRunning ? ' rm-ai-scanner__start-btn--running' : ''
                            }`}
                            onClick={handleToggleScanner}
                            data-testid='ai-scanner-toggle-btn'
                        >
                            <span aria-hidden='true'>{isRunning ? '■' : '▶'}</span>
                            <span>{isRunning ? 'STOP AI SCANNER' : 'START AI SCANNER'}</span>
                        </button>

                        <TradingRuleBox
                            bot={selectedBot}
                            entryCount={entryCount}
                            recoveryCount={recoveryCount}
                            disabled={isRunning}
                            onChangeEntryCount={setEntryCount}
                            onChangeRecoveryCount={setRecoveryCount}
                        />

                        <div className='rm-ai-scanner__field'>
                            <label className='rm-ai-scanner__label' htmlFor='ai-scanner-market-scope'>
                                MARKET SCOPE
                            </label>
                            <select
                                id='ai-scanner-market-scope'
                                className='rm-ai-scanner__select'
                                value={marketScope}
                                disabled={isRunning}
                                onChange={e => setMarketScope(e.target.value)}
                            >
                                <option value='ALL'>All Markets</option>
                                {AI_SCANNER_MARKETS.map(m => (
                                    <option key={m.symbol} value={m.symbol}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className='rm-ai-scanner__inputs-grid'>
                            <div className='rm-ai-scanner__field'>
                                <label className='rm-ai-scanner__label' htmlFor='ai-scanner-stake'>
                                    STAKE
                                </label>
                                <input
                                    id='ai-scanner-stake'
                                    className='rm-ai-scanner__input'
                                    type='number'
                                    min='0.35'
                                    step='0.1'
                                    disabled={isRunning}
                                    value={stakeInput}
                                    onChange={e => setStakeInput(e.target.value)}
                                />
                            </div>
                            <div className='rm-ai-scanner__field'>
                                <label className='rm-ai-scanner__label' htmlFor='ai-scanner-ticks'>
                                    TICKS
                                </label>
                                <input
                                    id='ai-scanner-ticks'
                                    className='rm-ai-scanner__input'
                                    type='number'
                                    min='1'
                                    max='10'
                                    step='1'
                                    disabled={isRunning}
                                    value={ticksInput}
                                    onChange={e => setTicksInput(e.target.value)}
                                />
                            </div>
                            <div className='rm-ai-scanner__field'>
                                <label className='rm-ai-scanner__label' htmlFor='ai-scanner-tp'>
                                    TAKE PROFIT
                                </label>
                                <input
                                    id='ai-scanner-tp'
                                    className='rm-ai-scanner__input'
                                    type='number'
                                    min='0.5'
                                    step='0.5'
                                    disabled={isRunning}
                                    value={takeProfitInput}
                                    onChange={e => setTakeProfitInput(e.target.value)}
                                />
                            </div>
                            <div className='rm-ai-scanner__field'>
                                <label className='rm-ai-scanner__label' htmlFor='ai-scanner-sl'>
                                    STOP LOSS
                                </label>
                                <input
                                    id='ai-scanner-sl'
                                    className='rm-ai-scanner__input'
                                    type='number'
                                    min='0.5'
                                    step='1'
                                    disabled={isRunning}
                                    value={stopLossInput}
                                    onChange={e => setStopLossInput(e.target.value)}
                                />
                            </div>
                            <div className='rm-ai-scanner__field'>
                                <label className='rm-ai-scanner__label' htmlFor='ai-scanner-martingale'>
                                    MARTINGALE
                                </label>
                                <input
                                    id='ai-scanner-martingale'
                                    className='rm-ai-scanner__input'
                                    type='number'
                                    min='1'
                                    step='0.1'
                                    disabled={isRunning}
                                    value={martingaleInput}
                                    onChange={e => setMartingaleInput(e.target.value)}
                                />
                            </div>
                        </div>
                    </section>

                    {/* Right Panel: Live market scan */}
                    <section className='rm-ai-scanner__live-card'>
                        <div className='rm-ai-scanner__live-head'>
                            <div className='rm-ai-scanner__live-title-wrap'>
                                <svg
                                    className='rm-ai-scanner__live-icon'
                                    width='16'
                                    height='16'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='2.2'
                                    aria-hidden='true'
                                >
                                    <path d='M2 12h4l3-7 4 14 3-7h6' />
                                </svg>
                                <h3 className='rm-ai-scanner__live-title'>Live market scan</h3>
                            </div>
                            <span
                                className={`rm-ai-scanner__signals-pill${
                                    signalsReadyCount > 0 ? ' rm-ai-scanner__signals-pill--ready' : ''
                                }`}
                                data-testid='ai-scanner-signals-ready'
                            >
                                {signalsReadyCount} {signalsReadyCount === 1 ? 'SIGNAL READY' : 'SIGNALS READY'}
                            </span>
                        </div>

                        <div className='rm-ai-scanner__rows'>
                            {marketRows.map(row => {
                                const inScope = marketScope === 'ALL' || marketScope === row.symbol;
                                const isReady = inScope && row.evalResult.matched;
                                const boxSlots = row.evalResult.requiredCount;
                                const paddedDigits = Array.from({ length: boxSlots }, (_, idx) => {
                                    const offset = idx - (boxSlots - row.evalResult.recentDigits.length);
                                    return offset >= 0 ? row.evalResult.recentDigits[offset] : undefined;
                                });

                                return (
                                    <div
                                        key={row.symbol}
                                        className={`rm-ai-scanner__row${
                                            isReady ? ' rm-ai-scanner__row--matched' : ''
                                        }${!inScope ? ' rm-ai-scanner__row--dimmed' : ''}`}
                                        data-testid={`scanner-row-${row.symbol}`}
                                    >
                                        <div className='rm-ai-scanner__row-market'>
                                            <span
                                                className={`rm-ai-scanner__row-dot${
                                                    isReady ? ' rm-ai-scanner__row-dot--matched' : ''
                                                }`}
                                            />
                                            <div>
                                                <div className='rm-ai-scanner__row-name'>{row.label}</div>
                                                <div className='rm-ai-scanner__row-quote'>{row.quoteDisplay}</div>
                                            </div>
                                        </div>

                                        <div className='rm-ai-scanner__row-digits'>
                                            {paddedDigits.map((digit, i) => (
                                                <span
                                                    key={i}
                                                    className={`rm-ai-scanner__digit-box${
                                                        isReady ? ' rm-ai-scanner__digit-box--matched' : ''
                                                    }`}
                                                >
                                                    {digit !== undefined ? digit : '·'}
                                                </span>
                                            ))}
                                        </div>

                                        <div className='rm-ai-scanner__row-status'>
                                            <div className='rm-ai-scanner__row-action'>
                                                {inScope ? row.evalResult.actionLabel : 'Paused'}
                                            </div>
                                            <div className='rm-ai-scanner__row-sub'>
                                                {inScope ? row.evalResult.subLabel : 'Outside scope'}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                </div>

                {/* Bottom Status & Total P/L Bar */}
                <footer className='rm-ai-scanner__footer' data-testid='ai-scanner-footer'>
                    <div className='rm-ai-scanner__footer-msg'>{footerMessage}</div>
                    <div
                        className={`rm-ai-scanner__footer-pl${
                            totalPL < 0 ? ' rm-ai-scanner__footer-pl--neg' : ''
                        }`}
                    >
                        Total P/L {totalPL > 0 ? `+${totalPL.toFixed(2)}` : totalPL.toFixed(2)}
                    </div>
                </footer>
            </div>
        </div>
    );
});

export default AIBots;
