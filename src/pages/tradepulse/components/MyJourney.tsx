// @ts-nocheck — TradePulse component with known type gaps
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useTradePulse } from '../TradePulseContext';
import { localize } from '@deriv-com/translations';
import {
    getCurrentJourneyDay,
    computeJourneyDay,
    buildSchedule,
    formatCurrency,
    saveJourney,
} from '../utils/calculations';
import useTradePulseData from '../hooks/useTradePulseData';
import './MyJourney.scss';

const MyJourney = observer(() => {
    const store = useStore();
    const storeLoginid = store?.client?.loginid || localStorage.getItem('active_loginid') || null;
    const { balance, currency: dataCurrency, overallStats, todayStats } = useTradePulseData();
    const curr = store?.client?.currency || dataCurrency || 'USD';

    const {
        journey,
        schedule,
        journeyLoading,
        currentAccount,
        refreshJourney,
        resetJourney,
    } = useTradePulse();

    const [showJourneyModal, setShowJourneyModal] = useState(false);
    const [isLocking, setIsLocking] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const fmtNum = (val: number) =>
        Number(val || 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });

    const currentDay = journey ? getCurrentJourneyDay(journey.start_date) : 1;
    const rows = schedule?.rows && schedule.rows.length > 0
        ? schedule.rows
        : journey
        ? buildSchedule(journey)
        : [];

    const clampedDay = rows.length > 0 ? Math.min(Math.max(currentDay, 1), rows.length) : 1;
    const baseRow = rows[clampedDay - 1];
    const computedRow = baseRow ? computeJourneyDay(baseRow, balance, currentDay) : undefined;
    const displayRow = computedRow || baseRow;
    const finalRow = rows.length > 0 ? rows[rows.length - 1] : undefined;

    const progressPct = journey
        ? Math.min(100, Math.max(0, Math.round(((clampedDay - 1) / journey.cycle_length_days) * 100)))
        : 0;
    const delta = balance - (baseRow?.end ?? 0);
    const isAhead = delta >= 0;

    // Session metrics (uses today's stats when trades exist today, otherwise overall stats)
    const activeStats = (todayStats?.total_trades ?? 0) > 0 ? todayStats : overallStats;
    const totalTrades = activeStats?.total_trades || 0;
    const winRate = activeStats?.win_rate || 0;
    const winStreak = activeStats?.win_streak || 0;
    const lossStreak = activeStats?.loss_streak || 0;
    const streakLabel =
        winStreak > 0 ? `${winStreak}W` : lossStreak > 0 ? `${lossStreak}L` : '0';
    const sessionProfit = activeStats?.total_profit || 0;

    const handleLockJourney = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const loginid = currentAccount || storeLoginid;
        if (!loginid) {
            setErrorMsg('No active Deriv account detected.');
            return;
        }
        setIsLocking(true);
        setErrorMsg(null);

        const form = e.currentTarget;
        const initial_balance = Number(
            (form.elements.namedItem('j-initial') as HTMLInputElement).value
        );
        const daily_target_pct = Number(
            (form.elements.namedItem('j-rate') as HTMLInputElement).value
        );
        const cycle_length_days = Number(
            (form.elements.namedItem('j-days') as HTMLInputElement).value
        );
        const start_date = (form.elements.namedItem('j-start') as HTMLInputElement).value;

        try {
            await saveJourney(loginid, {
                loginid,
                initial_balance,
                daily_target_pct,
                cycle_length_days,
                start_date,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
            await refreshJourney(loginid);
            setShowJourneyModal(false);
        } catch (err) {
            console.error('Lock journey failed:', err);
            setErrorMsg(err instanceof Error ? err.message : 'Failed to lock journey');
        } finally {
            setIsLocking(false);
        }
    };

    const handleResetJourney = async () => {
        const loginid = currentAccount || storeLoginid;
        if (!loginid) return;
        setIsResetting(true);
        try {
            await resetJourney(loginid);
            await refreshJourney(loginid);
            setShowResetModal(false);
        } catch (err) {
            console.error('Reset journey failed:', err);
        } finally {
            setIsResetting(false);
        }
    };

    const renderModals = () => (
        <>
            {showJourneyModal && (
                <div className='tradepulse__modal-overlay'>
                    <div className='tradepulse__modal fade-in'>
                        <h3 className='tradepulse__modal-title'>{localize('Lock Your Journey')}</h3>
                        <p className='tradepulse__modal-text'>
                            {localize(
                                'Once locked, your compounding plan runs automatically each day until you complete the cycle or reset it.'
                            )}
                        </p>
                        {errorMsg && <div className='tp-journey-alert'>{errorMsg}</div>}
                        <form onSubmit={handleLockJourney} className='tp-journey-modal-form'>
                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>
                                    {localize('Starting Balance')} ({curr})
                                </label>
                                <div className='tradepulse__input-wrap'>
                                    <span className='tradepulse__input-prefix'>$</span>
                                    <input
                                        type='number'
                                        name='j-initial'
                                        className='tradepulse__form-input'
                                        defaultValue={balance > 0 ? balance.toFixed(2) : '50.00'}
                                        step='0.01'
                                        min='1'
                                        required
                                    />
                                </div>
                            </div>

                            <div className='tp-journey-modal-row'>
                                <div className='tradepulse__form-group'>
                                    <label className='tradepulse__form-label'>
                                        {localize('Daily Return (%)')}
                                    </label>
                                    <input
                                        type='number'
                                        name='j-rate'
                                        className='tradepulse__form-input'
                                        defaultValue='10.0'
                                        step='0.1'
                                        min='0.1'
                                        max='100'
                                        required
                                    />
                                </div>
                                <div className='tradepulse__form-group'>
                                    <label className='tradepulse__form-label'>
                                        {localize('Cycle Length (Days)')}
                                    </label>
                                    <input
                                        type='number'
                                        name='j-days'
                                        className='tradepulse__form-input'
                                        defaultValue='30'
                                        step='1'
                                        min='1'
                                        max='365'
                                        required
                                    />
                                </div>
                            </div>

                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>
                                    {localize('Start Date')}
                                </label>
                                <input
                                    type='date'
                                    name='j-start'
                                    className='tradepulse__form-input'
                                    defaultValue={new Date().toISOString().slice(0, 10)}
                                    required
                                />
                            </div>

                            <div className='tradepulse__modal-actions'>
                                <button
                                    type='button'
                                    className='tradepulse__btn tradepulse__btn--secondary'
                                    onClick={() => setShowJourneyModal(false)}
                                >
                                    {localize('Cancel')}
                                </button>
                                <button
                                    type='submit'
                                    className='tradepulse__btn tradepulse__btn--primary'
                                    disabled={isLocking}
                                >
                                    {isLocking
                                        ? localize('Locking...')
                                        : localize('Confirm & Lock Plan')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showResetModal && (
                <div className='tradepulse__modal-overlay'>
                    <div className='tradepulse__modal fade-in'>
                        <h3 className='tradepulse__modal-title'>{localize('Reset Journey?')}</h3>
                        <p className='tradepulse__modal-text'>
                            {localize(
                                'This will unlock and clear your active compounding schedule so you can configure a fresh plan. Your Deriv account balance and trading history will not be affected.'
                            )}
                        </p>
                        <div className='tradepulse__modal-actions'>
                            <button
                                type='button'
                                className='tradepulse__btn tradepulse__btn--secondary'
                                onClick={() => setShowResetModal(false)}
                            >
                                {localize('Cancel')}
                            </button>
                            <button
                                type='button'
                                className='tradepulse__btn tradepulse__btn--danger'
                                onClick={handleResetJourney}
                                disabled={isResetting}
                            >
                                {isResetting ? localize('Resetting...') : localize('Yes, Reset Plan')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );

    if (journeyLoading) {
        return (
            <div className='tradepulse__page fade-in'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-body'>
                        <div className='tradepulse__skeleton tradepulse__skeleton-title' />
                        <div className='tradepulse__skeleton tradepulse__skeleton-text tradepulse__skeleton-text--medium' />
                    </div>
                </div>
                <div className='tradepulse__kpi-grid'>
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className='tradepulse__kpi-card'>
                            <div className='tradepulse__skeleton tradepulse__skeleton-text tradepulse__skeleton-text--short' />
                            <div className='tradepulse__skeleton tradepulse__skeleton-title' />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (!journey || rows.length === 0) {
        return (
            <div className='tradepulse__page fade-in'>
                <div className='tp-empty-card'>
                    <div className='tp-empty-card__icon'>
                        <svg
                            width='28'
                            height='28'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        >
                            <circle cx='12' cy='12' r='10' />
                            <polyline points='12 6 12 12 16 14' />
                        </svg>
                    </div>
                    <h2 className='tp-empty-card__title'>
                        {localize('Start Your Compounding Journey')}
                    </h2>
                    <p className='tp-empty-card__desc'>
                        {localize(
                            'Lock in your starting equity, daily return target, and cycle length to track daily targets automatically against your live Deriv balance.'
                        )}
                    </p>
                    <button
                        type='button'
                        className='tradepulse__btn tradepulse__btn--primary'
                        onClick={() => setShowJourneyModal(true)}
                    >
                        + {localize('Start My Journey')}
                    </button>
                </div>
                {renderModals()}
            </div>
        );
    }

    const startingBal = displayRow?.start ?? journey.initial_balance;
    const targetProfit = displayRow?.profit ?? 0;
    const expectedBal = displayRow?.end ?? journey.initial_balance;
    const finalGoalBal = finalRow?.end ?? expectedBal;

    return (
        <div className='tradepulse__page fade-in'>
            {/* Soft Lavender / Indigo Hero Banner */}
            <section className='tp-hero'>
                <div>
                    <div className='tp-hero__eyebrow'>
                        TODAY • DAY {clampedDay} OF {journey.cycle_length_days}
                    </div>
                    <h1 className='tp-hero__title'>{localize("Today's Target")}</h1>
                    <p className='tp-hero__sub'>
                        <svg
                            width='15'
                            height='15'
                            viewBox='0 0 24 24'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth='2.2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        >
                            <rect x='3' y='11' width='18' height='11' rx='2' ry='2' />
                            <path d='M7 11V7a5 5 0 0 1 10 0v4' />
                        </svg>
                        <span>{localize('Journey Locked — Linked to account')}</span>
                    </p>
                </div>

                <button
                    type='button'
                    className='tp-hero__reset-btn'
                    onClick={() => setShowResetModal(true)}
                >
                    {localize('Reset Journey')}
                </button>
            </section>

            {/* 3x2 Executive Bento KPI Grid */}
            <section className='tradepulse__kpi-grid'>
                {/* 1. Starting Balance */}
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>
                            {localize('Starting Balance')}
                        </span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--slate'>
                            $
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value'>
                        <span className='tp-curr'>{curr}</span>
                        {fmtNum(startingBal)}
                    </div>
                    <div className='tradepulse__kpi-sub'>
                        Initial {formatCurrency(journey.initial_balance, curr)}
                    </div>
                </div>

                {/* 2. Today's Profit Target */}
                <div className='tradepulse__kpi-card tradepulse__kpi-card--accent'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>
                            {localize("Today's Profit Target")}
                        </span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--indigo'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2.2'
                            >
                                <polyline points='23 6 13.5 15.5 8.5 10.5 1 18' />
                                <polyline points='17 6 23 6 23 12' />
                            </svg>
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value tradepulse__kpi-value--brand'>
                        <span className='tp-underline-brand'>
                            +{curr} {fmtNum(targetProfit)}
                        </span>
                    </div>
                    <div className='tradepulse__kpi-sub'>
                        +{Number(journey.daily_target_pct).toFixed(1)}% daily compounding
                    </div>
                </div>

                {/* 3. Required % */}
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Required %')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--emerald'>
                            %
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value'>
                        {Number(journey.daily_target_pct).toFixed(1)}%
                    </div>
                    <div className='tradepulse__kpi-sub'>Compounded daily target</div>
                </div>

                {/* 4. Expected Balance */}
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>
                            {localize('Expected Balance')}
                        </span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--slate'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2'
                            >
                                <rect x='3' y='4' width='18' height='18' rx='2' ry='2' />
                                <line x1='16' y1='2' x2='16' y2='6' />
                                <line x1='8' y1='2' x2='8' y2='6' />
                                <line x1='3' y1='10' x2='21' y2='10' />
                            </svg>
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value'>
                        <span className='tp-curr'>{curr}</span>
                        {fmtNum(expectedBal)}
                    </div>
                    <div className='tradepulse__kpi-sub'>End of Day {clampedDay} goal</div>
                </div>

                {/* 5. Live Balance */}
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Live Balance')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--slate'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2'
                            >
                                <polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
                            </svg>
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value tradepulse__kpi-value--live'>
                        <span className={`tp-underline${!isAhead ? ' tp-underline--loss' : ''}`}>
                            <span className='tp-curr'>{curr}</span>
                            {fmtNum(balance)}
                        </span>
                    </div>
                    <div
                        className={`tradepulse__kpi-sub ${
                            isAhead ? 'tradepulse__kpi-sub--profit' : 'tradepulse__kpi-sub--loss'
                        }`}
                    >
                        {isAhead
                            ? `+${formatCurrency(delta, curr)} ahead of target`
                            : `${formatCurrency(delta, curr)} behind target`}
                    </div>
                </div>

                {/* 6. Cycle Final Goal */}
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>
                            {journey.cycle_length_days}-Day Goal
                        </span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--indigo'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2'
                            >
                                <circle cx='12' cy='12' r='10' />
                                <circle cx='12' cy='12' r='6' />
                                <circle cx='12' cy='12' r='2' />
                            </svg>
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value tradepulse__kpi-value--brand'>
                        <span className='tp-curr'>{curr}</span>
                        {fmtNum(finalGoalBal)}
                    </div>
                    <div className='tradepulse__kpi-sub'>Projected final equity</div>
                </div>
            </section>

            {/* Cycle Progress + Session Strip */}
            <section className='tradepulse__progress-card'>
                <div className='tradepulse__progress-header'>
                    <div>
                        <div className='tradepulse__progress-label'>
                            {localize('Cycle Progress')}
                        </div>
                        <div className='tradepulse__progress-sub'>
                            Day {clampedDay} of {journey.cycle_length_days} • Started{' '}
                            {journey.start_date}
                        </div>
                    </div>
                    <div className='tradepulse__progress-pct'>{progressPct}%</div>
                </div>

                <div className='tradepulse__progress-track-wrap'>
                    <div className='tradepulse__progress-bar'>
                        <div
                            className='tradepulse__progress-fill'
                            style={{ width: `${Math.max(4, progressPct)}%` }}
                        />
                    </div>
                </div>

                <div className='tradepulse__session-strip'>
                    <div className='tradepulse__session-metric'>
                        <div className='tradepulse__session-metric-label'>
                            {localize('Trades Today')}
                        </div>
                        <div className='tradepulse__session-metric-val'>{totalTrades}</div>
                    </div>
                    <div className='tradepulse__session-metric'>
                        <div className='tradepulse__session-metric-label'>
                            {localize('Win Rate')}
                        </div>
                        <div className='tradepulse__session-metric-val'>
                            {winRate.toFixed(1)}%
                        </div>
                    </div>
                    <div className='tradepulse__session-metric'>
                        <div className='tradepulse__session-metric-label'>
                            {localize('Streak')}
                        </div>
                        <div
                            className={`tradepulse__session-metric-val ${
                                winStreak > 0
                                    ? 'tradepulse__text-success'
                                    : lossStreak > 0
                                    ? 'tradepulse__text-danger'
                                    : ''
                            }`}
                        >
                            {streakLabel}
                        </div>
                    </div>
                    <div className='tradepulse__session-metric'>
                        <div className='tradepulse__session-metric-label'>
                            {localize('Session Net P/L')}
                        </div>
                        <div
                            className={`tradepulse__session-metric-val ${
                                sessionProfit >= 0
                                    ? 'tradepulse__text-success'
                                    : 'tradepulse__text-danger'
                            }`}
                        >
                            {sessionProfit >= 0 ? '+' : ''}
                            {formatCurrency(sessionProfit, curr)}
                        </div>
                    </div>
                </div>
            </section>

            {renderModals()}
        </div>
    );
});

export default MyJourney;
