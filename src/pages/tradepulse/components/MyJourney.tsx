// @ts-nocheck — TradePulse component with known type gaps
import React from 'react';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useTradePulse } from '../TradePulseContext';
import { localize } from '@deriv-com/translations';
import {
    getCurrentJourneyDay,
    computeJourneyDay,
    formatCurrency,
} from '../utils/calculations';
import useTradePulseData from '../hooks/useTradePulseData';
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './MyJourney.scss';

const MyJourney = observer(() => {
    const { connectionStatus } = useApiBase();
    const { balance: fetchedBalance, loading } = useTradePulseFetch();
    const balance = fetchedBalance;
    const currency = 'USD';

    const { journey, schedule, journeyLoading, refreshJourney } = useTradePulse();
    const isConnected = connectionStatus === 'opened' || connectionStatus === 'OPENED';

    const currentDay = journey ? getCurrentJourneyDay(journey.start_date) : 1;
    const rows = schedule?.rows || [];
    const idx = Math.min(Math.max(currentDay, 1), rows.length) - 1;
    const baseRow = rows[idx];
    const row = baseRow ? computeJourneyDay(baseRow, balance, currentDay) : undefined;
    const displayRow = row || baseRow;

    const progress = journey ? Math.min(100, Math.max(0, ((currentDay - 1) / journey.cycle_length_days) * 100)) : 0;
    const delta = balance - (baseRow?.end ?? 0);

    const { overallStats } = useTradePulseData();
    const totalTrades = overallStats.total_trades || 0;
    const winRate = overallStats.win_rate || 0;
    const streakLabel = overallStats.win_streak > 0 ? `🔥 ${overallStats.win_streak} Wins` : overallStats.loss_streak > 0 ? `❄ ${overallStats.loss_streak} Losses` : '—';
    const todayProfit = overallStats.total_profit || 0;

    if (journeyLoading || !journey || !schedule) {
        return (
            <div className='tradepulse__page'>
                {/* Today's Target */}
                <section className='tradepulse__section'>
                    <div className='tradepulse__section-header'>
                        <div>
                            <div className='tradepulse__section-brand'>{localize('Today')}</div>
                            <h2 className='tradepulse__section-title'>{localize("Today's Target")}</h2>
                            <p className='tradepulse__section-subtitle'>{localize('Track your daily progress against the plan.')}</p>
                        </div>
                        <div className='tradepulse__live-indicator'>
                            <span className='tradepulse__live-dot'></span>
                            <span>{localize('Waiting for connection')}</span>
                        </div>
                    </div>
                    <div className='tradepulse__kpi-grid'>
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className='tradepulse__kpi-card'>
                                <div className='tradepulse__skeleton tradepulse__skeleton-text tradepulse__skeleton-text--short'></div>
                                <div className='tradepulse__skeleton tradepulse__skeleton-title'></div>
                            </div>
                        ))}
                    </div>
                    <div className='tradepulse__skeleton tradepulse__skeleton-card'></div>
                </section>

                {/* Quick Summary */}
                <section className='tradepulse__section'>
                    <div className='tradepulse__summary-grid'>
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className='tradepulse__summary-card'>
                                <div className='tradepulse__skeleton tradepulse__skeleton-text tradepulse__skeleton-text--short'></div>
                                <div className='tradepulse__skeleton tradepulse__skeleton-title'></div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        );
    }

    const showBalanceSkeleton = loading && balance === 0;

    return (
        <div className='tradepulse__page fade-in'>
            {/* Today's Target */}
            <section className='tradepulse__section'>
                <div className='tradepulse__section-header'>
                    <div>
                        <div className='tradepulse__section-brand'>{localize('Today')}</div>
                        <h2 className='tradepulse__section-title'>{localize("Today's Target")}</h2>
                        <p className='tradepulse__section-subtitle'>{localize('Track your daily progress against the plan.')}</p>
                    </div>
                    <div className='tradepulse__live-indicator'>
                        <span className={`tradepulse__live-dot${isConnected ? ' tradepulse__live-dot--active' : ''}`}></span>
                        <span>{isConnected ? localize('Live') : localize('Waiting for connection')}</span>
                    </div>
                </div>

                <div className='tradepulse__kpi-grid'>
                    <KPICard label={localize('Starting Balance')} value={formatCurrency(baseRow.start, currency)} icon='wallet' />
                    <KPICard label={localize("Today's Profit Target")} value={`+${formatCurrency(baseRow.profit, currency)}`} icon='target' accent />
                    <KPICard label={localize('Required %')} value={`${baseRow.rate}%`} icon='percent' />
                    <KPICard label={localize('Expected Balance')} value={formatCurrency(baseRow.end, currency)} icon='trending-up' />
                    <KPICard
                        label={localize('Live Balance')}
                        value={showBalanceSkeleton ? '' : formatCurrency(balance, currency)}
                        icon='activity'
                        live
                        highlight={delta >= 0}
                        sub={showBalanceSkeleton ? '' : (delta >= 0 ? `+${formatCurrency(delta, currency)} vs target` : `${formatCurrency(delta, currency)} vs target`)}
                        skeleton={showBalanceSkeleton}
                    />
                    <KPICard label={localize('30-Day Goal')} value={formatCurrency(rows[rows.length - 1]?.end ?? 0, currency)} icon='flag' />
                </div>

                <div className='tradepulse__progress-card'>
                    <div className='tradepulse__progress-header'>
                        <div>
                            <div className='tradepulse__progress-label'>{localize('Cycle Progress')}</div>
                            <div className='tradepulse__progress-sub'>{localize('Day')} {currentDay} {localize('of')} {journey.cycle_length_days}</div>
                        </div>
                        <div className='tradepulse__progress-pct'>{Math.round(progress)}%</div>
                    </div>
                    <div className='tradepulse__progress-bar'>
                        <div className='tradepulse__progress-fill' style={{ width: `${progress}%` }} />
                    </div>
                </div>
            </section>

            {/* Quick Summary */}
            <section className='tradepulse__section'>
                <div className='tradepulse__summary-grid'>
                    <SummaryCard label={localize('Total Trades')} value={String(totalTrades)} icon='activity' />
                    <SummaryCard label={localize('Win Rate')} value={`${winRate.toFixed(1)}%`} icon='trophy' accent />
                    <SummaryCard label={localize('Streak')} value={streakLabel} icon='flame' />
                    <SummaryCard label={localize("Today's Profit")} value={`${todayProfit >= 0 ? '+' : ''}${formatCurrency(todayProfit, currency)}`} icon='trending-up' highlight={todayProfit >= 0} />
                </div>
            </section>
        </div>
    );
});

