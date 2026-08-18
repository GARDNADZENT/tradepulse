// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo, useState, useEffect } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import useActiveAccount from '@/hooks/api/account/useActiveAccount';
import { localize } from '@deriv-com/translations';
import useTradePulseData from '../hooks/useTradePulseData';
import { loadJourney } from '../utils/calculations';
import './AccountInfo.scss';

const AccountInfo = observer(() => {
    const store = useStore();
    const { client } = store;
    const { data: activeAccount } = useActiveAccount({
        allBalanceData: client?.all_accounts_balance,
        directBalance: client?.balance,
    });
    const { overallStats } = useTradePulseData();

    const loginid = client?.loginid ?? '—';
    const currency = client?.currency ?? '—';
    const balance = activeAccount?.balance ?? '—';
    const accountType = client?.is_virtual ? localize('Demo') : localize('Real');
    const isLoggedIn = client?.is_logged_in ?? false;
    const landingCompany = client?.landing_company_shortcode ?? '—';

    const [journey, setJourney] = useState<any>(null);
    const [journeyLoaded, setJourneyLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const fetchJourney = async () => {
            if (!loginid || loginid === '—') {
                if (!cancelled) setJourneyLoaded(true);
                return;
            }
            const loaded = await loadJourney(loginid);
            if (!cancelled) {
                setJourney(loaded);
                setJourneyLoaded(true);
            }
        };

        fetchJourney();

        return () => {
            cancelled = true;
        };
    }, [loginid]);

    const journeyInitialBalance = journey?.initial_balance ?? 0;
    const currentBalanceNum = typeof balance === 'number' ? balance : 0;
    const startingBalance = currentBalanceNum - overallStats.total_profit;
    const roi = journeyInitialBalance > 0 ? ((overallStats.total_profit / journeyInitialBalance) * 100) : 0;

    if (!journeyLoaded) {
        return (
            <div className='account-info'>
                <div className='account-info__header'>
                    <h1 className='account-info__title'>{localize('Account')}</h1>
                </div>
                <p className='account-info__loading'>{localize('Loading account info...')}</p>
            </div>
        );
    }

    return (
        <div className='account-info'>
            <div className='account-info__header'>
                <div>
                    <div className='account-info__label'>{localize('Overview')}</div>
                    <h1 className='account-info__title'>{localize('Account')}</h1>
                    <p className='account-info__subtitle'>{localize('Lifetime performance of your trading account.')}</p>
                </div>
            </div>

            <div className='account-info__grid'>
                <SummaryCard label={localize('Current Balance')} value={typeof balance === 'number' ? `${balance.toFixed(2)} ${currency}` : balance} icon='wallet' accent />
                <SummaryCard label={localize('Starting Balance')} value={formatCurrency(startingBalance, currency)} icon='flag' />
                <SummaryCard label={localize('Login ID')} value={loginid} icon='user' mono />
                <SummaryCard label={localize('Account Type')} value={accountType} icon='shield' />
                <SummaryCard label={localize('Currency')} value={currency} icon='coins' />
                <SummaryCard label={localize('Total Trades')} value={String(overallStats.total_trades)} icon='activity' />
                <SummaryCard label={localize('Total Wins')} value={String(overallStats.winning_trades)} icon='trophy' accent />
                <SummaryCard label={localize('Total Losses')} value={String(overallStats.losing_trades)} icon='alert-triangle' />
                <SummaryCard label={localize('Overall Win Rate')} value={overallStats.win_rate !== null ? `${overallStats.win_rate.toFixed(1)}%` : '—'} icon='percent' accent />
                <SummaryCard label={localize('ROI')} value={`${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`} icon='trending-up' highlight={roi >= 0} />
                <SummaryCard label={localize('Net Profit')} value={formatCurrency(overallStats.total_profit, currency)} icon='dollar-sign' highlight={overallStats.total_profit >= 0} />
                <SummaryCard label={localize('Best Day')} value={overallStats.best_day ? `${formatCurrency(overallStats.best_day.profit, currency)}` : '—'} icon='arrow-up' accent />
                <SummaryCard label={localize('Worst Day')} value={overallStats.worst_day ? `${formatCurrency(overallStats.worst_day.profit, currency)}` : '—'} icon='arrow-down' />
                <SummaryCard label={localize('Largest Win')} value={overallStats.largest_win !== null ? formatCurrency(overallStats.largest_win, currency) : '—'} icon='trending-up' accent />
                <SummaryCard label={localize('Largest Loss')} value={overallStats.largest_loss !== null ? formatCurrency(overallStats.largest_loss, currency) : '—'} icon='trending-down' />
                <SummaryCard label={localize('Avg Profit')} value={overallStats.avg_win !== null ? formatCurrency(overallStats.avg_win, currency) : '—'} icon='activity' />
                <SummaryCard label={localize('Avg Loss')} value={overallStats.avg_loss !== null ? formatCurrency(overallStats.avg_loss, currency) : '—'} icon='activity' />
                <SummaryCard label={localize('Most Traded Market')} value={overallStats.most_traded_market ? typeLabel(overallStats.most_traded_market) : '—'} icon='globe' />
                <SummaryCard label={localize('Most Traded Contract')} value={overallStats.most_traded_contract ? typeLabel(overallStats.most_traded_contract) : '—'} icon='file-text' />
                <SummaryCard label={localize('Winning Streak')} value={overallStats.win_streak > 0 ? `${overallStats.win_streak}` : '0'} icon='flame' accent />
                <SummaryCard label={localize('Losing Streak')} value={overallStats.loss_streak > 0 ? `${overallStats.loss_streak}` : '0'} icon='snowflake' />
            </div>
        </div>
    );
});

const SummaryCard = ({ label, value, icon, accent, mono, highlight }: {
    label: string;
    value: string;
    icon: string;
    accent?: boolean;
    mono?: boolean;
    highlight?: boolean;
}) => (
    <div className={classNames('summary-card', { 'summary-card--accent': accent, 'summary-card--highlight': highlight })}>
        <div className='summary-card__header'>
            <span className='summary-card__label'>{label}</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className='summary-card__icon'>
                {icon === 'wallet' && <><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 12v5a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 1 0 4"></path></>}
                {icon === 'flag' && <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></>}
                {icon === 'user' && <><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></>}
                {icon === 'shield' && <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></>}
                {icon === 'coins' && <><circle cx="8" cy="8" r="6"></circle><path d="M18.09 10.37A6 6 0 1 1 10.34 18"></path><path d="M7 6h12v12"></path></>}
                {icon === 'activity' && <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></>}
                {icon === 'trophy' && <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></>}
                {icon === 'alert-triangle' && <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></>}
                {icon === 'percent' && <><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></>}
                {icon === 'trending-up' && <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></>}
                {icon === 'trending-down' && <><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></>}
                {icon === 'dollar-sign' && <><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></>}
                {icon === 'arrow-up' && <><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></>}
                {icon === 'arrow-down' && <><line x1="12" y1="5" x2="12" y2="19"></line><polyline points="5 12 12 19 19 12"></polyline></>}
                {icon === 'globe' && <><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></>}
                {icon === 'file-text' && <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></>}
                {icon === 'flame' && <><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></>}
                {icon === 'snowflake' && <><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"></line></>}
            </svg>
        </div>
        <div className={classNames('summary-card__value', { 'mono': mono, 'text-profit': highlight, 'text-loss': highlight === false })}>{value}</div>
    </div>
);

const formatCurrency = (value: number, currency: string): string => {
    if (Math.abs(value) < 0.01) return `${currency} 0.00`;
    return `${currency} ${value.toFixed(2)}`;
};

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

export default AccountInfo;
