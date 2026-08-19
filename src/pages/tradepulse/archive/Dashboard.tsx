// @ts-nocheck
import React, { useMemo } from 'react';
import { useTradePulse } from './TradePulseContext';
import { buildSchedule, normalizeJourneyDays, getCurrentJourneyDay, computeJourneyDay, formatCurrency } from './utils';

const Dashboard = () => {
    const { journey, schedule, statistics, getSelected, refreshBalance } = useTradePulse();

    useEffect(() => {
        const interval = setInterval(refreshBalance, 5000);
        return () => clearInterval(interval);
    }, [refreshBalance]);

    const selected = getSelected();
    const live = selected ? selected.balance : 0;
    const currency = selected?.currency || 'USD';
    const journeyDay = getCurrentJourneyDay(journey?.start_date);
    const s = schedule || (journey ? {
        initial: journey.initial_balance,
        days: journey.cycle_length_days,
        rate: journey.daily_target_pct,
        startDate: journey.start_date,
        rows: normalizeJourneyDays(journey.days, journey.daily_target_pct),
    } : null);

    const idx = s ? Math.min(Math.max(journeyDay, 1), s.rows.length) - 1 : -1;
    const baseRow = s && s.rows.length > 0 ? s.rows[idx] : null;
    const row = baseRow ? computeJourneyDay(baseRow, live, journeyDay) : null;

    const todayStats = statistics?.today || {};
    const overallStats = statistics?.overall || {};
    const contractPerformance = statistics?.contractPerformance || [];

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dashboard</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-prominent)', margin: '4px 0 8px 0' }}>
                    Welcome back — capital preserved.
                </div>
            </div>

            {s && (
                <>
                    <div className='tradepulse__kpi-grid' style={{ marginBottom: 16 }}>
                        <div className='tradepulse__kpi-card'>
                            <div className='tradepulse__kpi-label'>Expected Starting</div>
                            <div className='tradepulse__kpi-value'>{formatCurrency(baseRow?.start || 0, currency)}</div>
                            <div className='tradepulse__kpi-sub'>Today&apos;s baseline</div>
                        </div>
                        <div className='tradepulse__kpi-card'>
                            <div className='tradepulse__kpi-label'>Today&apos;s Profit</div>
                            <div className='tradepulse__kpi-value' style={{ color: '#10b981' }}>+{formatCurrency(baseRow?.profit || 0, currency)}</div>
                            <div className='tradepulse__kpi-sub'>Plan to secure</div>
                        </div>
                        <div className='tradepulse__kpi-card'>
                            <div className='tradepulse__kpi-label'>Today&apos;s Target %</div>
                            <div className='tradepulse__kpi-value' style={{ color: 'var(--brand-primary)' }}>{baseRow?.rate || 0}%</div>
                            <div className='tradepulse__kpi-sub'>Daily growth rate</div>
                        </div>
                        <div className='tradepulse__kpi-card'>
                            <div className='tradepulse__kpi-label'>Expected End</div>
                            <div className='tradepulse__kpi-value'>{formatCurrency(baseRow?.end || 0, currency)}</div>
                            <div className='tradepulse__kpi-sub'>End of day target</div>
                        </div>
                        <div className='tradepulse__kpi-card'>
                            <div className='tradepulse__kpi-label'>Live Balance</div>
                            <div className='tradepulse__kpi-value' style={{ color: live >= (baseRow?.end || 0) ? '#10b981' : '#ef4444' }}>
                                {formatCurrency(live, currency)}
                            </div>
                            <div className='tradepulse__kpi-sub' style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className='pulse-dot' style={{ width: 6, height: 6, borderRadius: '50%', background: live >= (baseRow?.end || 0) ? '#10b981' : '#ef4444', display: 'inline-block' }}></span>
                                Live from Deriv
                            </div>
                        </div>
                        <div className='tradepulse__kpi-card'>
                            <div className='tradepulse__kpi-label'>Difference</div>
                            <div className='tradepulse__kpi-value' style={{ color: row?.diff != null && row.diff >= 0 ? '#10b981' : '#ef4444' }}>
                                {row?.diff != null ? (row.diff >= 0 ? '+' : '') + formatCurrency(row.diff, currency) : '—'}
                            </div>
                            <div className='tradepulse__kpi-sub'>vs expected end</div>
                        </div>
                    </div>

                    <div className='tradepulse__glass-card' style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-prominent)' }}>Today&apos;s Progress</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-less-prominent)' }}>Day {journeyDay} of {s.days}</div>
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
                                {baseRow ? Math.round(Math.max(0, Math.min(100, ((live - baseRow.start) / (baseRow.end - baseRow.start || 1)) * 100)) : 0}%
                            </div>
                        </div>
                        <div className='tradepulse__progress-bar'>
                            <div className='tradepulse__progress-fill' style={{
                                width: `${baseRow ? Math.max(0, Math.min(100, ((live - baseRow.start) / (baseRow.end - baseRow.start || 1)) * 100)) : 0}%`
                            }} />
                        </div>
                    </div>

                    <div className='tradepulse__glass-card' style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-prominent)' }}>Journey Completion</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-less-prominent)' }}>Day {journeyDay} of {s.days}</div>
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
                                {Math.min(100, Math.round((journeyDay / s.days) * 100))}%
                            </div>
                        </div>
                        <div className='tradepulse__progress-bar'>
                            <div className='tradepulse__progress-fill' style={{ width: `${Math.min(100, (journeyDay / s.days) * 100)}%` }} />
                        </div>
                    </div>

                    <div className='tradepulse__glass-card'>
                        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-normal)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-prominent)', margin: 0 }}>Master Schedule — Live</h3>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-less-prominent)', margin: '4px 0 0 0' }}>
                                    {s.days} days · {s.rate}% daily · starting {formatCurrency(s.initial, currency)}
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
                                    {s.rows.slice(0, 7).map((r, i) => {
                                        const computed = computeJourneyDay(r, live, journeyDay);
                                        const isToday = r.day === journeyDay;
                                        return (
                                            <tr key={r.day} className={`tradepulse__table-row ${computed.status === 'complete' ? 'tradepulse__table-row--complete' : ''} ${computed.status === 'behind' || computed.status === 'missed' ? 'tradepulse__table-row--behind' : ''} ${isToday ? 'tradepulse__table-row--today' : ''}`}>
                                                <td style={{ fontWeight: 500 }}>
                                                    <div>Day {r.day}</div>
                                                    <div className='tradepulse__table-date'>{r.date}</div>
                                                </td>
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
                        {s.rows.length > 7 && (
                            <div style={{ padding: '12px 20px', background: 'var(--general-section-1)', borderTop: '1px solid var(--border-normal)', fontSize: '0.8rem', color: 'var(--text-less-prominent)' }}>
                                Showing 7 of {s.rows.length} days. View full schedule in Master Schedule tab.
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default Dashboard;
