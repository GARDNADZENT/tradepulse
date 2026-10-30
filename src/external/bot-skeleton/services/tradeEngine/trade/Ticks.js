/* eslint-disable no-promise-executor-return */
import debounce from 'lodash.debounce';
import { getLocalizedErrorMessage } from '@/constants/backend-error-messages';
import { localize } from '@deriv-com/translations';
import { getLast } from '../../../utils/binary-utils';
import { observer as globalObserver } from '../../../utils/observer';
import { api_base } from '../../api/api-base';
import { getDirection, getLastDigit } from '../utils/helpers';
import { expectPositiveInteger } from '../utils/sanitize';
import * as constants from './state/constants';

let lastGlobalJournalTickStamp = '';
let lastGlobalConditionStamp = '';

const inspectWorkspaceJournalDigitWindow = explicitWindow => {
    const manual = Number(explicitWindow);
    if (Number.isFinite(manual) && manual >= 2 && manual <= 10) {
        return Math.floor(manual);
    }

    try {
        const ws = typeof window !== 'undefined' ? window.Blockly?.derivWorkspace : null;
        if (!ws || typeof ws.getAllBlocks !== 'function') return 1;

        const blocks = ws.getAllBlocks(false) || [];
        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];
            if (!b || (typeof b.isEnabled === 'function' && !b.isEnabled()) || b.disabled) continue;

            if (b.type === 'last_digits_condition') {
                const nInput = b.getInputTargetBlock?.('N');
                const nVal = Number(nInput?.getFieldValue?.('NUM') ?? b.getFieldValue?.('N'));
                if (Number.isFinite(nVal) && nVal >= 2 && nVal <= 10) {
                    return Math.floor(nVal);
                }
            }

            if (b.type === 'vh_virtual_streak_ready') {
                const sVal = Number(b.getFieldValue?.('STREAK'));
                if (Number.isFinite(sVal) && sVal >= 2 && sVal <= 10) {
                    return Math.floor(sVal);
                }
            }

            if (b.type === 'lists_getSublist') {
                const listTarget = b.getInputTargetBlock?.('LIST');
                const isDigitList =
                    listTarget?.type === 'lastDigitList' ||
                    (listTarget?.type === 'variables_get' &&
                        /digit/i.test(String(listTarget?.getField?.('VAR')?.getText?.() || '')));
                if (isDigitList) {
                    const at1 = Number(b.getInputTargetBlock?.('AT1')?.getFieldValue?.('NUM'));
                    const at2 = Number(b.getInputTargetBlock?.('AT2')?.getFieldValue?.('NUM'));
                    const candidate = Number.isFinite(at1) && at1 >= 2 && at1 <= 10 ? at1 : at2;
                    if (Number.isFinite(candidate) && candidate >= 2 && candidate <= 10) {
                        return Math.floor(candidate);
                    }
                }
            }
        }
    } catch (e) {
        // fallback to universal single last digit
    }

    return 1;
};

