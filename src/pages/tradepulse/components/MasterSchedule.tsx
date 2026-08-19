// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo, useState, useEffect, useCallback } from 'react';
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
        return () => { cancelled = true; };
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
            <div className='tradepulse__section'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div className='tradepulse__section-brand'>{localize('Planning')}</div>
                        <h2 className='tradepulse__section-title'>{localize('Master Schedule')}</h2>
                        <p className='tradepulse__section-subtitle'>{localize('Set your trading goal to automatically generate your complete trading plan.')}</p>
                    </div>
                    <div className='tradepulse__card-body'>
                        <p className='text-sm text-slate-500'>{localize('Loading schedule...')}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='tradepulse'>
            {/* Schedule Setup */}
            <div className='tradepulse__section fade-in'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div className='tradepulse__section-brand'>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            {localize('Planning')}
                        </div>
                        <h2 className='tradepulse__section-title'>{localize('Master Schedule')}</h2>
                        <p className='tradepulse__section-subtitle'>{localize('Set your trading goal to automatically generate your complete trading plan.')}</p>
                    </div>
                    <div className='tradepulse__card-body'>
                        <form onSubmit={e => { e.preventDefault(); handleGenerate(); }} className='tradepulse__form-grid'>
                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>{localize('Initial Balance')}</label>
                                <div className='relative'>
                                    <span className='tradepulse__input-prefix'>$</span>
                                    <input
                                        type='number'
                                        className='tradepulse__form-input tradepulse__form-input--prefix'
                                        value={form.initial_balance}
                                        onChange={e => updateField('initial_balance', e.target.value)}
                                        min='1'
                                        step='0.01'
                                        required
                                    />
                                </div>
                            </div>
                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>{localize('Trading Days')}</label>
                                <input
                                    type='number'
                                    className='tradepulse__form-input'
                                    value={form.cycle_length_days}
                                    onChange={e => updateField('cycle_length_days', e.target.value)}
                                    min='1'
                                    max='365'
                                    required
                                />
                            </div>
                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>{localize('Daily Growth Rate (%)')}</label>
                                <input
                                    type='number'
                                    className='tradepulse__form-input'
                                    value={form.daily_target_pct}
                                    onChange={e => updateField('daily_target_pct', e.target.value)}
                                    min='0.01'
                                    max='100'
                                    step='0.01'
                                    required
                                />
                            </div>
                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>{localize('Cycle Start Date')}</label>
                                <input
                                    type='date'
                                    className='tradepulse__form-input'
                                    value={form.start_date}
                                    onChange={e => updateField('start_date', e.target.value)}
                                    required
                                />
                            </div>
                            <div className='tradepulse__form-group' style={{ gridColumn: '1 / -1' }}>
                                <button type='submit' className='tradepulse__btn tradepulse__btn--primary' disabled={isGenerating}>
                                    {isGenerating ? localize('Generating...') : localize('Generate Master Schedule')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {/* Generated Schedule */}
            {schedule.length > 0 && (
                <div className='tradepulse__section fade-in'>
                    <div className='tradepulse__card'>
                        <div className='tradepulse__card-header'>
                            <h3 className='tradepulse__section-title' style={{ fontSize: '1.1rem' }}>{localize('Generated Schedule')}</h3>
                            <p className='text-xs text-slate-500 mt-1'>
                                {schedule.length} {localize('days')} · {schedule[0].rate}% {localize('daily')} · {localize('starting')} {formatCurrency(schedule[0].start, currency)} · {localize('from')} {schedule[0].date}
                            </p>
                        </div>
                        <div className='tradepulse__table-wrapper scrollbar-thin'>
                            <table className='tradepulse__table'>
                                <thead>
                                    <tr>
                                        <th className='text-left'>{localize('Day')}</th>
                                        <th className='text-right'>{localize('Expected Start')}</th>
                                        <th className='text-right'>{localize('Expected End')}</th>
                                        <th className='text-right'>{localize('Daily Profit Target')}</th>
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
                                        const statusClass = status === 'complete' ? 'tradepulse__chip--ontrack' : status === 'behind' || status === 'missed' ? 'tradepulse__chip--below' : 'tradepulse__chip--pending';

                                        return (
                                            <tr key={row.day} className={isToday ? 'tradepulse__table-row--today' : ''}>
                                                <td className='font-medium'>
                                                    <div>{localize('Day')} {row.day}</div>
                                                    <div className='text-[11px] text-slate-500 mono'>{row.date}</div>
                                                </td>
                                                <td className='text-right mono text-slate-700'>{formatCurrency(row.start, currency)}</td>
                                                <td className='text-right mono text-slate-700'>{formatCurrency(row.end, currency)}</td>
                                                <td className='text-right mono text-brand-700 font-semibold'>+{formatCurrency(row.profit, currency)}</td>
                                                <td className='text-right mono text-slate-700'>{row.rate}%</td>
                                                <td className={`text-right mono font-semibold ${computed.actual != null && computed.actual >= row.end ? 'text-emerald-600' : computed.actual != null ? 'text-rose-600' : 'text-slate-400'}`}>
                                                    {computed.actual != null ? formatCurrency(computed.actual, currency) : '—'}
                                                </td>
                                                <td className={`text-right mono font-semibold ${computed.diff == null ? 'text-slate-400' : computed.diff >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {computed.diff != null ? `${computed.diff >= 0 ? '+' : ''}${formatCurrency(computed.diff, currency)}` : '—'}
                                                </td>
                                                <td className='text-center'>
                                                    <span className={`tradepulse__chip ${statusClass}`}>
                                                        {isToday && status === 'pending' && <span className='tradepulse__chip tradepulse__chip--today'>{localize('Today')}</span>}
                                                        {statusLabel}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className='px-6 sm:px-8 py-5 bg-slate-50/60 border-t border-slate-100 text-xs text-slate-600 leading-relaxed'>
                            {localize('Your master schedule is generated from the goal you set above. Your actual account balance will automatically be compared with the expected balance for each trading day.')}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

const formatCurrency = (value: number, currency: string): string => {
    if (Math.abs(value) < 0.01) return `${currency} 0.00`;
    return `${currency} ${value.toFixed(2)}`;
};

export default MasterSchedule;
