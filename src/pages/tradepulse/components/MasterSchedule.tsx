// @ts-nocheck — TradePulse component with known type gaps
import React, { useState, useEffect, useCallback } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useTradePulse } from '../TradePulseContext';
import { localize } from '@deriv-com/translations';
import {
    saveJourney,
    getCurrentJourneyDay,
    computeJourneyDay,
    formatCurrency,
} from '../utils/calculations';
import useTradePulseData from '../hooks/useTradePulseData';
import './MasterSchedule.scss';

const MasterSchedule = observer(() => {
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid ?? '—';
    const { balance, loading } = useTradePulseData();
    const currency = client?.currency ?? 'USD';

    const { journey, schedule, journeyLoading, refreshJourney } = useTradePulse();
    const [isGenerating, setIsGenerating] = useState(false);

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
        try {
            await saveJourney(loginid, locked);
            await refreshJourney();
        } catch (e) {
            console.error('Generate schedule failed:', e);
        } finally {
            setIsGenerating(false);
        }
    }, [loginid, form, journey, refreshJourney]);

    const updateField = useCallback((field: string, value: string | number) => {
        setForm(prev => ({ ...prev, [field]: value }));
    }, []);

    const currentDay = journey ? getCurrentJourneyDay(journey.start_date) : 1;
    const rows = schedule?.rows || [];

    if (journeyLoading) {
        return (
            <div className='tradepulse__page'>
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
                        <p className='tradepulse__text-muted'>{localize('Loading schedule...')}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='tradepulse__page fade-in'>
            {/* Schedule Setup — only show when no plan exists */}
            {rows.length === 0 && (
                <section className='tradepulse__section'>
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
                            <div className='tradepulse__card-meta'>Compound growth model</div>
                        </div>
                        <div className='tradepulse__card-body'>
                            <form onSubmit={e => { e.preventDefault(); handleGenerate(); }} className='tradepulse__form-grid'>
                                <div className='tradepulse__form-group'>
                                    <label className='tradepulse__form-label'>{localize('Initial Balance')}</label>
                                    <div className='tradepulse__input-wrap'>
                                        <span className='tradepulse__input-prefix'>$</span>
                                        <input
                                            type='number'
                                            className='tradepulse__form-input'
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
                                <div className='tradepulse__form-actions'>
                                    <button type='submit' className='tradepulse__btn tradepulse__btn--primary' disabled={isGenerating}>
                                        {isGenerating ? localize('Generating...') : localize('Generate Master Schedule')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </section>
            )}

            {/* Generated Schedule */}
            {rows.length > 0 && (
                <section className='tradepulse__section fade-in'>
                    <div className='tradepulse__card'>
                        <div className='tradepulse__card-header'>
                            <h3 className='tradepulse__section-title'>{localize('Generated Schedule')}</h3>
                            <p className='tradepulse__section-subtitle'>
                                {rows.length} {localize('days')} · {rows[0].rate}% {localize('daily')} · {localize('starting')} {formatCurrency(rows[0].start, currency)} · {localize('from')} {rows[0].date}
                            </p>
                        </div>
                        <div className='tradepulse__table-wrapper' style={{ maxHeight: '520px', overflowY: 'auto' }}>
                            <table className='tradepulse__table'>
                                <thead>
                                    <tr>
                                        <th className='tradepulse__table-left'>{localize('Day')}</th>
                                        <th className='tradepulse__table-right'>{localize('Expected Start')}</th>
                                        <th className='tradepulse__table-right'>{localize('Expected End')}</th>
                                        <th className='tradepulse__table-right'>{localize('Daily Profit Target')}</th>
                                        <th className='tradepulse__table-right'>{localize('Required %')}</th>
                                        <th className='tradepulse__table-right'>{localize('Actual Balance')}</th>
                                        <th className='tradepulse__table-right'>{localize('Difference')}</th>
                                        <th className='tradepulse__table-center'>{localize('Status')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map(row => {
                                        const computed = computeJourneyDay(row, balance, currentDay);
                                        if (!computed) return null;
                                        const isToday = row.day === currentDay;
                                        const status = computed.status;
                                        const statusLabel = status === 'complete' ? '✅ ' + localize('On Track') : status === 'behind' ? '⚠ ' + localize('Below') : status === 'missed' ? '❄ ' + localize('Missed') : localize('Pending');
                                        const statusClass = status === 'complete' ? 'tradepulse__chip--ontrack' : status === 'behind' || status === 'missed' ? 'tradepulse__chip--below' : 'tradepulse__chip--pending';

                                        return (
                                            <tr key={row.day} className={isToday ? 'tradepulse__table-row--today' : ''}>
                                                <td className='tradepulse__table-name'>
                                                    <div>{localize('Day')} {row.day}</div>
                                                    <div className='tradepulse__table-mono'>{row.date}</div>
                                                </td>
                                                <td className='tradepulse__table-right tradepulse__table-mono'>{formatCurrency(row.start, currency)}</td>
                                                <td className='tradepulse__table-right tradepulse__table-mono'>{formatCurrency(row.end, currency)}</td>
                                                <td className='tradepulse__table-right tradepulse__table-mono tradepulse__table-brand'>+{formatCurrency(row.profit, currency)}</td>
                                                <td className='tradepulse__table-right tradepulse__table-mono'>{row.rate}%</td>
                                                <td className={`tradepulse__table-right tradepulse__table-mono tradepulse__table-bold ${computed.actual != null && computed.actual >= row.end ? 'tradepulse__text-success' : computed.actual != null ? 'tradepulse__text-danger' : 'tradepulse__text-muted'}`}>
                                                    {computed.actual != null ? formatCurrency(computed.actual, currency) : '—'}
                                                </td>
                                                <td className={`tradepulse__table-right tradepulse__table-mono tradepulse__table-bold ${computed.diff == null ? 'tradepulse__text-muted' : computed.diff >= 0 ? 'tradepulse__text-success' : 'tradepulse__text-danger'}`}>
                                                    {computed.diff != null ? `${computed.diff >= 0 ? '+' : ''}${formatCurrency(computed.diff, currency)}` : '—'}
                                                </td>
                                                <td className='tradepulse__table-center'>
                                                    <span className={`tradepulse__chip ${statusClass}`}>
                                                        {statusLabel}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                        <div className='tradepulse__card-footer'>
                            {localize('Your master schedule is generated from the goal you set above. Your actual account balance will automatically be compared with the expected balance for each trading day.')}
                        </div>
                    </div>
                </section>
            )}
        </div>
    );
});

const formatCurrency = (value: number, currency: string): string => {
    if (Math.abs(value) < 0.01) return `${currency} 0.00`;
    return `${currency} ${value.toFixed(2)}`;
};

export default MasterSchedule;
