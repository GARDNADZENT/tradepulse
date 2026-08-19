// @ts-nocheck — TradePulse component with known type gaps
import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import useTradePulseData from '../hooks/useTradePulseData';
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import {
    loadJourney,
    getDefaultJourney,
} from '../utils/calculations';
import './AccountInfo.scss';

const AccountInfo = observer(() => {
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid ?? '—';
    const { balance: fetchedBalance, loading } = useTradePulseFetch();
    const balance = client?.balance ? parseFloat(client.balance) : fetchedBalance;
    const currency = client?.currency ?? 'USD';
    const isVirtual = client?.is_virtual ?? false;

    const { overallStats } = useTradePulseData();

    const [journey, setJourney] = useState<any>(null);

    useEffect(() => {
        let cancelled = false;
        const fetchJourney = async () => {
            const loaded = await loadJourney(loginid);
            if (!cancelled) {
                setJourney(loaded ?? getDefaultJourney(loginid));
            }
        };
        fetchJourney();
        return () => { cancelled = true; };
    }, [loginid]);

    const totalTrades = overallStats.total_trades || 0;
    const wins = overallStats.winning_trades || 0;
    const losses = overallStats.losing_trades || 0;
    const winRate = overallStats.win_rate || 0;
    const netProfit = overallStats.total_profit || 0;
    const avgProfit = overallStats.avg_win || 0;
    const avgLoss = overallStats.avg_loss || 0;
    const largestWin = overallStats.largest_win || 0;
    const largestLoss = overallStats.largest_loss || 0;
    const bestDay = overallStats.best_day;
    const worstDay = overallStats.worst_day;
    const mostTraded = overallStats.most_traded || 0;
    const mostTradedContract = overallStats.most_traded_contract || '—';
    const winStreak = overallStats.win_streak || 0;
    const lossStreak = overallStats.loss_streak || 0;

    const currentBalance = balance || 0;
    const startingBalance = currentBalance - netProfit;
    const journeyInitialBalance = Number(journey?.initial_balance || 0);
    const roi = journeyInitialBalance > 0 ? (netProfit / journeyInitialBalance) * 100 : 0;
    const accountPerformance = journeyInitialBalance > 0 ? (netProfit / journeyInitialBalance) * 100 : 0;

    if (loading && balance === 0) {
        return (
            <div className='tradepulse__page'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div className='tradepulse__section-brand'>{localize('Overview')}</div>
                        <h2 className='tradepulse__section-title'>{localize('Account Summary')}</h2>
                    </div>
                    <div className='tradepulse__card-body'>
                        <p className='text-sm text-slate-500'>{localize('Loading account details...')}</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='tradepulse__page fade-in'>
            <div className='tradepulse__section-header'>
                <div>
                    <div className='tradepulse__section-brand'>{localize('Overview')}</div>
                    <h2 className='tradepulse__section-title'>{localize('Account Summary')}</h2>
                    <p className='tradepulse__section-subtitle'>{localize('Complete view of your trading activity and account details.')}</p>
                </div>
            </div>

            <div className='tradepulse__summary-grid'>
                <SummaryCard label={localize('Total Trades')} value={String(totalTrades)} icon='activity' />
                <SummaryCard label={localize('Wins')} value={String(wins)} icon='trophy' tone='emerald' />
                <SummaryCard label={localize('Losses')} value={String(losses)} icon='alert-triangle' tone='rose' />
                <SummaryCard label={localize('Win Rate')} value={`${winRate.toFixed(1)}%`} icon='percent' tone='brand' />
                <SummaryCard label={localize('Net Profit')} value={`${netProfit >= 0 ? '+' : ''}${formatCurrency(netProfit, currency)}`} icon='trending-up' tone={netProfit >= 0 ? 'emerald' : 'rose'} mono />
                <SummaryCard label={localize('Average Profit')} value={`${avgProfit >= 0 ? '+' : ''}${formatCurrency(avgProfit, currency)}`} icon='trending-up' tone={avgProfit >= 0 ? 'emerald' : 'rose'} mono />
                <SummaryCard label={localize('Average Loss')} value={`${avgLoss >= 0 ? '+' : ''}${formatCurrency(avgLoss, currency)}`} icon='trending-down' tone={avgLoss >= 0 ? 'emerald' : 'rose'} mono />
                <SummaryCard label={localize('Largest Win')} value={`+${formatCurrency(largestWin, currency)}`} icon='trending-up' tone='emerald' mono />
                <SummaryCard label={localize('Largest Loss')} value={`${formatCurrency(largestLoss, currency)}`} icon='trending-down' tone='rose' mono />
                <SummaryCard label={localize('Best Day')} value={bestDay ? `${bestDay.date} · +${formatCurrency(bestDay.profit, currency)}` : '—'} icon='trophy' tone='emerald' />
                <SummaryCard label={localize('Worst Day')} value={worstDay ? `${worstDay.date} · ${formatCurrency(worstDay.profit, currency)}` : '—'} icon='alert-triangle' tone='rose' />
                <SummaryCard label={localize('Most Traded')} value={String(mostTraded)} icon='activity' />
                <SummaryCard label={localize('Most Traded Contract')} value={mostTradedContract || '—'} icon='bar-chart-3' tone='brand' />
                <SummaryCard label={localize('Win Streak')} value={`${winStreak}`} icon='flame' tone='amber' />
                <SummaryCard label={localize('Loss Streak')} value={`${lossStreak}`} icon='flame' tone='rose' />
                <SummaryCard label={localize('Current Balance')} value={formatCurrency(currentBalance, currency)} icon='wallet' mono />
                <SummaryCard label={localize('Starting Balance')} value={formatCurrency(startingBalance, currency)} icon='wallet' mono />
                <SummaryCard label={localize('ROI')} value={`${roi.toFixed(2)}%`} icon='percent' tone={roi >= 0 ? 'emerald' : 'rose'} />
                <SummaryCard label={localize('Journey Initial Balance')} value={formatCurrency(journeyInitialBalance, currency)} icon='flag' mono />
                <SummaryCard label={localize('Total Profit/Loss')} value={`${netProfit >= 0 ? '+' : ''}${formatCurrency(netProfit, currency)}`} icon='trending-up' tone={netProfit >= 0 ? 'emerald' : 'rose'} mono />
                <SummaryCard label={localize('Account Performance')} value={`${accountPerformance.toFixed(2)}%`} icon='bar-chart-3' tone={accountPerformance >= 0 ? 'emerald' : 'rose'} />
            </div>

            {/* Account details */}
            <div className='tradepulse__section'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <h3 className='tradepulse__section-title'>{localize('Account Details')}</h3>
                        <p className='tradepulse__section-subtitle'>{localize('Connected Deriv account information.')}</p>
                    </div>
                    <div className='tradepulse__card-body'>
                        <div className='tradepulse__account-grid'>
                            <div className='tradepulse__account-block'>
                                <div className='tradepulse__account-block-title'>{localize('Account Info')}</div>
                                <div className='tradepulse__account-rows'>
                                    <div className='tradepulse__account-row'>
                                        <span className='tradepulse__account-label'>{localize('Login ID')}</span>
                                        <span className='tradepulse__account-value mono'>{loginid}</span>
                                    </div>
                                    <div className='tradepulse__account-row'>
                                        <span className='tradepulse__account-label'>{localize('Account Type')}</span>
                                        <span className={`tradepulse__chip ${!isVirtual ? 'tradepulse__chip--ontrack' : 'tradepulse__chip--pending'}`}>
                                            {!isVirtual ? 'REAL' : 'DEMO'}
                                        </span>
                                    </div>
                                    <div className='tradepulse__account-row'>
                                        <span className='tradepulse__account-label'>{localize('Currency')}</span>
                                        <span className='tradepulse__account-value mono'>{currency}</span>
                                    </div>
                                    <div className='tradepulse__account-row'>
                                        <span className='tradepulse__account-label'>{localize('Landing Company')}</span>
                                        <span className='tradepulse__account-value'>{client?.landing_company_shortcode || '—'}</span>
                                    </div>
                                </div>
                            </div>

                            <div className='tradepulse__account-block'>
                                <div className='tradepulse__account-block-title'>{localize('Balance')}</div>
                                <div className='tradepulse__account-rows'>
                                    <div className='tradepulse__account-row'>
                                        <span className='tradepulse__account-label'>{localize('Current Balance')}</span>
                                        <span className='tradepulse__account-value mono text-emerald-700 font-semibold'>{formatCurrency(balance, currency)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

const SummaryCard = ({ label, value, icon, tone, mono }: {
    label: string;
    value: string;
    icon?: string;
    tone?: string;
    mono?: boolean;
}) => {
    const iconColor = tone === 'emerald' ? 'text-emerald-500' : tone === 'rose' ? 'text-rose-500' : tone === 'brand' ? 'text-brand-500' : tone === 'amber' ? 'text-amber-500' : 'text-slate-400';
    return (
        <div className='tradepulse__summary-card'>
            <div className='tradepulse__summary-header'>
                <span className='tradepulse__summary-label'>{label}</span>
                {icon && (
                    <svg className={`tradepulse__summary-icon ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {icon === 'activity' && <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></>}
                        {icon === 'trophy' && <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></>}
                        {icon === 'alert-triangle' && <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></>}
                        {icon === 'percent' && <><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></>}
                        {icon === 'flame' && <><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></>}
                        {icon === 'trending-up' && <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></>}
                        {icon === 'trending-down' && <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></>}
                        {icon === 'user' && <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></>}
                        {icon === 'coins' && <><circle cx="8" cy="8" r="6"></circle><path d="M18.09 10.37A6 6 0 1 1 10.34 16"></path><path d="M7 6h10"></path><path d="M7 10h10"></path></>}
                        {icon === 'wallet' && <><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></>}
                        {icon === 'flag' && <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></>}
                        {icon === 'bar-chart-3' && <><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></>}
                    </svg>
                )}
            </div>
            <div className={`tradepulse__summary-value ${mono ? 'tradepulse__summary-value--mono' : ''}`}>{value}</div>
        </div>
    );
};

const formatCurrency = (value: number, currency: string): string => {
    if (Math.abs(value) < 0.01) return `${currency} 0.00`;
    return `${currency} ${value.toFixed(2)}`;
};

export default AccountInfo;
