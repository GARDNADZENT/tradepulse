// @ts-nocheck — TradePulse component with known type gaps
import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import useTradePulseData from '../hooks/useTradePulseData';
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './AccountInfo.scss';

const AccountInfo = observer(() => {
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid ?? '—';
    const { balance: fetchedBalance, loading } = useTradePulseFetch();
    const balance = client?.balance ? parseFloat(client.balance) : fetchedBalance;
    const currency = client?.currency ?? 'USD';
    const isVirtual = client?.is_virtual ?? false;
    const accountType = isVirtual ? 'Demo' : 'Real';

    const { overallStats } = useTradePulseData();

    const [accounts, setAccounts] = useState<any[]>([]);
    const [currentAccount, setCurrentAccount] = useState<string | null>(null);

    useEffect(() => {
        if (client?.all_accounts_balance) {
            const accs = Object.entries(client.all_accounts_balance).map(([id, bal]: [string, any]) => ({
                loginid: id,
                balance: bal?.balance ?? 0,
                currency: bal?.currency ?? currency,
                is_virtual: !bal?.is_virtual ? false : true,
            }));
            setAccounts(accs);
            setCurrentAccount(client.loginid);
        }
    }, [client?.all_accounts_balance, client?.loginid, currency]);

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

    const totalTrades = overallStats.total_trades || 0;
    const wins = overallStats.winning_trades || 0;
    const losses = overallStats.losing_trades || 0;
    const winRate = overallStats.win_rate || 0;
    const streakLabel = overallStats.win_streak > 0 ? `🔥 ${overallStats.win_streak} Wins` : overallStats.loss_streak > 0 ? `❄ ${overallStats.loss_streak} Losses` : '—';
    const todayProfit = overallStats.total_profit || 0;
    const currencyDisplay = overallStats.currency || currency;
    const marketDisplay = 'Deriv Synthetic Indices';

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
                <SummaryCard label={localize('Winning Trades')} value={String(wins)} icon='trophy' tone='emerald' />
                <SummaryCard label={localize('Losing Trades')} value={String(losses)} icon='alert-triangle' tone='rose' />
                <SummaryCard label={localize('Overall Win Rate')} value={`${winRate.toFixed(1)}%`} icon='percent' tone='brand' />
                <SummaryCard label={localize('Current Streak')} value={streakLabel} icon='flame' tone='amber' />
                <SummaryCard label={localize("Today's Profit")} value={`${todayProfit >= 0 ? '+' : ''}${formatCurrency(todayProfit, currencyDisplay)}`} icon='trending-up' tone={todayProfit >= 0 ? 'emerald' : 'rose'} />
                <SummaryCard label={localize('Connected Account')} value={loginid} icon='user' tone='slate' mono />
                <SummaryCard label={localize('Currency')} value={currencyDisplay} icon='coins' tone='slate' />
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

                            {accounts.length > 1 && (
                                <div className='tradepulse__account-block' style={{ gridColumn: '1 / -1' }}>
                                    <div className='tradepulse__account-block-title'>{localize('All Accounts')}</div>
                                    <div className='tradepulse__accounts-grid'>
                                        {accounts.map((acc: any) => (
                                            <div key={acc.loginid} className={`tradepulse__account-card ${acc.loginid === currentAccount ? 'tradepulse__account-card--active' : ''}`}>
                                                <div className={`tradepulse__account-avatar ${!acc.is_virtual ? 'tradepulse__account-avatar--real' : 'tradepulse__account-avatar--demo'}`}>
                                                    {!acc.is_virtual ? '🇺🇸' : 'D'}
                                                </div>
                                                <div className='tradepulse__account-info'>
                                                    <div className='tradepulse__account-login'>{acc.loginid}</div>
                                                    <div className='tradepulse__account-currency'>{acc.currency}</div>
                                                </div>
                                                <span className={`tradepulse__chip ${!acc.is_virtual ? 'tradepulse__chip--ontrack' : 'tradepulse__chip--pending'}`}>
                                                    {!acc.is_virtual ? 'REAL' : 'DEMO'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className='tradepulse__account-block' style={{ gridColumn: '1 / -1' }}>
                                <div className='tradepulse__account-block-title'>{localize('Connection')}</div>
                                <div className='tradepulse__account-rows'>
                                    <div className='tradepulse__account-row'>
                                        <span className='tradepulse__account-label'>{localize('Status')}</span>
                                        <div className='flex items-center gap-2'>
                                            <span className='w-2 h-2 rounded-full bg-emerald-500'></span>
                                            <span className='text-sm font-semibold text-emerald-700'>{localize('Connected')}</span>
                                        </div>
                                    </div>
                                    <div className='tradepulse__account-row'>
                                        <span className='tradepulse__account-label'>{localize('WebSocket')}</span>
                                        <span className='tradepulse__account-value mono text-xs'>wss://ws.derivws.com/websockets/v3</span>
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
                        {icon === 'user' && <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></>}
                        {icon === 'coins' && <><circle cx="8" cy="8" r="6"></circle><path d="M18.09 10.37A6 6 0 1 1 10.34 16"></path><path d="M7 6h10"></path><path d="M7 10h10"></path></>}
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