const KPICard = ({ label, value, sub, icon, accent, live, highlight, skeleton }: {
    label: string;
    value: string;
    sub?: string;
    icon?: string;
    accent?: boolean;
    live?: boolean;
    highlight?: boolean;
    skeleton?: boolean;
}) => (
    <div className='tradepulse__kpi-card'>
        <div className='tradepulse__kpi-header'>
            <span className='tradepulse__kpi-label'>{label}</span>
            {icon && (
                <svg className='tradepulse__kpi-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {icon === 'wallet' && <><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></>}
                    {icon === 'target' && <><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></>}
                    {icon === 'percent' && <><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></>}
                    {icon === 'trending-up' && <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></>}
                    {icon === 'activity' && <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></>}
                    {icon === 'flag' && <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></>}
                </svg>
            )}
        </div>
        {skeleton ? (
            <div className='tradepulse__skeleton tradepulse__skeleton-title'></div>
        ) : (
            <div className={`tradepulse__kpi-value ${live ? 'tradepulse__kpi-value--live' : highlight ? 'tradepulse__kpi-value--profit' : accent ? 'tradepulse__kpi-value--brand' : ''}`}>{value}</div>
        )}
        {sub && !skeleton && <div className='tradepulse__kpi-sub'>{sub}</div>}
    </div>
);

const SummaryCard = ({ label, value, icon, accent, highlight, tone }: {
    label: string;
    value: string;
    icon?: string;
    accent?: boolean;
    highlight?: boolean;
    tone?: 'emerald' | 'rose' | 'brand' | 'amber';
}) => {
    const colorClass = tone === 'emerald' ? 'tradepulse__text-success' : tone === 'rose' ? 'tradepulse__text-danger' : tone === 'brand' ? 'tradepulse__text-brand' : tone === 'amber' ? 'tradepulse__text-warning' : '';
    return (
    <div className='tradepulse__summary-card'>
        <div className='tradepulse__summary-header'>
            <span className='tradepulse__summary-label'>{label}</span>
            {icon && (
                <svg className='tradepulse__summary-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {icon === 'activity' && <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></>}
                    {icon === 'trophy' && <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></>}
                    {icon === 'flame' && <><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></>}
                    {icon === 'trending-up' && <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></>}
                    {icon === 'trending-down' && <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></>}
                    {icon === 'alert-triangle' && <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></>}
                    {icon === 'percent' && <><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></>}
                    {icon === 'wallet' && <><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></>}
                    {icon === 'flag' && <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></>}
                    {icon === 'bar-chart-3' && <><path d="M3 3v18"></path><path d="M18 17V9"></path><path d="M13 17V5"></path><path d="M8 17v-3"></path></>}
                </svg>
            )}
        </div>
        <div className={`tradepulse__summary-value ${colorClass}`}>{value}</div>
    </div>
    );
};

const formatCurrency = (value: number, currency: string): string => {
    if (Math.abs(value) < 0.01) return `${currency} 0.00`;
    return `${currency} ${value.toFixed(2)}`;
};

export default MyJourney;
