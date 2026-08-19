// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useApiBase } from '@/hooks/useApiBase';
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
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './MyJourney.scss';

const MyJourney = observer(() => {
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid ?? '—';
    const { connectionStatus } = useApiBase();
    const { balance: fetchedBalance, loading } = useTradePulseFetch();
    const balance = client?.balance ? parseFloat(client.balance) : fetchedBalance;
    const currency = client?.currency ?? 'USD';

    const [journey, setJourney] = useState<any>(null);
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
        return () => { cancelled = true; };
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

    if (!journeyLoaded || !journey || (loading && balance === 0)) {
        return (
            <div className='tradepulse__section'>
                <div className='tradepulse__section-header'>
                    <div>
                        <div className='tradepulse__section-brand'>{localize('Today')}</div>
                        <h2 className='tradepulse__section-title'>{localize("Today's Target")}</h2>
                    </div>
                    <div className='tradepulse__live'>
                        <span className='tradepulse__live-dot'></span>
                        <span>{localize('Waiting for connection')}</span>
                    </div>
                </div>
                <p className='text-sm text-slate-500'>{localize('Loading journey data...')}</p>
            </div>
        );
    }

    return (
        <div className='tradepulse'>
            {/* Today's Target */}
            <div className='tradepulse__section fade-in'>
                <div className='tradepulse__section-header'>
                    <div>
                        <div className='tradepulse__section-brand'>{localize('Today')}</div>
                        <h2 className='tradepulse__section-title'>{localize("Today's Target")}</h2>
                    </div>
                    <div className='tradepulse__live'>
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
                        value={formatCurrency(balance, currency)}
                        icon='activity'
                        live
                        highlight={delta >= 0}
                        sub={delta >= 0 ? `+${formatCurrency(delta, currency)} vs target` : `${formatCurrency(delta, currency)} vs target`}
                    />
                    <KPICard label={localize('30-Day Goal')} value={formatCurrency(schedule[schedule.length - 1]?.end ?? 0, currency)} icon='flag' />
                </div>

                <div className='tradepulse__progress'>
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
            </div>

            {/* Account Summary */}
            <div className='tradepulse__section fade-in'>
                <div className='tradepulse__section-header'>
                    <div>
                        <div className='tradepulse__section-brand'>{localize('Overview')}</div>
                        <h2 className='tradepulse__section-title'>{localize('Account Summary')}</h2>
                    </div>
                </div>
                <div className='tradepulse__status-grid'>
                    <StatusCard label={localize('Starting Balance')} value={formatCurrency(journey.initial_balance, currency)} icon='wallet' />
                    <StatusCard label={localize('Target Balance')} value={formatCurrency(schedule[schedule.length - 1]?.end ?? 0, currency)} icon='flag' accent />
                    <StatusCard label={localize('Current Balance')} value={formatCurrency(balance, currency)} icon='activity' live highlight={delta >= 0} />
                    <StatusCard label={localize('Current Day')} value={`${currentDay} / ${journey.cycle_length_days}`} icon='calendar' />
                    <StatusCard label={localize('Total Days')} value={String(journey.cycle_length_days)} icon='hash' />
                    <StatusCard label={localize('Journey Progress')} value={`${Math.round(progress)}%`} icon='trending-up' accent />
                    <StatusCard
                        label={localize('Status')}
                        value={displayRow.status === 'complete' ? localize('On Track') : displayRow.status === 'behind' ? localize('Below Target') : displayRow.status === 'missed' ? localize('Missed') : localize('Pending')}
                        icon='check-circle'
                    />
                </div>
            </div>
        </div>
    );
});

const KPICard = ({ label, value, sub, icon, accent, live, highlight }: {
    label: string;
    value: string;
    sub?: string;
    icon?: string;
    accent?: boolean;
    live?: boolean;
    highlight?: boolean;
}) => {
    const iconColor = accent ? 'text-brand-500' : 'text-slate-400';
    return (
        <div className='tradepulse__kpi-card'>
            <div className='tradepulse__kpi-header'>
                <span className='tradepulse__kpi-label'>{label}</span>
                {icon && (
                    <svg className={`tradepulse__kpi-icon ${live ? 'text-emerald-500' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {icon === 'wallet' && <><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></>}
                        {icon === 'target' && <><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></>}
                        {icon === 'percent' && <><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></>}
                        {icon === 'trending-up' && <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></>}
                        {icon === 'activity' && <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></>}
                        {icon === 'flag' && <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></>}
                    </svg>
                )}
            </div>
            <div className={`tradepulse__kpi-value ${live ? 'text-emerald-600' : highlight ? 'text-emerald-600' : accent ? 'text-brand-700' : 'text-slate-900'}`}>{value}</div>
            {sub && <div className='tradepulse__kpi-sub'>{sub}</div>}
        </div>
    );
};

const StatusCard = ({ label, value, icon, accent, live, highlight }: {
    label: string;
    value: string;
    icon?: string;
    accent?: boolean;
    live?: boolean;
    highlight?: boolean;
}) => {
    const iconColor = accent ? 'text-brand-500' : live ? 'text-emerald-500' : 'text-slate-400';
    return (
        <div className='tradepulse__status-card'>
            <div className='tradepulse__status-header'>
                <span className='tradepulse__status-label'>{label}</span>
                {icon && (
                    <svg className={`tradepulse__status-icon ${iconColor}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {icon === 'wallet' && <><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></>}
                        {icon === 'flag' && <><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></>}
                        {icon === 'activity' && <><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></>}
                        {icon === 'calendar' && <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></>}
                        {icon === 'hash' && <><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></>}
                        {icon === 'trending-up' && <><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></>}
                        {icon === 'check-circle' && <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></>}
                    </svg>
                )}
            </div>
            <div className={`tradepulse__status-value ${live ? 'text-emerald-600' : highlight ? 'text-emerald-600' : accent ? 'text-brand-700' : 'text-slate-900'}`}>{value}</div>
        </div>
    );
};

const formatCurrency = (value: number, currency: string): string => {
    if (Math.abs(value) < 0.01) return `${currency} 0.00`;
    return `${currency} ${value.toFixed(2)}`;
};

export default MyJourney;
