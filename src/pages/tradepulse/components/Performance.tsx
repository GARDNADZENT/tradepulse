// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo, useState, useEffect } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import useTradePulseData from '../hooks/useTradePulseData';
import { loadJourney, buildSchedule, formatCurrency } from '../utils/calculations';
import './Performance.scss';

const Performance = observer(() => {
    const { overallStats, currency, loading, error, dailyPnL, balance, loginid } = useTradePulseData();
    const [filter, setFilter] = useState<'7d' | '30d' | 'all'>('all');
    const [journey, setJourney] = useState<any>(null);

    useEffect(() => {
        let cancelled = false;
        const fetchJourney = async () => {
            try {
                if (!loginid) return;
                const loaded = await loadJourney(loginid);
                if (!cancelled) setJourney(loaded);
            } catch (e) {
                // silent
            }
        };
        fetchJourney();
        return () => { cancelled = true; };
    }, [loginid]);

    const schedule = useMemo(() => journey ? buildSchedule(journey) : [], [journey]);
    const startingBalance = journey?.initial_balance ?? (balance - overallStats.total_profit);
    const targetBalance = schedule.length > 0 ? schedule[schedule.length - 1].end : 0;
    const currentBalance = balance;

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

    const filteredPnL = useMemo(() => {
        if (filter === 'all') return dailyPnL;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - Number(filter.slice(0, -1)));
        const cutoffStr = cutoff.toISOString().slice(0, 10);
        return dailyPnL.filter(d => d.date >= cutoffStr);
    }, [dailyPnL, filter]);

    const winningDays = filteredPnL.filter(d => d.profit > 0).length;
    const losingDays = filteredPnL.filter(d => d.profit < 0).length;
    const netProfit = filteredPnL.reduce((s, d) => s + d.profit, 0);
    const bestDay = filteredPnL.length > 0 ? filteredPnL.reduce((a, b) => b.profit > a.profit ? b : a) : null;
    const worstDay = filteredPnL.length > 0 ? filteredPnL.reduce((a, b) => b.profit < a.profit ? b : a) : null;
    const avgDaily = filteredPnL.length > 0 ? netProfit / filteredPnL.length : 0;
    const winRate = filteredPnL.length > 0 ? (winningDays / filteredPnL.length) * 100 : 0;

    const maxAbs = Math.max(...filteredPnL.map(d => Math.abs(d.profit)), 1);

    return (
        <div className='performance'>
            <div className='performance__header'>
                <div>
                    <div className='performance__label'>{localize('Analytics')}</div>
                    <h1 className='performance__title'>{localize('Performance')}</h1>
                    <p className='performance__subtitle'>{localize('Daily trading performance and results.')}</p>
                </div>
            </div>

            <div className='performance__section'>
                <div className='performance__section-header'>
                    <h3 className='performance__section-title'>{localize('Overview')}</h3>
                    <div className='performance__filters'>
                        <button className={classNames('performance__filter', { 'performance__filter--active': filter === '7d' })} onClick={() => setFilter('7d')}>7D</button>
                        <button className={classNames('performance__filter', { 'performance__filter--active': filter === '30d' })} onClick={() => setFilter('30d')}>30D</button>
                        <button className={classNames('performance__filter', { 'performance__filter--active': filter === 'all' })} onClick={() => setFilter('all')}>ALL</button>
                    </div>
                </div>
                <div className='performance__stats-grid'>
                    <StatCard label={localize('Starting Balance')} value={formatCurrency(startingBalance, currency)} />
                    <StatCard label={localize('Current Balance')} value={formatCurrency(currentBalance, currency)} highlight={currentBalance >= startingBalance} accent />
                    <StatCard label={localize('Target')} value={formatCurrency(targetBalance, currency)} />
                </div>
            </div>

            <div className='performance__section'>
                <div className='performance__section-header'>
                    <h3 className='performance__section-title'>{localize('Daily Performance')}</h3>
                </div>
                <div className='performance__chart-card'>
                    {filteredPnL.length === 0 ? (
                        <div className='performance__empty'>
                            <div className='performance__empty-text'>{localize('No performance data yet')}</div>
                            <div className='performance__empty-sub'>{localize('Trades will appear here automatically once connected.')}</div>
                        </div>
                    ) : (
                        <div className='performance__chart'>
                            <div className='performance__chart-bars'>
                                {filteredPnL.map((d, i) => {
                                    const heightPct = Math.max(2, (Math.abs(d.profit) / maxAbs) * 100);
                                    const isProfit = d.profit >= 0;
                                    const isLast = i === filteredPnL.length - 1;

                                    return (
                                        <div key={d.date} className={classNames('performance__bar-wrap', { 'performance__bar-wrap--last': isLast })}>
                                            <div
                                                className={classNames('performance__bar', {
                                                    'performance__bar--profit': isProfit,
                                                    'performance__bar--loss': !isProfit,
                                                })}
                                                style={{ height: `${heightPct}%` }}
                                                title={`${d.date}: ${formatCurrency(d.profit, currency)} (${d.trades} trades)`}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                            <div className='performance__chart-labels'>
                                {filteredPnL.length <= 15 ? filteredPnL.map(d => (
                                    <span key={d.date} className='performance__chart-label'>{new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                )) : (
                                    <>
                                        <span className='performance__chart-label'>{new Date(filteredPnL[0]?.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                        <span className='performance__chart-label'>...</span>
                                        <span className='performance__chart-label'>{new Date(filteredPnL[filteredPnL.length - 1]?.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className='performance__section'>
                <div className='performance__section-header'>
                    <h3 className='performance__section-title'>{localize('Summary')}</h3>
                </div>
                <div className='performance__stats-grid'>
                    <StatCard label={localize('Winning Days')} value={String(winningDays)} accent />
                    <StatCard label={localize('Losing Days')} value={String(losingDays)} />
                    <StatCard label={localize('Net P/L')} value={formatCurrency(netProfit, currency)} highlight={netProfit >= 0} />
                    <StatCard label={localize('Best Day')} value={bestDay ? formatCurrency(bestDay.profit, currency) : '—'} accent />
                    <StatCard label={localize('Worst Day')} value={worstDay ? formatCurrency(worstDay.profit, currency) : '—'} />
                    <StatCard label={localize('Win Rate')} value={`${winRate.toFixed(1)}%`} accent />
                    <StatCard label={localize('Avg Daily P/L')} value={formatCurrency(avgDaily, currency)} highlight={avgDaily >= 0} />
                </div>
            </div>

            <div className='performance__section'>
                <div className='performance__section-header'>
                    <h3 className='performance__section-title'>{localize('Daily Results')}</h3>
                </div>
                <div className='performance__card'>
                    <div className='overflow-x-auto'>
                        <table className='performance__table'>
                            <thead>
                                <tr>
                                    <th className='text-left'>{localize('Date')}</th>
                                    <th className='text-right'>{localize('Trades')}</th>
                                    <th className='text-right'>{localize('Net Profit')}</th>
                                    <th className='text-center'>{localize('Result')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredPnL.length === 0 ? (
                                    <tr>
                                        <td colSpan={4}>
                                            <div className='performance__empty'>
                                                <div className='performance__empty-text'>{localize('No completed contracts yet')}</div>
                                                <div className='performance__empty-sub'>{localize('Trades will appear here automatically once connected.')}</div>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    filteredPnL.slice(-50).reverse().map((d, i) => {
                                        const isProfit = d.profit >= 0;
                                        const dateObj = new Date(d.date + 'T00:00:00');
                                        const dateLabel = dateObj.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

                                        return (
                                            <tr key={`${d.date}-${i}`} className='performance__table-row'>
                                                <td className='font-medium'>{dateLabel}</td>
                                                <td className='text-right mono'>{d.trades}</td>
                                                <td className={classNames('text-right mono font-semibold', {
                                                    'text-profit': isProfit,
                                                    'text-loss': !isProfit,
                                                })}>
                                                    {isProfit ? '+' : ''}{formatCurrency(d.profit, currency)}
                                                </td>
                                                <td className='text-center'>
                                                    <span className={classNames('chip', {
                                                        'bg-emerald-50 text-emerald-700': isProfit,
                                                        'bg-rose-50 text-rose-700': !isProfit,
                                                    })}>
                                                        {isProfit ? '↑ ' + localize('Profit') : '↓ ' + localize('Loss')}
                                                    </span>
                                                </td>
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
    <div className={classNames('performance__stat-card', { 'performance__stat-card--accent': accent })}>
        <div className='performance__stat-label'>{label}</div>
        <div className={classNames('performance__stat-value', { 'text-profit': highlight, 'text-loss': highlight === false })}>{value}</div>
    </div>
);

export default Performance;
