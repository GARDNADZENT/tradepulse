// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import useTradePulseData from '../hooks/useTradePulseData';
import './Performance.scss';

const Performance = observer(() => {
    const { todayStats, contractPerformance, currency, loading, error } = useTradePulseData();
    const [filter, setFilter] = useState<'today' | '7d' | '30d' | 'all'>('all');

    if (loading) {
        return (
            <div className='performance'>
                <p className='performance__loading'>{localize('Loading performance data...')}</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className='performance'>
                <p className='performance__error'>{localize('Failed to load performance data:')} {error}</p>
            </div>
        );
    }

    return (
        <div className='performance'>
            <div className='performance__header'>
                <div>
                    <div className='performance__label'>{localize('Analytics')}</div>
                    <h1 className='performance__title'>{localize('Performance')}</h1>
                    <p className='performance__subtitle'>{localize('Completed contracts grouped by contract type. Open positions are excluded.')}</p>
                </div>
            </div>

            <div className='performance__section'>
                <div className='performance__section-header'>
                    <h3 className='performance__section-title'>{localize("Today's Stats")}</h3>
                </div>
                <div className='performance__stats-grid'>
                    <StatCard label={localize('Total Trades')} value={String(todayStats.total_trades)} />
                    <StatCard label={localize('Total Wins')} value={String(todayStats.winning_trades)} accent />
                    <StatCard label={localize('Total Losses')} value={String(todayStats.losing_trades)} />
                    <StatCard label={localize('Win Rate')} value={todayStats.win_rate !== null ? `${todayStats.win_rate.toFixed(1)}%` : '—'} accent />
                    <StatCard label={localize('Net P/L')} value={formatCurrency(todayStats.total_profit, currency)} highlight={todayStats.total_profit >= 0} />
                </div>
            </div>

            <div className='performance__section'>
                <div className='performance__section-header'>
                    <h3 className='performance__section-title'>{localize('Contract Performance')}</h3>
                </div>
                <div className='performance__card'>
                    <div className='overflow-x-auto'>
                        <table className='performance__table'>
                            <thead>
                                <tr>
                                    <th className='text-left'>{localize('Contract Type')}</th>
                                    <th className='text-right'>{localize('Trades')}</th>
                                    <th className='text-right'>{localize('Wins')}</th>
                                    <th className='text-right'>{localize('Losses')}</th>
                                    <th className='text-right'>{localize('Win %')}</th>
                                    <th className='text-right'>{localize('Net Profit')}</th>
                                    <th className='text-right'>{localize('Avg Profit')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {contractPerformance.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <div className='performance__empty'>
                                                <div className='performance__empty-icon'>
                                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <line x1="18" y1="20" x2="18" y2="10"></line>
                                                        <line x1="12" y1="20" x2="12" y2="4"></line>
                                                        <line x1="6" y1="20" x2="6" y2="14"></line>
                                                    </svg>
                                                </div>
                                                <div className='performance__empty-text'>{localize('No completed contracts yet')}</div>
                                                <div className='performance__empty-sub'>{localize('Trades will appear here automatically once connected.')}</div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    contractPerformance.map((g: any) => {
                                        const winPct = g.trades ? (g.wins / g.trades * 100) : 0;
                                        const avg = g.trades ? g.net / g.trades : 0;
                                        const barColor = winPct >= 70 ? 'bg-emerald-500' : winPct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
                                        
                                        return (
                                            <tr key={g.type} className='performance__table-row'>
                                                <td>
                                                    <div className='font-semibold'>{typeLabel(g.type)}</div>
                                                    <div className='performance__win-bar'>
                                                        <div className={classNames('performance__win-fill', barColor)} style={{ width: `${Math.min(100, winPct)}%` }} />
                                                    </div>
                                                </td>
                                                <td className='text-right mono'>{g.trades}</td>
                                                <td className='text-right mono text-emerald-600 font-semibold'>{g.wins}</td>
                                                <td className='text-right mono text-rose-600 font-semibold'>{g.losses}</td>
                                                <td className='text-right mono font-semibold'>{winPct.toFixed(1)}%</td>
                                                <td className={classNames('text-right mono font-semibold', {
                                                    'text-emerald-600': g.net >= 0,
                                                    'text-rose-600': g.net < 0,
                                                })}>
                                                    {g.net >= 0 ? '+' : ''}{formatCurrency(g.net, currency)}
                                                </td>
                                                <td className='text-right mono'>{avg >= 0 ? '+' : ''}{formatCurrency(avg, currency)}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
});

const StatCard = ({ label, value, accent, highlight }: { label: string; value: string; accent?: boolean; highlight?: boolean }) => (
    <div className={classNames('stat-card', { 'stat-card--accent': accent })}>
        <div className='stat-card__label'>{label}</div>
        <div className={classNames('stat-card__value', { 'text-profit': highlight, 'text-loss': highlight === false })}>{value}</div>
    </div>
);

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
