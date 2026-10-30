import React from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { LabelPairedPlayLgFillIcon, LabelPairedSquareLgFillIcon } from '@deriv/quill-icons/LabelPaired';
import { Localize, localize } from '@deriv-com/translations';
import './run-strategy.scss';

const formatDockMoney = (value: number | undefined | null, signed = false) => {
    const num = Number(value || 0);
    if (!Number.isFinite(num) || num === 0) return '0.00';
    const abs = Math.abs(num).toFixed(2);
    if (signed) return num > 0 ? `+${abs}` : `-${abs}`;
    return num.toFixed(2);
};

const RunStrategy = observer(() => {
    const { run_panel, transactions, dashboard, blockly_store } = useStore();
    const { active_tab } = dashboard;
    const { has_active_bot, has_saved_bots } = blockly_store;
    const {
        contract_stage,
        is_stop_button_visible,
        is_stop_button_disabled,
        is_paused,
        is_clear_stat_disabled,
        onClearStatClick,
        onRunButtonClick,
        onStopBotClick,
        onPauseBotClick,
        onResumeBotClick,
    } = run_panel;
    const { statistics } = transactions;
    const { total_payout, total_profit, total_stake, won_contracts, lost_contracts, number_of_runs } = statistics;

    const [isFastExec, setIsFastExec] = React.useState<boolean>(() => {
        try {
            const saved = localStorage.getItem('tp_fast_execution');
            const enabled = saved === null ? true : saved === 'true';
            (window as any).__tpExecutionFast = enabled;
            return enabled;
        } catch {
            return true;
        }
    });

    const toggleFastExec = React.useCallback(() => {
        setIsFastExec(prev => {
            const next = !prev;
            try {
                localStorage.setItem('tp_fast_execution', String(next));
                (window as any).__tpExecutionFast = next;
            } catch {
                // ignore storage errors
            }
            return next;
        });
    }, []);

    const has_no_bots = !has_active_bot && !has_saved_bots;
    const is_bot_builder_tab = active_tab === DBOT_TABS.BOT_BUILDER;
    const is_run_disabled = !is_stop_button_visible && ((has_no_bots && !is_bot_builder_tab) || contract_stage === 3);

    const handlePrimaryAction = () => {
        if (is_paused) {
            onResumeBotClick();
            return;
        }
        if (is_stop_button_visible) {
            onStopBotClick();
            return;
        }
        onRunButtonClick();
    };

    const isStoppingMode = is_stop_button_visible && !is_stop_button_disabled && !is_paused;

    return (
        <div className='tp-exec-dock' data-testid='dt_run_strategy'>
            <div className='tp-exec-dock__controls'>
                <button
                    type='button'
                    id='db-run-panel__clear-button'
                    className='tp-exec-dock__reset-btn'
                    disabled={is_clear_stat_disabled}
                    onClick={onClearStatClick}
                    title={localize('Reset statistics and journal')}
                >
                    <svg width='14' height='14' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                        <path
                            d='M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z'
                            fill='currentColor'
                        />
                    </svg>
                    <span>
                        <Localize i18n_default_text='Reset' />
                    </span>
                </button>

                <button
                    type='button'
                    id={isStoppingMode ? 'db-animation__stop-button' : 'db-animation__run-button'}
                    className={classNames('tp-exec-dock__run-btn', {
                        'tp-exec-dock__run-btn--stop': isStoppingMode,
                    })}
                    disabled={is_run_disabled}
                    onClick={handlePrimaryAction}
                >
                    {isStoppingMode ? (
                        <>
                            <LabelPairedSquareLgFillIcon fill='#ffffff' />
                            <span>
                                <Localize i18n_default_text='Stop' />
                            </span>
                        </>
                    ) : (
                        <>
                            <LabelPairedPlayLgFillIcon fill='#ffffff' />
                            <span>
                                {is_paused ? (
                                    <Localize i18n_default_text='Resume' />
                                ) : (
                                    <Localize i18n_default_text='Run' />
                                )}
                            </span>
                        </>
                    )}
                </button>

                {isStoppingMode && (
                    <button
                        type='button'
                        id='db-animation__pause-button'
                        className='tp-exec-dock__pause-btn'
                        onClick={onPauseBotClick}
                        title={localize('Pause bot')}
                    >
                        <svg width='13' height='13' viewBox='0 0 16 16' fill='none' aria-hidden='true'>
                            <rect x='3' y='2' width='3.5' height='12' rx='1' fill='currentColor' />
                            <rect x='9.5' y='2' width='3.5' height='12' rx='1' fill='currentColor' />
                        </svg>
                    </button>
                )}

                <button
                    type='button'
                    className={classNames('tp-exec-dock__fast-card', {
                        'tp-exec-dock__fast-card--active': isFastExec,
                    })}
                    onClick={toggleFastExec}
                    title={localize('Toggle Fast Execution Mode')}
                >
                    <div className='tp-exec-dock__fast-text'>
                        <span className='tp-exec-dock__fast-kicker'>EXECUTION</span>
                        <span className='tp-exec-dock__fast-mode'>{isFastExec ? 'FAST' : 'NORMAL'}</span>
                    </div>
                    <span
                        className={classNames('tp-exec-dock__switch', {
                            'tp-exec-dock__switch--on': isFastExec,
                        })}
                    >
                        <span className='tp-exec-dock__switch-knob' />
                    </span>
                </button>
            </div>

            <div className='tp-exec-dock__stats-shell'>
                <div className='tp-exec-dock__stats'>
                    <div className='tp-exec-dock__stat-box'>
                        <span className='tp-exec-dock__stat-label'>{localize('Stake')}</span>
                        <span className='tp-exec-dock__stat-val'>{formatDockMoney(total_stake)}</span>
                    </div>
                    <div className='tp-exec-dock__stat-box'>
                        <span className='tp-exec-dock__stat-label'>{localize('Payout')}</span>
                        <span className='tp-exec-dock__stat-val'>{formatDockMoney(total_payout)}</span>
                    </div>
                    <div className='tp-exec-dock__stat-box'>
                        <span className='tp-exec-dock__stat-label'>{localize('Runs')}</span>
                        <span className='tp-exec-dock__stat-val'>{number_of_runs}</span>
                    </div>
                    <div className='tp-exec-dock__stat-box'>
                        <span className='tp-exec-dock__stat-label'>{localize('Won')}</span>
                        <span
                            className={classNames('tp-exec-dock__stat-val', {
                                'tp-exec-dock__stat-val--pos': won_contracts > 0,
                            })}
                        >
                            {won_contracts}
                        </span>
                    </div>
                    <div className='tp-exec-dock__stat-box'>
                        <span className='tp-exec-dock__stat-label'>{localize('Lost')}</span>
                        <span
                            className={classNames('tp-exec-dock__stat-val', {
                                'tp-exec-dock__stat-val--neg': lost_contracts > 0,
                            })}
                        >
                            {lost_contracts}
                        </span>
                    </div>
                    <div className='tp-exec-dock__stat-box'>
                        <span className='tp-exec-dock__stat-label'>{localize('P/L')}</span>
                        <span
                            className={classNames('tp-exec-dock__stat-val', {
                                'tp-exec-dock__stat-val--pos': total_profit > 0,
                                'tp-exec-dock__stat-val--neg': total_profit < 0,
                            })}
                        >
                            {formatDockMoney(total_profit, true)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default RunStrategy;
