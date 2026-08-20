// @ts-nocheck — TradePulse component with known type gaps
import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import useTradePulseData from '../hooks/useTradePulseData';
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './Performance.scss';

const Performance = observer(() => {
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid ?? '—';
    const { contractPerformance, currency, loading, overallStats, dailyPnL } = useTradePulseData();
    const { balance: fetchedBalance } = useTradePulseFetch();
    const balance = client?.balance ? parseFloat(client.balance) : fetchedBalance;
    const displayCurrency = client?.currency ?? currency ?? 'USD';

    const netProfit = overallStats.total_profit || 0;
    const winRate = overallStats.win_rate || 0;
    const winningDays = dailyPnL.filter(d => d.profit > 0).length;
    const losingDays = dailyPnL.filter(d => d.profit < 0).length;

    const maxPnL = Math.max(...dailyPnL.map(d => Math.abs(d.profit)), 1);
    const chartData = dailyPnL.slice(-30);

    if (loading && contractPerformance.length === 0) {
        return (
            <div className='tradepulse__page'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div className='tradepulse__section-brand'>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                            {localize('Performance')}
                        </div>
                        <h3 className='tradepulse__section-title'>{localize('Option Contract Performance')}</h3>
                        <p className='tradepulse__section-subtitle'>{localize('Completed contracts only — grouped by contract type. Open positions are excluded.')}</p>
                    </div>
                    <div className='tradepulse__card-body'>
                        <div className='tradepulse__table-wrapper'>
                            <table className='tradepulse__table'>
                                <thead>
                                    <tr>
                                        <th className='tradepulse__table-left'>{localize('Contract Type')}</th>
                                        <th className='tradepulse__table-right'>{localize('Trades')}</th>
                                        <th className='tradepulse__table-right'>{localize('Wins')}</th>
                                        <th className='tradepulse__table-right'>{localize('Losses')}</th>
                                        <th className='tradepulse__table-right'>{localize('Win %')}</th>
                                        <th className='tradepulse__table-right'>{localize('Net Profit')}</th>
                                        <th className='tradepulse__table-right'>{localize('Avg Profit')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...Array(5)].map((_, i) => (
                                        <tr key={i}>
                                            <td><div className='tradepulse__skeleton tradepulse__skeleton-text tradepulse__skeleton-text--medium'></div></td>
                                            <td><div className='tradepulse__skeleton tradepulse__skeleton-text'></div></td>
                                            <td><div className='tradepulse__skeleton tradepulse__skeleton-text'></div></td>
                                            <td><div className='tradepulse__skeleton tradepulse__skeleton-text'></div></td>
                                            <td><div className='tradepulse__skeleton tradepulse__skeleton-text'></div></td>
                                            <td><div className='tradepulse__skeleton tradepulse__skeleton-text'></div></td>
                                            <td><div className='tradepulse__skeleton tradepulse__skeleton-text'></div></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='tradepulse__page fade-in'>
            {/* Summary KPIs */}
            <section className='tradepulse__section'>
                <div className='tradepulse__kpi-grid'>
                    <div className='tradepulse__kpi-card'>
                        <div className='tradepulse__kpi-header'>
                            <span className='tradepulse__kpi-label'>{localize('Net P/L')}</span>
                        </div>
                        <div className={`tradepulse__kpi-value ${netProfit >= 0 ? 'tradepulse__kpi-value--profit' : 'tradepulse__text-danger'}`}>
                            {netProfit >= 0 ? '+' : ''}{formatCurrency(netProfit, displayCurrency)}
                        </div>
                    </div>
                    <div className='tradepulse__kpi-card'>
                        <div className='tradepulse__kpi-header'>
                            <span className='tradepulse__kpi-label'>{localize('Win Rate')}</span>
                        </div>
                        <div className='tradepulse__kpi-value'>{winRate.toFixed(1)}%</div>
                    </div>
                    <div className='tradepulse__kpi-card'>
                        <div className='tradepulse__kpi-header'>
                            <span className='tradepulse__kpi-label'>{localize('Winning Days')}</span>
                        </div>
                        <div className='tradepulse__kpi-value tradepulse__text-success'>{winningDays}</div>
                    </div>
                    <div className='tradepulse__kpi-card'>
                        <div className='tradepulse__kpi-header'>
                            <span className='tradepulse__kpi-label'>{localize('Losing Days')}</span>
                        </div>
                        <div className='tradepulse__kpi-value tradepulse__text-danger'>{losingDays}</div>
                    </div>
                </div>
            </section>

            {/* Daily Performance Chart */}
            <section className='tradepulse__section'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div className='tradepulse__section-brand'>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                            {localize('Performance')}
                        </div>
                        <h3 className='tradepulse__section-title'>{localize('Daily Performance')}</h3>
                        <p className='tradepulse__section-subtitle'>{localize('Net profit/loss per day over the last 30 days.')}</p>
                    </div>
                    <div className='tradepulse__card-body'>
                        {chartData.length === 0 ? (
                            <div className='tradepulse__text-muted' style={{ textAlign: 'center', padding: '40px 0' }}>
                                {localize('No performance data available yet.')}
                            </div>
                        ) : (
                            <div className='tradepulse__chart-card'>
                                <div className='tradepulse__chart'>
                                    <div className='tradepulse__chart-bars'>
                                        {chartData.map((d, i) => {
                                            const heightPct = maxPnL > 0 ? (Math.abs(d.profit) / maxPnL) * 100 : 0;
                                            const isProfit = d.profit >= 0;
                                            return (
                                                <div key={i} className='tradepulse__bar-wrap'>
                                                    <div
                                                        className={`tradepulse__bar ${isProfit ? 'tradepulse__bar--profit' : 'tradepulse__bar--loss'}`}
                                                        style={{ height: `${Math.max(heightPct, 2)}%` }}
                                                        title={`${d.date}: ${formatCurrency(d.profit, displayCurrency)}`}
                                                    />
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className='tradepulse__chart-labels'>
                                        {chartData.map((d, i) => (
                                            <div key={i} className='tradepulse__chart-label'>
                                                {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </section>

            {/* Contract Performance Table */}
            <section className='tradepulse__section'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div className='tradepulse__section-brand'>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                            {localize('Performance History')}
                        </div>
                        <h3 className='tradepulse__section-title'>{localize('Option Contract Performance')}</h3>
                        <p className='tradepulse__section-subtitle'>{localize('Completed contracts only — grouped by contract type. Open positions are excluded.')}</p>
                    </div>

                    {contractPerformance.length === 0 ? (
                        <div className='tradepulse__card-body' style={{ textAlign: 'center', padding: '40px 0' }}>
                            <p className='tradepulse__text-muted'>{localize('No completed contracts yet. Trades will appear here automatically once connected.')}</p>
                        </div>
                    ) : (
                        <div className='tradepulse__table-wrapper'>
                            <table className='tradepulse__table'>
                                <thead>
                                    <tr>
                                        <th className='tradepulse__table-left'>{localize('Contract Type')}</th>
                                        <th className='tradepulse__table-right'>{localize('Trades')}</th>
                                        <th className='tradepulse__table-right'>{localize('Wins')}</th>
                                        <th className='tradepulse__table-right'>{localize('Losses')}</th>
                                        <th className='tradepulse__table-right'>{localize('Win %')}</th>
                                        <th className='tradepulse__table-right'>{localize('Net Profit')}</th>
                                        <th className='tradepulse__table-right'>{localize('Avg Profit')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contractPerformance.map((g: any) => {
                                        const winPct = g.trades ? (g.wins / g.trades * 100) : 0;
                                        const avg = g.trades ? g.net / g.trades : 0;
                                        const barColor = winPct >= 70 ? 'tradepulse__win-fill--high' : winPct >= 50 ? 'tradepulse__win-fill--mid' : 'tradepulse__win-fill--low';

                                        return (
                                            <tr key={g.type}>
                                                <td>
                                                    <div className='tradepulse__table-name'>{typeLabel(g.type)}</div>
                                                    <div className='tradepulse__win-bar'>
                                                        <div className={`tradepulse__win-fill ${barColor}`} style={{ width: `${Math.min(100, winPct)}%` }} />
                                                    </div>
                                                </td>
                                                <td className='tradepulse__table-right tradepulse__table-mono'>{g.trades}</td>
                                                <td className='tradepulse__table-right tradepulse__table-mono tradepulse__text-success'>{g.wins}</td>
                                                <td className='tradepulse__table-right tradepulse__table-mono tradepulse__text-danger'>{g.losses}</td>
                                                <td className='tradepulse__table-right tradepulse__table-mono tradepulse__table-bold'>{winPct.toFixed(1)}%</td>
                                                <td className={`tradepulse__table-right tradepulse__table-mono tradepulse__table-bold ${g.net >= 0 ? 'tradepulse__text-success' : 'tradepulse__text-danger'}`}>
                                                    {g.net >= 0 ? '+' : ''}{formatCurrency(g.net, displayCurrency)}
                                                </td>
                                                <td className='tradepulse__table-right tradepulse__table-mono'>{avg >= 0 ? '+' : ''}{formatCurrency(avg, displayCurrency)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
});

const typeLabel = (t: string) => {
    const map: Record<string, string> = {
        'DIGITOVER': 'Digit Over',
        'DIGITUNDER': 'Digit Under',
        'DIGITODD': 'Digit Odd',
        'DIGITEVEN': 'Digit Even',
        'DIGITMATCH': 'Digit Match',
        'DIGITDIFF': 'Digit Differs',
        'CALL': 'Rise',
        'PUT': 'Fall',
        'CALLPUT': 'Higher/Lower',
        'higher': 'Higher',
        'lower': 'Lower',
        'ONETOUCH': 'Touch',
        'NOTOUCH': 'No Touch',
    };
    return map[t] || t;
};

const formatCurrency = (value: number, currency: string): string => {
    if (Math.abs(value) < 0.01) return `${currency} 0.00`;
    return `${currency} ${value.toFixed(2)}`;
};

export default Performance;
