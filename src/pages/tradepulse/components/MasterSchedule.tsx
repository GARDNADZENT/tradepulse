// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import {
    loadJourney,
    saveJourney,
    getCurrentJourneyDay,
    buildSchedule,
    computeJourneyDay,
    formatCurrency,
    getDefaultJourney,
} from '../utils/calculations';
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './MasterSchedule.scss';

const MasterSchedule = observer(({ loginid }: { loginid: string }) => {
    const store = useStore();
    const { client } = store;
    const { balance: fetchedBalance, loading } = useTradePulseFetch();
    const balance = client?.balance ? parseFloat(client.balance) : fetchedBalance;
    const currency = client?.currency ?? 'USD';

    const journey = useMemo(() => loadJourney(loginid) ?? getDefaultJourney(loginid), [loginid]);
    const schedule = useMemo(() => buildSchedule(journey), [journey]);

    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        initial_balance: journey.initial_balance,
        daily_target_pct: journey.daily_target_pct,
        cycle_length_days: journey.cycle_length_days,
        start_date: journey.start_date,
    });

    const handleLock = useCallback(() => {
        const locked = {
            loginid,
            initial_balance: Number(form.initial_balance) || 0,
            daily_target_pct: Number(form.daily_target_pct) || 0,
            cycle_length_days: Number(form.cycle_length_days) || 30,
            start_date: form.start_date || new Date().toISOString().slice(0, 10),
            created_at: journey.created_at,
            updated_at: new Date().toISOString(),
        };
        saveJourney(loginid, locked);
        setEditing(false);
    }, [loginid, form, journey.created_at]);

    const handleReset = useCallback(() => {
        localStorage.removeItem(`tradepulse_journey_${loginid}`);
        window.location.reload();
    }, [loginid]);

    const updateField = useCallback((field: string, value: string | number) => {
        setForm(prev => ({ ...prev, [field]: value }));
    }, []);

    const currentDay = getCurrentJourneyDay(journey.start_date);

    if (loading && balance === 0) {
        return (
            <div className='master-schedule'>
                <p className='master-schedule__loading'>{localize('Loading schedule...')}</p>
            </div>
        );
    }

    return (
        <div className='master-schedule'>
            <div className='master-schedule__header'>
                <div>
                    <div className='master-schedule__label'>{localize('Planning')}</div>
                    <h1 className='master-schedule__title'>{localize('Master Schedule')}</h1>
                    <p className='master-schedule__subtitle'>{localize('Set your trading goal to automatically generate your complete trading plan.')}</p>
                </div>
            </div>

            {!editing ? (
                <div className='master-schedule__locked'>
                    <div className='master-schedule__locked-header'>
                        <div>
                            <div className='master-schedule__locked-label'>{localize('Locked Journey')}</div>
                            <div className='master-schedule__locked-sub'>{localize('Your trading plan is locked. Reset to create a new plan.')}</div>
                        </div>
                        <div className='master-schedule__locked-actions'>
                            <button className='master-schedule__edit-btn' onClick={() => setEditing(true)} type='button'>
                                {localize('Edit Journey')}
                            </button>
                            <button className='master-schedule__reset-btn' onClick={handleReset} type='button'>
                                {localize('Reset Journey')}
                            </button>
                        </div>
                    </div>
                    <div className='master-schedule__info-grid'>
                        <InfoCard label={localize('Initial Balance')} value={formatCurrency(journey.initial_balance, currency)} />
                        <InfoCard label={localize('Daily Target %')} value={`${journey.daily_target_pct}%`} />
                        <InfoCard label={localize('Cycle Length')} value={`${journey.cycle_length_days} days`} />
                        <InfoCard label={localize('Start Date')} value={journey.start_date} />
                    </div>
                </div>
            ) : (
                <div className='master-schedule__card'>
                    <div className='master-schedule__card-header'>
                        <div className='master-schedule__card-icon'>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="4" y="2" width="16" height="20" rx="2" ry="2"></rect>
                                <line x1="8" y1="6" x2="16" y2="6"></line>
                                <line x1="8" y1="10" x2="16" y2="10"></line>
                                <line x1="8" y1="14" x2="16" y2="14"></line>
                                <line x1="8" y1="18" x2="16" y2="18"></line>
                            </svg>
                        </div>
                        <span className='master-schedule__card-text'>{localize('Compound growth model')}</span>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); handleLock(); }} className='master-schedule__form'>
                        <div className='master-schedule__grid'>
                            <div className='master-schedule__field'>
                                <label className='master-schedule__label'>{localize('Initial Balance')}</label>
                                <div className='master-schedule__input-wrap'>
                                    <span className='master-schedule__input-prefix'>$</span>
                                    <input
                                        type='number'
                                        className='master-schedule__input'
                                        value={form.initial_balance}
                                        onChange={e => updateField('initial_balance', e.target.value)}
                                        min='1'
                                        step='0.01'
                                        required
                                    />
                                </div>
                            </div>
                            <div className='master-schedule__field'>
                                <label className='master-schedule__label'>{localize('Daily Target %')}</label>
                                <input
                                    type='number'
                                    className='master-schedule__input'
                                    value={form.daily_target_pct}
                                    onChange={e => updateField('daily_target_pct', e.target.value)}
                                    min='0.01'
                                    max='100'
                                    step='0.01'
                                    required
                                />
                            </div>
                            <div className='master-schedule__field'>
                                <label className='master-schedule__label'>{localize('Cycle Length (Days)')}</label>
                                <input
                                    type='number'
                                    className='master-schedule__input'
                                    value={form.cycle_length_days}
                                    onChange={e => updateField('cycle_length_days', e.target.value)}
                                    min='1'
                                    max='365'
                                    required
                                />
                            </div>
                            <div className='master-schedule__field'>
                                <label className='master-schedule__label'>{localize('Start Date')}</label>
                                <input
                                    type='date'
                                    className='master-schedule__input'
                                    value={form.start_date}
                                    onChange={e => updateField('start_date', e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <div className='master-schedule__form-actions'>
                            <button type='button' className='master-schedule__cancel-btn' onClick={() => setEditing(false)}>
                                {localize('Cancel')}
                            </button>
                            <button type='submit' className='master-schedule__submit-btn'>
                                {localize('Lock Journey')}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className='master-schedule__output'>
                <div className='master-schedule__output-header'>
                    <div>
                        <h3 className='master-schedule__output-title'>{localize('Live Schedule')}</h3>
                        <p className='master-schedule__output-meta'>
                            {schedule.length > 0 ? `${schedule.length} days · ${schedule[0].rate}% daily · starting ${formatCurrency(schedule[0].start, currency)}` : ''}
                        </p>
                    </div>
                </div>
                <div className='master-schedule__table-wrap'>
                    <table className='master-schedule__table'>
                        <thead>
                            <tr>
                                <th className='text-left'>{localize('Day')}</th>
                                <th className='text-right'>{localize('Expected Start')}</th>
                                <th className='text-right'>{localize('Expected End')}</th>
                                <th className='text-right'>{localize('Daily Profit')}</th>
                                <th className='text-right'>{localize('Required %')}</th>
                                <th className='text-right'>{localize('Actual Balance')}</th>
                                <th className='text-right'>{localize('Difference')}</th>
                                <th className='text-center'>{localize('Status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schedule.map(row => {
                                const computed = computeJourneyDay(row, balance, currentDay);
                                if (!computed) return null;
                                const isToday = row.day === currentDay;
                                const status = computed.status;
                                const statusLabel = status === 'complete' ? '✅ ' + localize('On Track') : status === 'behind' ? '⚠ ' + localize('Below') : status === 'missed' ? '❄ ' + localize('Missed') : localize('Pending');
                                
                                return (
                                    <tr key={row.day} className={classNames('master-schedule__table-row', {
                                        'master-schedule__table-row--complete': status === 'complete',
                                        'master-schedule__table-row--behind': status === 'behind' || status === 'missed',
                                        'master-schedule__table-row--today': isToday,
                                    })}>
                                        <td className='font-medium'>
                                            <div>{localize('Day')} {row.day}</div>
                                            <div className='master-schedule__table-date'>{row.date}</div>
                                        </td>
                                        <td className='text-right mono'>{formatCurrency(row.start, currency)}</td>
                                        <td className='text-right mono'>{formatCurrency(row.end, currency)}</td>
                                        <td className='text-right mono font-semibold text-brand-700'>+{formatCurrency(row.profit, currency)}</td>
                                        <td className='text-right mono'>{row.rate}%</td>
                                        <td className={classNames('text-right mono font-semibold', {
                                            'text-slate-900': computed.actual != null,
                                            'text-slate-400': computed.actual == null,
                                        })}>
                                            {computed.actual != null ? formatCurrency(computed.actual, currency) : '—'}
                                        </td>
                                        <td className={classNames('text-right mono font-semibold', {
                                            'text-emerald-600': computed.diff != null && computed.diff >= 0,
                                            'text-rose-600': computed.diff != null && computed.diff < 0,
                                            'text-slate-400': computed.diff == null,
                                        })}>
                                            {computed.diff != null ? `${computed.diff >= 0 ? '+' : ''}${formatCurrency(computed.diff, currency)}` : '—'}
                                        </td>
                                        <td className='text-center'>
                                            <span className={classNames('chip', {
                                                'bg-slate-100 text-slate-600': status === 'pending',
                                                'bg-emerald-50 text-emerald-700': status === 'complete',
                                                'bg-rose-50 text-rose-700': status === 'behind' || status === 'missed',
                                            })}>
                                                {statusLabel}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className='master-schedule__output-footer'>
                    <span className='master-schedule__output-icon'>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </span>
                    {localize('Your master schedule is generated from the goal you set above. Your actual account balance will automatically be compared with the expected balance for each trading day.')}
                </div>
            </div>
        </div>
    );
});

const InfoCard = ({ label, value }: { label: string; value: string }) => (
    <div className='info-card'>
        <div className='info-card__label'>{label}</div>
        <div className='info-card__value'>{value}</div>
    </div>
);

export default MasterSchedule;
