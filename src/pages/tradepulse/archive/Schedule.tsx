// @ts-nocheck
import React, { useState, useMemo } from 'react';
import { useTradePulse } from './TradePulseContext';
import { buildSchedule, normalizeJourneyDays, getCurrentJourneyDay, computeJourneyDay, formatCurrency } from './utils';

const Schedule = () => {
    const { journey, statistics, getSelected, refreshBalance } = useTradePulse();
    const [isEditing, setIsEditing] = useState(false);
    const [form, setForm] = useState({
        initial_balance: 1000,
        daily_target_pct: 5,
        cycle_length_days: 30,
        start_date: new Date().toISOString().slice(0, 10),
    });

    const selected = getSelected();
    const live = selected ? selected.balance : 0;
    const currency = selected?.currency || 'USD';

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

    const schedule = useMemo(() => {
        if (!journey) return null;
        return {
            initial: journey.initial_balance,
            days: journey.cycle_length_days,
            rate: journey.daily_target_pct,
            startDate: journey.start_date,
            rows: normalizeJourneyDays(journey.days, journey.daily_target_pct),
        };
    }, [journey]);

    const updateField = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleGenerate = async () => {
        await createJourney({
            initial_balance: Number(form.initial_balance),
            daily_target_pct: Number(form.daily_target_pct),
            cycle_length_days: Number(form.cycle_length_days),
            start_date: form.start_date,
        });
        setIsEditing(false);
        await loadJourney();
    };

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Planning</div>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-prominent)', margin: '4px 0 8px 0' }}>Master Schedule</h1>
                <p style={{ fontSize: '1rem', color: 'var(--text-less-prominent)', margin: 0 }}>
                    Set your trading goal to automatically generate your complete trading plan.
                </p>
            </div>

            {schedule ? (
                <div className='tradepulse__glass-card'>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-normal)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                        <div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-less-prominent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Locked Journey</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-prominent)', marginTop: 4 }}>Your trading plan is locked</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className='tradepulse__btn tradepulse__btn--secondary' onClick={() => setIsEditing(true)}>Edit Journey</button>
                            <button className='tradepulse__btn tradepulse__btn--danger' onClick={() => { if (confirm('Reset journey permanently?')) { deleteJourney().then(loadJourney); } }}>Reset</button>
                        </div>
                    </div>
                    <div style={{ padding: '16px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                        <div className='tradepulse__glass-card' style={{ padding: 12 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-less-prominent)', textTransform: 'uppercase' }}>Initial Balance</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-prominent)', marginTop: 4 }}>{formatCurrency(schedule.initial, currency)}</div>
                        </div>
                        <div className='tradepulse__glass-card' style={{ padding: 12 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-less-prominent)', textTransform: 'uppercase' }}>Daily Target %</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-prominent)', marginTop: 4 }}>{schedule.rate}%</div>
                        </div>
                        <div className='tradepulse__glass-card' style={{ padding: 12 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-less-prominent)', textTransform: 'uppercase' }}>Cycle Length</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-prominent)', marginTop: 4 }}>{schedule.days} days</div>
                        </div>
                        <div className='tradepulse__glass-card' style={{ padding: 12 }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-less-prominent)', textTransform: 'uppercase' }}>Start Date</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-prominent)', marginTop: 4 }}>{schedule.startDate}</div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className='tradepulse__glass-card'>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-normal)', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-less-prominent)' }}>
                            <line x1="12" y1="20" x2="12" y2="10"></line>
                            <line x1="18" y1="20" x2="18" y2="4"></line>
                            <line x1="6" y1="20" x2="6" y2="14"></line>
                        </svg>
                        <span style={{ fontSize: '1rem', color: 'var(--text-less-prominent)' }}>Schedule Generator</span>
                    </div>
                    <div style={{ padding: '20px 24px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 16 }}>
                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>Initial Balance</label>
                                <div style={{ position: 'relative' }}>
                                    <span className='tradepulse__input-prefix'>$</span>
                                    <input type='number' className='tradepulse__form-input tradepulse__form-input--prefix' value={form.initial_balance} onChange={e => updateField('initial_balance', e.target.value)} min='1' step='0.01' required />
                                </div>
                            </div>
                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>Trading Days</label>
                                <input type='number' className='tradepulse__form-input' value={form.cycle_length_days} onChange={e => updateField('cycle_length_days', e.target.value)} min='1' max='365' required />
                            </div>
                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>Daily Growth Rate (%)</label>
                                <input type='number' className='tradepulse__form-input' value={form.daily_target_pct} onChange={e => updateField('daily_target_pct', e.target.value)} min='0.01' max='100' step='0.01' required />
                            </div>
                            <div className='tradepulse__form-group'>
                                <label className='tradepulse__form-label'>Start Date</label>
                                <input type='date' className='tradepulse__form-input' value={form.start_date} onChange={e => updateField('start_date', e.target.value)} required />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button className='tradepulse__btn tradepulse__btn--primary' onClick={handleGenerate}>Generate Schedule</button>
                        </div>
                    </div>
                </div>
            )}

            {schedule && (
                <div className='tradepulse__glass-card' style={{ marginTop: 16 }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-normal)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-prominent)', margin: 0 }}>Live Schedule</h3>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-less-prominent)', margin: '4px 0 0 0' }}>
                                {schedule.days} days · {schedule.rate}% daily · starting {formatCurrency(schedule.initial, currency)}
                            </p>
                        </div>
                    </div>
                    <div className='tradepulse__table-wrapper'>
                        <table className='tradepulse__table'>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>Day</th>
                                    <th style={{ textAlign: 'right' }}>Date</th>
                                    <th style={{ textAlign: 'right' }}>Expected Start</th>
                                    <th style={{ textAlign: 'right' }}>Expected End</th>
                                    <th style={{ textAlign: 'right' }}>Daily Profit</th>
                                    <th style={{ textAlign: 'right' }}>Actual Balance</th>
                                    <th style={{ textAlign: 'right' }}>Difference</th>
                                    <th style={{ textAlign: 'center' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {schedule.rows.map(r => {
                                    const computed = computeJourneyDay(r, live, getCurrentJourneyDay(journey?.start_date));
                                    const isToday = r.day === getCurrentJourneyDay(journey?.start_date);
                                    return (
                                        <tr key={r.day} className={`tradepulse__table-row ${computed.status === 'complete' ? 'tradepulse__table-row--complete' : ''} ${computed.status === 'behind' || computed.status === 'missed' ? 'tradepulse__table-row--behind' : ''} ${isToday ? 'tradepulse__table-row--today' : ''}`}>
                                            <td style={{ fontWeight: 500 }}>
                                                <div>Day {r.day}</div>
                                            </td>
                                            <td style={{ textAlign: 'right' }} className='mono'>{r.date}</td>
                                            <td style={{ textAlign: 'right' }} className='mono'>{formatCurrency(r.start, currency)}</td>
                                            <td style={{ textAlign: 'right' }} className='mono'>{formatCurrency(r.end, currency)}</td>
                                            <td className='mono' style={{ textAlign: 'right', color: 'var(--brand-primary)', fontWeight: 600 }}>+{formatCurrency(r.profit, currency)}</td>
                                            <td className='mono' style={{ textAlign: 'right', color: computed.actual != null && computed.actual >= r.end ? 'var(--text-prominent)' : 'var(--text-less-prominent)' }}>
                                                {computed.actual != null ? formatCurrency(computed.actual, currency) : '—'}
                                            </td>
                                            <td className='mono' style={{ textAlign: 'right', color: computed.diff != null && computed.diff >= 0 ? '#10b981' : '#ef4444' }}>
                                                {computed.diff != null ? (computed.diff >= 0 ? '+' : '') + formatCurrency(computed.diff, currency) : '—'}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <span className={`tradepulse__chip ${computed.status === 'complete' ? 'tradepulse__chip--ontrack' : computed.status === 'behind' || computed.status === 'missed' ? 'tradepulse__chip--below' : 'tradepulse__chip--pending'}`}>
                                                    {computed.status === 'complete' ? 'Complete' : computed.status === 'behind' ? 'Behind' : computed.status === 'missed' ? 'Missed' : 'Pending'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div style={{ padding: '12px 20px', background: 'var(--general-section-1)', borderTop: '1px solid var(--border-normal)', fontSize: '0.8rem', color: 'var(--text-less-prominent)' }}>
                        Your master schedule is generated from the goal you set. Your actual account balance will automatically be compared with the expected balance for each trading day.
                    </div>
                </div>
            )}
        </div>
    );
};

export default Schedule;
