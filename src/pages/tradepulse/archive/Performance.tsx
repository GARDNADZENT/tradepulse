// @ts-nocheck
import React, { useMemo } from 'react';
import { useTradePulse } from './TradePulseContext';
import { computeStats, getTodayStats, getContractPerformance, formatCurrency } from './utils';

const Performance = () => {
    const { contracts, statistics, getSelected } = useTradePulse();

    const selected = getSelected();
    const currency = selected?.currency || 'USD';

    const allContracts = useMemo(() => {
        if (contracts.length > 0) return contracts;
        return statistics?.contracts || [];
    }, [contracts, statistics]);

    const todayContracts = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        return allContracts.filter(c => {
            const t = c.closeTime || c.purchaseTime || c.date_start;
            if (!t) return false;
            return new Date(Number(t) * 1000).toISOString().slice(0, 10) === today;
        });
    }, [allContracts]);

    const todayStats = useMemo(() => getTodayStats(allContracts), [allContracts]);
    const contractPerformance = useMemo(() => getContractPerformance(todayContracts), [todayContracts]);

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Analytics</div>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-prominent)', margin: '4px 0 8px 0' }}>Performance</h1>
                <p style={{ fontSize: '1rem', color: 'var(--text-less-prominent)', margin: 0 }}>Today&apos;s completed contracts grouped by contract type.</p>
            </div>

            <div className='tradepulse__kpi-grid' style={{ marginBottom: 16 }}>
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-label'>Total Trades Today</div>
                    <div className='tradepulse__kpi-value'>{todayStats.total}</div>
                </div>
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-label'>Total Wins Today</div>
                    <div className='tradepulse__kpi-value' style={{ color: '#10b981' }}>{todayStats.wins}</div>
                </div>
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-label'>Total Losses Today</div>
                    <div className='tradepulse__kpi-value' style={{ color: '#ef4444' }}>{todayStats.losses}</div>
                </div>
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-label'>Today&apos;s Win Rate</div>
                    <div className='tradepulse__kpi-value' style={{ color: 'var(--brand-primary)' }}>{todayStats.total ? todayStats.winRate.toFixed(1) + '%' : '—'}</div>
                </div>
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-label'>Today&apos;s Net P/L</div>
                    <div className='tradepulse__kpi-value' style={{ color: todayStats.net >= 0 ? '#10b981' : '#ef4444' }}>
                        {(todayStats.net >= 0 ? '+' : '') + formatCurrency(todayStats.net, currency)}
                    </div>
                </div>
            </div>

            <div className='tradepulse__glass-card'>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-normal)' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-prominent)', margin: 0 }}>Contract Performance</h3>
                </div>
                {contractPerformance.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                        <div style={{ fontSize: '0.9rem', color: 'var(--text-less-prominent)', margin: '0 0 4px 0', fontWeight: 600 }}>No completed contracts yet</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-less-prominent)', margin: 0 }}>Trades will appear here automatically once connected.</div>
                    </div>
                ) : (
                    <div className='tradepulse__table-wrapper'>
                        <table className='tradepulse__table'>
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'left' }}>Contract Type</th>
                                    <th style={{ textAlign: 'right' }}>Trades</th>
                                    <th style={{ textAlign: 'right' }}>Wins</th>
                                    <th style={{ textAlign: 'right' }}>Losses</th>
                                    <th style={{ textAlign: 'right' }}>Win %</th>
                                    <th style={{ textAlign: 'right' }}>Net Profit</th>
                                    <th style={{ textAlign: 'right' }}>Avg Profit</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contractPerformance.map((g, i) => {
                                    const winPct = g.trades ? (g.wins / g.trades * 100) : 0;
                                    const avg = g.trades ? g.net / g.trades : 0;
                                    const barColor = winPct >= 70 ? '#10b981' : winPct >= 50 ? '#f59e0b' : '#ef4444';
                                    return (
                                        <tr key={i} className='tradepulse__table-row'>
                                            <td>
                                                <div style={{ fontWeight: 600, color: 'var(--text-prominent)' }}>{typeLabel(g.type)}</div>
                                                <div style={{ marginTop: 6, height: 4, width: 96, background: 'var(--general-section-1)', borderRadius: 999, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', background: barColor, borderRadius: 999, width: `${Math.min(100, winPct)}%`, transition: 'width 0.3s ease' }} />
                                                </div>
                                            </td>
                                            <td style={{ textAlign: 'right' }} className='mono'>{g.trades}</td>
                                            <td className='mono' style={{ textAlign: 'right', color: '#10b981', fontWeight: 600 }}>{g.wins}</td>
                                            <td className='mono' style={{ textAlign: 'right', color: '#ef4444', fontWeight: 600 }}>{g.losses}</td>
                                            <td className='mono' style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-prominent)' }}>{winPct.toFixed(1)}%</td>
                                            <td className='mono' style={{ textAlign: 'right', color: g.net >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                                {g.net >= 0 ? '+' : ''}{formatCurrency(g.net, currency)}
                                            </td>
                                            <td style={{ textAlign: 'right' }} className='mono'>{avg >= 0 ? '+' : ''}{formatCurrency(avg, currency)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

function typeLabel(t) {
    const map = {
        'DIGITOVER': 'Digit Over', 'DIGITUNDER': 'Digit Under', 'DIGITODD': 'Digit Odd', 'DIGITEVEN': 'Digit Even',
        'DIGITMATCH': 'Digit Match', 'DIGITDIFF': 'Digit Differs', 'CALL': 'Rise', 'PUT': 'Fall',
        'CALLPUT': 'Higher/Lower', 'higher': 'Higher', 'lower': 'Lower', 'ONETOUCH': 'Touch', 'NOTOUCH': 'No Touch'
    };
    return map[t] || t;
}

export default Performance;