export default Engine =>
    class Ticks extends Engine {
        async watchTicks(symbol) {
            if (!symbol) return;
            const { ticksService } = this.$scope;
            const prevListener = ticksService?._activeBotWatchListener;

            if (this.symbol !== symbol || !this._tickListenerKey || prevListener?.engine !== this) {
                if (prevListener?.symbol && prevListener?.key) {
                    try {
                        await ticksService.stopMonitor({
                            symbol: prevListener.symbol,
                            key: prevListener.key,
                        });
                    } catch (e) {
                        // ignore stale listener cleanup errors
                    }
                    ticksService._activeBotWatchListener = null;
                }

                this.symbol = symbol;
                this._tickListenerKey = null;

                const callback = ticks => {
                    if (ticksService?._activeBotWatchListener && ticksService._activeBotWatchListener.engine !== this) {
                        return;
                    }
                    if (this.is_proposal_subscription_required) {
                        this.checkProposalReady();
                    }
                    const lastTick = ticks.slice(-1)[0];
                    if (!lastTick) return;
                    this.latestTick = lastTick;
                    const { epoch } = lastTick;
                    this.store.dispatch({ type: constants.NEW_TICK, payload: epoch });

                    const tickStamp = `${symbol}:${epoch}`;
                    if (!epoch || this._lastScheduledTickEpoch === epoch || lastGlobalJournalTickStamp === tickStamp) {
                        return;
                    }
                    this._lastScheduledTickEpoch = epoch;

                    const pipSize = this.getPipSize() ?? 2;
                    const snapshotTicks = ticks.slice(-10);

                    setTimeout(() => {
                        try {
                            if (
                                ticksService?._activeBotWatchListener &&
                                ticksService._activeBotWatchListener.engine !== this
                            ) {
                                return;
                            }
                            const currentScope = this.store?.getState?.()?.scope;
                            const isBotActive = currentScope && currentScope !== constants.STOP;
                            if (!isBotActive || lastGlobalJournalTickStamp === tickStamp) {
                                return;
                            }

                            lastGlobalJournalTickStamp = tickStamp;

                            // If the bot's own notify / condition blocks already wrote to the Journal on this tick,
                            // follow the bot's own output without emitting a duplicate generic line.
                            if (
                                this._lastCustomJournalEpoch === epoch ||
                                (this._lastCustomJournalAt && Date.now() - this._lastCustomJournalAt < 250)
                            ) {
                                return;
                            }

                            const windowSize = inspectWorkspaceJournalDigitWindow(this.journal_digit_window);
                            const recentDigits = snapshotTicks
                                .slice(-windowSize)
                                .map(t => getLastDigit(Number(t.quote).toFixed(pipSize)));
                            if (recentDigits.length > 0) {
                                globalObserver.emit('ui.log.success', {
                                    log_type: 'tick_digits',
                                    extra: {
                                        window_size: windowSize,
                                        digits: recentDigits,
                                    },
                                });
                            }
                        } catch (e) {
                            // non-blocking journal tick telemetry
                        }
                    }, 90);
                };

                const key = await ticksService.monitor({ symbol, callback });
                this._tickListenerKey = key;
                ticksService._activeBotWatchListener = { symbol, key, engine: this };
            }
        }

        checkTicksPromiseExists() {
            return this.$scope.ticksService.ticks_history_promise;
        }

        getTicks(toString = false) {
            return new Promise(resolve => {
                this.$scope.ticksService.request({ symbol: this.symbol }).then(ticks => {
                    const ticks_list = ticks.map(tick => {
                        if (toString) {
                            return tick.quote.toFixed(this.getPipSize());
                        }
                        return tick.quote;
                    });

                    resolve(ticks_list);
                });
            });
        }

        getLastTick(raw, toString = false) {
            return new Promise((resolve, reject) =>
                this.$scope.ticksService
                    .request({ symbol: this.symbol })
                    .then(ticks => {
                        try {
                            let last_tick = raw ? getLast(ticks) : getLast(ticks).quote;
                            if (!raw && toString) {
                                last_tick = last_tick.toFixed(this.getPipSize());
                            }
                            resolve(last_tick);
                        } catch (error) {
                            reject(error);
                        }
                    })
                    .catch(e => {
                        if (e.code === 'MarketIsClosed') {
                            const localizedError = {
                                ...e,
                                message: getLocalizedErrorMessage(e.code, e.details),
                            };
                            globalObserver.emit('Error', localizedError);
                            resolve(e.code);
                        }
                    })
            );
        }

        getLastDigit() {
            return new Promise(resolve => this.getLastTick(false, true).then(tick => resolve(getLastDigit(tick))));
        }

        getLastDigitList() {
            return new Promise(resolve => this.getTicks().then(ticks => resolve(this.getLastDigitsFromList(ticks))));
        }
        getLastDigitsFromList(ticks) {
            const digits = ticks.map(tick => {
                return getLastDigit(tick.toFixed(this.getPipSize()));
            });
            return digits;
        }

        async areLastDigitsEven(count) {
            const safeCount = Math.max(1, Number(count) || 1);
            if (safeCount > 1) this.journal_digit_window = safeCount;
            const digits = await this.getLastDigitList();
            const last_n = digits.slice(-safeCount);
            const result = last_n.length > 0 && last_n.every(d => d % 2 === 0);
            this.logLastDigitsAnalysis('ALL_EVEN', last_n, result);
            return result;
        }

        async areLastDigitsOdd(count) {
            const safeCount = Math.max(1, Number(count) || 1);
            if (safeCount > 1) this.journal_digit_window = safeCount;
            const digits = await this.getLastDigitList();
            const last_n = digits.slice(-safeCount);
            const result = last_n.length > 0 && last_n.every(d => d % 2 !== 0);
            this.logLastDigitsAnalysis('ALL_ODD', last_n, result);
            return result;
        }

        logBotCondition(condition, digits, result, summary) {
            this.logLastDigitsAnalysis(condition, digits, result, summary);
        }

        logLastDigitsAnalysis(condition, digits, result, summary) {
            const epoch = this.latestTick?.epoch ?? null;
            this._lastCustomJournalEpoch = epoch;
            this._lastCustomJournalAt = Date.now();
            const condKey = `${this.symbol || ''}:${epoch || ''}:${condition}`;
            if (epoch && lastGlobalConditionStamp === condKey) return;
            if (epoch) lastGlobalConditionStamp = condKey;

            const conditionText = condition === 'ALL_EVEN' ? 'all even' : condition === 'ALL_ODD' ? 'all odd' : condition;
            globalObserver.emit('ui.log.success', {
                log_type: 'digits_analysis',
                extra: { condition: conditionText, digits, result, summary },
            });
        }

        checkDirection(dir) {
            return new Promise(resolve =>
                this.$scope.ticksService
                    .request({ symbol: this.symbol })
                    .then(ticks => resolve(getDirection(ticks) === dir))
            );
        }

        getOhlc(args) {
            const { granularity = this.options.candleInterval || 60, field } = args || {};

            return new Promise(resolve =>
                this.$scope.ticksService
                    .request({ symbol: this.symbol, granularity })
                    .then(ohlc => resolve(field ? ohlc.map(o => o[field]) : ohlc))
            );
        }

        getOhlcFromEnd(args) {
            const { index: i = 1 } = args || {};

            const index = expectPositiveInteger(Number(i), localize('Index must be a positive integer'));

            return new Promise(resolve => this.getOhlc(args).then(ohlc => resolve(ohlc.slice(-index)[0])));
        }

        getPipSize() {
            return this.$scope.ticksService.pipSizes[this.symbol];
        }

        async requestAccumulatorStats() {
            const subscription_id = this.subscription_id_for_accumulators;
            const is_proposal_requested = this.is_proposal_requested_for_accumulators;
            const proposal_request = {
                ...window.Blockly.accumulators_request,
                amount: this?.tradeOptions?.amount,
                basis: this?.tradeOptions?.basis,
                contract_type: 'ACCU',
                currency: this?.tradeOptions?.currency,
                growth_rate: this?.tradeOptions?.growth_rate,
                proposal: 1,
                subscribe: 1,
                underlying_symbol: this?.tradeOptions?.symbol,
            };
            if (!subscription_id && !is_proposal_requested) {
                this.is_proposal_requested_for_accumulators = true;
                if (proposal_request) {
                    await api_base?.api?.send(proposal_request);
                }
            }
        }

        async handleOnMessageForAccumulators() {
            let ticks_stayed_in_list = [];
            return new Promise(resolve => {
                const subscription = api_base.api.onMessage().subscribe(msg => {
                    const data = msg?.data;
                    if (!data) return;
                    if (data.msg_type === 'proposal') {
                        try {
                            this.subscription_id_for_accumulators = data.subscription.id;
                            // this was done because we can multile arrays in the respone and the list comes in reverse order
                            const stat_list = (data.proposal.contract_details.ticks_stayed_in || []).flat().reverse();
                            ticks_stayed_in_list = [...stat_list, ...ticks_stayed_in_list];
                            if (ticks_stayed_in_list.length > 0) resolve(ticks_stayed_in_list);
                        } catch (error) {
                            globalObserver.emit('Unexpected message type or no proposal found:', error);
                        }
                    }
                });
                api_base.pushSubscription(subscription);
            });
        }

        async fetchStatsForAccumulators() {
            try {
                // request stats for accumulators
                const debouncedAccumulatorsRequest = debounce(() => this.requestAccumulatorStats(), 300);
                debouncedAccumulatorsRequest();
                // wait for proposal response
                const ticks_stayed_in_list = await this.handleOnMessageForAccumulators();
                return ticks_stayed_in_list;
            } catch (error) {
                globalObserver.emit('Error in subscription promise:', error);
                throw error;
            } finally {
                // forget all proposal subscriptions so we can fetch new stats data on new call
                await api_base?.api?.send({ forget_all: 'proposal' });
                this.is_proposal_requested_for_accumulators = false;
                this.subscription_id_for_accumulators = null;
            }
        }

        async getCurrentStat() {
            try {
                const ticks_stayed_in = await this.fetchStatsForAccumulators();
                return ticks_stayed_in?.[0];
            } catch (error) {
                globalObserver.emit('Error fetching current stat:', error);
            }
        }

        async getStatList() {
            try {
                const ticks_stayed_in = await this.fetchStatsForAccumulators();
                // we need to send only lastest 100 ticks
                return ticks_stayed_in?.slice(0, 100);
            } catch (error) {
                globalObserver.emit('Error fetching current stat:', error);
            }
        }

        async getDelayTickValue(tick_value) {
            return new Promise((resolve, reject) => {
                try {
                    const ticks = [];
                    const symbol = this.symbol;

                    const resolveAndExit = () => {
                        this.$scope.ticksService.stopMonitor({
                            symbol,
                            key: '',
                        });
                        resolve(ticks);
                        ticks.length = 0;
                    };

                    const watchTicks = tick_list => {
                        ticks.push(tick_list);
                        const current_tick = ticks.length;
                        if (current_tick === tick_value) {
                            resolveAndExit();
                        }
                    };

                    const delayExecution = tick_list => watchTicks(tick_list);

                    if (Number(tick_value) <= 0) resolveAndExit();
                    this.$scope.ticksService.monitor({ symbol, callback: delayExecution });
                } catch (error) {
                    reject(new Error(`Failed to start tick monitoring: ${error.message}`));
                }
            });
        }
    };
