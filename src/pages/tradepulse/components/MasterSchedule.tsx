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
import useTradePulseData from '../hooks/useTradePulseData';
import './MasterSchedule.scss';

const MasterSchedule = observer(() => {
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid ?? '—';
    const { balance, loading } = useTradePulseData();
    const currency = client?.currency ?? 'USD';

    const [journey, setJourney] = useState<any>(null);
    const [journeyLoaded, setJourneyLoaded] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const fetchJourney = async () => {
            const loaded = await loadJourney(loginid);
            if (!cancelled) {
                setJourney(loaded ?? getDefaultJourney(loginid));
                setJourneyLoaded(true);
            }
        };

        fetchJourney();

        return () => {
            cancelled = true;
        };
    }, [loginid]);

    const schedule = useMemo(() => journey ? buildSchedule(journey) : [], [journey]);

    const [form, setForm] = useState({
        initial_balance: 0,
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
        }
    }, [journey]);

    const handleGenerate = useCallback(async () => {
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
        await saveJourney(loginid, locked);
        setJourney(locked);
        setIsGenerating(false);
    }, [loginid, form, journey]);

    const updateField = useCallback((field: string, value: string | number) => {
        setForm(prev => ({ ...prev, [field]: value }));
    }, []);

    const currentDay = journey ? getCurrentJourneyDay(journey.start_date) : 1;

    if (!journeyLoaded || !journey || (loading && balance === 0)) {
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
                    <div className='master-schedule__label'>{localize('HOW AM I SUPPOSED TO GET THERE')}</div>
                    <h1 className='master-schedule__title'>{localize('Master Schedule')}</h1>
                    <p className='master-schedule__subtitle'>{localize('Set your trading goal and generate a complete daily plan.')}</p>
                </div>
            </div>

            <div className='master-schedule__generator-card'>
                <div className='master-schedule__card-header'>
                    <div className='master-schedule__card-icon'>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="20" x2="12" y2="10"></line>
                            <line x1="18" y1="20" x2="18" y2="4"></line>
                            <line x1="6" y1="20" x2="6" y2="14"></line>
                        </svg>
                    </div>
                    <span className='master-schedule__card-text'>{localize('Schedule Generator')}</span>
                </div>

                <div className='master-schedule__grid'>
                    <div className='master-schedule__field'>
                        <label className='master-schedule__label'>{localize('Starting Balance')}</label>
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
                        <label className='master-schedule__label'>{localize('Target Balance')}</label>
                        <div className='master-schedule__input-wrap'>
                            <span className='master-schedule__input-prefix'>$</span>
                            <input
                                type='number'
                                className='master-schedule__input'
                                value={schedule[schedule.length - 1]?.end ?? 0}
                                readOnly
                                tabIndex={-1}
                            />
                        </div>
                    </div>
                    <div className='master-schedule__field'>
                        <label className='master-schedule__label'>{localize('Trading Days')}</label>
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
                        <label className='master-schedule__label'>{localize('Daily Growth Rate (%)')}</label>
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
                    <button
                        type='button'
                        className='master-schedule__submit-btn'
                        onClick={handleGenerate}
                        disabled={isGenerating}
                    >
                        {isGenerating ? localize('Generating...') : localize('Generate Schedule')}
                    </button>
                </div>
            </div>

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
                                <th className='text-right'>{localize('Date')}</th>
                                <th className='text-right'>{localize('Expected Start')}</th>
                                <th className='text-right'>{localize('Expected End')}</th>
                                <th className='text-right'>{localize('Daily Profit')}</th>
                                <th className='text-right'>{localize('Actual Balance')}</th>
                                <th className='text-right'>{localize('Difference')}</th>
                                <th className='text-center'>{localize('Status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schedule.length === 0 ? (
                                <tr>
                                    <td colSpan={8}>
                                        <div className='master-schedule__empty'>
                                            <div className='master-schedule__empty-text'>{localize('No schedule generated yet')}</div>
                                            <div className='master-schedule__empty-sub'>{localize('Use the generator above to create your trading plan.')}</div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                schedule.map(row => {
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
                                            </td>
                                            <td className='text-right mono'>{row.date}</td>
                                            <td className='text-right mono'>{formatCurrency(row.start, currency)}</td>
                                            <td className='text-right mono'>{formatCurrency(row.end, currency)}</td>
                                            <td className='text-right mono font-semibold'>+{formatCurrency(row.profit, currency)}</td>
                                            <td className={classNames('text-right mono font-semibold', {
                                                'text-profit': computed.actual != null && computed.actual >= row.end,
                                                'text-loss': computed.actual != null && computed.actual < row.end,
                                            })}>
                                                {computed.actual != null ? formatCurrency(computed.actual, currency) : '—'}
                                            </td>
                                            <td className={classNames('text-right mono font-semibold', {
                                                'text-profit': computed.diff != null && computed.diff >= 0,
                                                'text-loss': computed.diff != null && computed.diff < 0,
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
                                })
                            )}
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
                    {localize('Your master schedule is generated from the goal you set. Your actual account balance will automatically be compared with the expected balance for each trading day.')}
                </div>
            </div>
        </div>
    );
});

export default MasterSchedule;
