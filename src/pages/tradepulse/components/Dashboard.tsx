// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo, useState, useEffect } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useApiBase } from '@/hooks/useApiBase';
import useActiveAccount from '@/hooks/api/account/useActiveAccount';
import { localize } from '@deriv-com/translations';
import {
    loadJourney,
    getCurrentJourneyDay,
    buildSchedule,
    computeJourneyDay,
    formatCurrency,
    getDefaultJourney,
} from '../utils/calculations';
import useTradePulseData from '../hooks/useTradePulseData';
import './Dashboard.scss';

const Dashboard = observer(() => {
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid ?? '—';
    const { connectionStatus } = useApiBase();
    const { data: activeAccount } = useActiveAccount({
        allBalanceData: client?.all_accounts_balance,
        directBalance: client?.balance,
    });
    const { todayStats, currency, balance, loading } = useTradePulseData();
    const displayCurrency = client?.currency ?? currency ?? 'USD';

    const [journey, setJourney] = useState<Journey | null>(null);
    const [journeyLoaded, setJourneyLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const fetchJourney = async () => {
            const loaded = await loadJourney(loginid);
            if (!cancelled) {
                setJourney(loaded ?? getDefaultJourney(loginid));
                setJourneyLoaded(true);
            }
        };

        fetchJourney();

        return () => {
            cancelled = true;
        };
    }, [loginid]);

    const currentDay = journey ? getCurrentJourneyDay(journey.start_date) : 1;
    const schedule = useMemo(() => journey ? buildSchedule(journey) : [], [journey]);
    const idx = Math.min(Math.max(currentDay, 1), schedule.length) - 1;
    const baseRow = schedule[idx];
    const row = journey ? computeJourneyDay(baseRow, balance, currentDay) : undefined;
    const displayRow = row || baseRow;

    const progress = journey ? Math.min(100, Math.max(0, ((currentDay - 1) / journey.cycle_length_days) * 100)) : 0;
    const delta = balance - (baseRow?.end ?? 0);

    const isConnected = connectionStatus === 'opened' || connectionStatus === 'OPENED';
    const equity = balance;

    if (!journeyLoaded || !journey || (loading && balance === 0)) {
        return (
            <div className='dashboard'>
                <div className='dashboard__page-header'>
                    <h1 className='dashboard__page-title'>{localize('Dashboard')}</h1>
                    <p className='dashboard__page-subtitle'>{localize('Overview of your trading performance and account status.')}</p>
                </div>
                <p className='dashboard__loading'>{localize('Loading dashboard...')}</p>
            </div>
        );
    }

    return (
        <div className='dashboard'>
            <div className='dashboard__page-header'>
                <h1 className='dashboard__page-title'>{localize('Dashboard')}</h1>
                <p className='dashboard__page-subtitle'>{localize('Overview of your trading performance and account status.')}</p>
            </div>

            <div className='dashboard__row'>
                <div className='dashboard__col dashboard__col--left'>
                    <div className='dashboard__section'>
                        <div className='dashboard__section-header'>
                            <div>
                                <div className='dashboard__section-label'>{localize('Today')}</div>
                                <h2 className='dashboard__section-title'>{localize("Today's Target")}</h2>
                            </div>
                            <div className='dashboard__live-indicator'>
                                <span className='dashboard__live-dot' />
                                <span className='dashboard__live-text'>{localize('Live')}</span>
                            </div>
                        </div>

                        <div className='dashboard__grid'>
                            <KPICard label={localize('Starting Balance')} value={formatCurrency(baseRow.start, displayCurrency)} />
                            <KPICard label={localize("Today's Profit Target")} value={`+${formatCurrency(baseRow.profit, displayCurrency)}`} accent />
                            <KPICard label={localize('Required %')} value={`${baseRow.rate}%`} />
                            <KPICard label={localize('Expected Balance')} value={formatCurrency(baseRow.end, displayCurrency)} />
                            <KPICard
                                label={localize('Live Balance')}
                                value={formatCurrency(balance, displayCurrency)}
                                sub={delta >= 0 ? `+${formatCurrency(delta, displayCurrency)} vs target` : `${formatCurrency(delta, displayCurrency)} vs target`}
                                live
                                highlight={delta >= 0}
                            />
                        </div>

                        <div className='dashboard__progress-card'>
                            <div className='dashboard__progress-header'>
                                <span className='dashboard__progress-label'>{localize('Journey Completion')}</span>
                                <span className='dashboard__progress-value'>{localize('Day')} {currentDay} {localize('of')} {journey.cycle_length_days}</span>
                            </div>
                            <div className='dashboard__progress-bar'>
                                <div className='dashboard__progress-fill' style={{ width: `${progress}%` }} />
                            </div>
                            <div className='dashboard__progress-pct'>{Math.round(progress)}%</div>
                        </div>
                    </div>
                </div>

                <div className='dashboard__col dashboard__col--right'>
                    <div className='dashboard__section'>
                        <div className='dashboard__section-header'>
                            <div>
                                <div className='dashboard__section-label'>{localize('Overview')}</div>
                                <h2 className='dashboard__section-title'>{localize('Account Overview')}</h2>
                            </div>
                        </div>

                        <div className='dashboard__grid'>
                            <KPICard label={localize('Balance')} value={formatCurrency(balance, displayCurrency)} accent />
                            <KPICard label={localize('Equity')} value={formatCurrency(equity, displayCurrency)} />
                            <KPICard
                                label={localize("Today's P/L")}
                                value={formatCurrency(todayStats.total_profit, displayCurrency)}
                                highlight={todayStats.total_profit >= 0}
                            />
                            <KPICard
                                label={localize('Win Rate')}
                                value={todayStats.win_rate !== null ? `${todayStats.win_rate.toFixed(1)}%` : '—'}
                                accent
                            />
                            <KPICard
                                label={localize('Connection')}
                                value={isConnected ? localize('Connected') : localize('Disconnected')}
                                highlight={isConnected}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

const KPICard = ({ label, value, sub, accent, live, highlight }: {
    label: string;
    value: string;
    sub?: string;
    accent?: boolean;
    live?: boolean;
    highlight?: boolean;
}) => (
    <div className={classNames('kpi-card', { 'kpi-card--accent': accent, 'kpi-card--live': live, 'kpi-card--highlight': highlight })}>
        <div className='kpi-card__header'>
            <span className='kpi-card__label'>{label}</span>
            {live && <span className='kpi-card__live-dot' />}
        </div>
        <div className='kpi-card__value'>{value}</div>
        {sub && <div className={classNames('kpi-card__sub', { 'text-profit': highlight, 'text-loss': highlight === false })}>{sub}</div>}
    </div>
);

const formatCurrency = (value: number, currency: string): string => {
    if (Math.abs(value) < 0.01) return `${currency} 0.00`;
    return `${currency} ${value.toFixed(2)}`;
};

export default Dashboard;
