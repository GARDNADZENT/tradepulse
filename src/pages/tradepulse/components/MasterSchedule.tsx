// @ts-nocheck — TradePulse component with known type gaps
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useTradePulse } from '../TradePulseContext';
import { localize } from '@deriv-com/translations';
import {
    saveJourney,
    buildSchedule,
    getCurrentJourneyDay,
    computeJourneyDay,
    formatCurrency,
} from '../utils/calculations';
import useTradePulseData from '../hooks/useTradePulseData';
import './MasterSchedule.scss';

const MasterSchedule = observer(() => {
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid || localStorage.getItem('active_loginid') || '';
    const { balance, currency: dataCurrency } = useTradePulseData();
    const curr = client?.currency || dataCurrency || 'USD';

    const { journey, schedule, journeyLoading, refreshJourney } = useTradePulse();
    const [isGenerating, setIsGenerating] = useState(false);

    const [form, setForm] = useState({
        initial_balance: balance > 0 ? Number(balance.toFixed(2)) : 50,
        daily_target_pct: 5,
        cycle_length_days: 30,
        start_date: new Date().toISOString().slice(0, 10),
    });

    useEffect(() => {
        if (journey) {
            setForm({
                initial_balance: journey.initial_balance,
                daily_target_pct: journey.daily_target_pct,
                cycle_length_days: journey.cycle_length_days,
                start_date: journey.start_date,
            });
        } else if (balance > 0 && form.initial_balance === 0) {
            setForm(prev => ({ ...prev, initial_balance: Number(balance.toFixed(2)) }));
        }
    }, [journey, balance]);

    const handleGenerate = useCallback(async () => {
        if (!loginid) return;
        setIsGenerating(true);
        const locked = {
            loginid,
            initial_balance: Number(form.initial_balance) || 0,
            daily_target_pct: Number(form.daily_target_pct) || 0,
            cycle_length_days: Number(form.cycle_length_days) || 30,
            start_date: form.start_date || new Date().toISOString().slice(0, 10),
            created_at: journey?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        try {
            await saveJourney(loginid, locked);
            await refreshJourney(loginid);
        } catch (e) {
            console.error('Generate schedule failed:', e);
        } finally {
            setIsGenerating(false);
        }
    }, [loginid, form, journey, refreshJourney]);

    const updateField = useCallback((field: string, value: string | number) => {
        setForm(prev => ({ ...prev, [field]: value }));
    }, []);

    // Use locked schedule rows when active, or live preview schedule built from form
    const rows = useMemo(() => {
        if (schedule?.rows && schedule.rows.length > 0) {
            return schedule.rows;
        }
        if (journey) {
            return buildSchedule(journey);
        }
        return buildSchedule({
            loginid: loginid || 'preview',
            initial_balance: Number(form.initial_balance) || 50,
            daily_target_pct: Number(form.daily_target_pct) || 5,
            cycle_length_days: Number(form.cycle_length_days) || 30,
            start_date: form.start_date || new Date().toISOString().slice(0, 10),
        });
    }, [schedule, journey, form, loginid]);

    const activeStartDate = journey ? journey.start_date : form.start_date;
    const currentDay = activeStartDate ? getCurrentJourneyDay(activeStartDate) : 1;
    const finalEquity =
        rows.length > 0 ? rows[rows.length - 1].end : Number(form.initial_balance || 0);

    if (journeyLoading) {
        return (
            <div className='tradepulse__page fade-in'>
                <div className='tp-plan-grid'>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className='tp-plan-card'>
                            <div className='tradepulse__skeleton tradepulse__skeleton-text tradepulse__skeleton-text--short' />
                            <div className='tradepulse__skeleton tradepulse__skeleton-title' />
                        </div>
                    ))}
                </div>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-body'>
                        <div className='tradepulse__skeleton tradepulse__skeleton-card' />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='tradepulse__page fade-in'>
            {/* 4-Card Compounding Summary Strip */}
            <section className='tp-plan-grid'>
                <div className='tp-plan-card'>
                    <span className='tp-plan-card__label'>{localize('Initial Balance')}</span>
                    <span className='tp-plan-card__val'>
                        {formatCurrency(
                            Number(journey ? journey.initial_balance : form.initial_balance || 0),
                            curr
                        )}
                    </span>
                </div>

                <div className='tp-plan-card'>
                    <span className='tp-plan-card__label'>{localize('Daily Target')}</span>
                    <span className='tp-plan-card__val tradepulse__text-brand'>
                        +
                        {Number(
                            journey ? journey.daily_target_pct : form.daily_target_pct || 0
                        ).toFixed(1)}
                        % / day
                    </span>
                </div>

                <div className='tp-plan-card'>
                    <span className='tp-plan-card__label'>{localize('Cycle Length')}</span>
                    <span className='tp-plan-card__val'>
                        {journey ? journey.cycle_length_days : form.cycle_length_days} Days
                    </span>
                </div>

                <div className='tp-plan-card'>
                    <span className='tp-plan-card__label'>
                        {localize('Projected Final Equity')}
                    </span>
                    <span className='tp-plan-card__val tradepulse__text-success'>
                        {formatCurrency(finalEquity, curr)}
                    </span>
                    <span className='tp-plan-card__badge'>
                        {journey ? (
                            <>
                                <svg
                                    width='12'
                                    height='12'
                                    viewBox='0 0 24 24'
                                    fill='none'
                                    stroke='currentColor'
                                    strokeWidth='2.5'
                                >
                                    <rect x='3' y='11' width='18' height='11' rx='2' ry='2' />
                                    <path d='M7 11V7a5 5 0 0 1 10 0v4' />
                                </svg>
                                {localize('Locked Compounding Plan')}
                            </>
                        ) : (
                            localize('Interactive Preview')
                        )}
                    </span>
                </div>
            </section>

            {/* Schedule Setup Card — shown when no locked plan exists yet */}
            {!journey && (
                <section className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div>
                            <h2 className='tradepulse__section-title'>
                                {localize('Configure & Lock Schedule')}
                            </h2>
                            <p className='tradepulse__section-subtitle'>
                                {localize(
                                    'Set your trading goal below to preview or lock your complete daily compounding plan.'
                                )}
                            </p>
                        </div>
                    </div>
                    <div className='tradepulse__card-body'>
                        <form
                            onSubmit={e => {
                                e.preventDefault();
                                handleGenerate();
                            }}
                            className='tradepulse__form-grid'
                        >
                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>
                                    {localize('Initial Balance')} ({curr})
                                </label>
                                <div className='tradepulse__input-wrap'>
                                    <span className='tradepulse__input-prefix'>$</span>
                                    <input
                                        type='number'
                                        className='tradepulse__form-input'
                                        value={form.initial_balance}
                                        onChange={e =>
                                            updateField('initial_balance', e.target.value)
                                        }
                                        min='1'
                                        step='0.01'
                                        required
                                    />
                                </div>
                            </div>

                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>
                                    {localize('Daily Target (%)')}
                                </label>
                                <input
                                    type='number'
                                    className='tradepulse__form-input'
                                    value={form.daily_target_pct}
                                    onChange={e => updateField('daily_target_pct', e.target.value)}
                                    min='0.1'
                                    max='100'
                                    step='0.1'
                                    required
                                />
                            </div>

                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>
                                    {localize('Trading Days')}
                                </label>
                                <input
                                    type='number'
                                    className='tradepulse__form-input'
                                    value={form.cycle_length_days}
                                    onChange={e =>
                                        updateField('cycle_length_days', e.target.value)
                                    }
                                    min='1'
                                    max='365'
                                    step='1'
                                    required
                                />
                            </div>

                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>
                                    {localize('Start Date')}
                                </label>
                                <input
                                    type='date'
                                    className='tradepulse__form-input'
                                    value={form.start_date}
                                    onChange={e => updateField('start_date', e.target.value)}
                                    required
                                />
                            </div>

                            <div className='tradepulse__form-actions'>
                                <button
                                    type='submit'
                                    className='tradepulse__btn tradepulse__btn--primary'
                                    disabled={isGenerating || !loginid}
                                >
                                    {isGenerating
                                        ? localize('Generating Plan...')
                                        : localize('Lock & Generate Plan')}
                                </button>
                            </div>
                        </form>
                    </div>
                </section>
            )}

            {/* Master Compounding Schedule Table */}
            {rows.length > 0 && (
                <section className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div>
                            <h2 className='tradepulse__section-title'>
                                {localize('Master Compounding Schedule')}
                            </h2>
                            <p className='tradepulse__section-subtitle'>
                                {rows.length} trading days • Started {activeStartDate}
                            </p>
                        </div>
                        <span className='tradepulse__chip tradepulse__chip--today'>
                            {journey
                                ? `Active • Day ${Math.max(
                                      1,
                                      Math.min(currentDay, rows.length)
                                  )} of ${rows.length}`
                                : `${rows.length}-Day Preview`}
                        </span>
                    </div>

                    <div className='tradepulse__table-wrapper tp-schedule-scroll'>
                        <table className='tradepulse__table'>
                            <thead>
                                <tr>
                                    <th>{localize('Day')}</th>
                                    <th>{localize('Date')}</th>
                                    <th className='tradepulse__table-right'>
                                        {localize('Starting Bal')}
                                    </th>
                                    <th className='tradepulse__table-right'>
                                        {localize('Target Profit')}
                                    </th>
                                    <th className='tradepulse__table-right'>
                                        {localize('Expected End Bal')}
                                    </th>
                                    <th className='tradepulse__table-right'>
                                        {localize('Actual End Bal')}
                                    </th>
                                    <th className='tradepulse__table-center'>
                                        {localize('Status')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(rawRow => {
                                    const computed =
                                        computeJourneyDay(rawRow, balance, currentDay) || rawRow;
                                    const isToday = computed.day === currentDay;

                                    let actualEl: React.ReactNode = (
                                        <span className='tradepulse__text-muted'>—</span>
                                    );
                                    let statusEl: React.ReactNode = (
                                        <span className='tradepulse__chip tradepulse__chip--pending'>
                                            {localize('Pending')}
                                        </span>
                                    );

                                    if (computed.actual != null) {
                                        actualEl = (
                                            <span
                                                className={`tradepulse__table-bold ${
                                                    isToday
                                                        ? 'tradepulse__text-brand'
                                                        : computed.status === 'complete'
                                                        ? 'tradepulse__text-success'
                                                        : 'tradepulse__text-danger'
                                                }`}
                                            >
                                                {formatCurrency(computed.actual, curr)}
                                                {isToday ? ' (Live)' : ''}
                                            </span>
                                        );
                                    }

                                    if (computed.status === 'complete') {
                                        statusEl = (
                                            <span className='tradepulse__chip tradepulse__chip--ontrack'>
                                                {localize('Completed')}
                                            </span>
                                        );
                                    } else if (isToday) {
                                        statusEl = (
                                            <span className='tradepulse__chip tradepulse__chip--today'>
                                                {localize('Today • Active')}
                                            </span>
                                        );
                                    } else if (
                                        computed.status === 'behind' ||
                                        computed.status === 'missed'
                                    ) {
                                        statusEl = (
                                            <span className='tradepulse__chip tradepulse__chip--below'>
                                                {localize('Below')}
                                            </span>
                                        );
                                    }

                                    return (
                                        <tr
                                            key={computed.day}
                                            className={isToday ? 'tradepulse__table-row--today' : ''}
                                        >
                                            <td className='tradepulse__table-name'>
                                                Day {computed.day}
                                                {isToday && (
                                                    <span className='tp-today-dot' title='Today' />
                                                )}
                                            </td>
                                            <td className='tradepulse__table-mono'>
                                                {computed.date}
                                            </td>
                                            <td className='tradepulse__table-right tradepulse__table-mono'>
                                                {formatCurrency(computed.start, curr)}
                                            </td>
                                            <td className='tradepulse__table-right tradepulse__table-mono tradepulse__text-brand tradepulse__table-bold'>
                                                +{formatCurrency(computed.profit, curr)}
                                            </td>
                                            <td className='tradepulse__table-right tradepulse__table-mono tradepulse__table-bold'>
                                                {formatCurrency(computed.end, curr)}
                                            </td>
                                            <td className='tradepulse__table-right tradepulse__table-mono'>
                                                {actualEl}
                                            </td>
                                            <td className='tradepulse__table-center'>{statusEl}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
});

export default MasterSchedule;
