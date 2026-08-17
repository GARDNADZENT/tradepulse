// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import {
    loadJourney,
    getCurrentJourneyDay,
    buildSchedule,
    computeJourneyDay,
    formatCurrency,
    getDefaultJourney,
} from '../utils/calculations';
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './Dashboard.scss';

const Dashboard = observer(({ loginid }: { loginid: string }) => {
    const store = useStore();
    const { client } = store;
    const { balance: fetchedBalance, loading } = useTradePulseFetch();
    const balance = client?.balance ? parseFloat(client.balance) : fetchedBalance;
    const currency = client?.currency ?? 'USD';

    const journey = useMemo(() => loadJourney(loginid) ?? getDefaultJourney(loginid), [loginid]);
    const currentDay = getCurrentJourneyDay(journey.start_date);
    const schedule = useMemo(() => buildSchedule(journey), [journey]);
    const idx = Math.min(Math.max(currentDay, 1), schedule.length) - 1;
    const baseRow = schedule[idx];
    const row = computeJourneyDay(baseRow, balance, currentDay);
    const displayRow = row || baseRow;

    const progress = Math.min(100, Math.max(0, ((currentDay - 1) / journey.cycle_length_days) * 100));
    const delta = balance - baseRow.end;

    if (loading && balance === 0) {
        return (
            <div className='dashboard'>
                <p className='dashboard__loading'>{localize('Loading dashboard...')}</p>
            </div>
        );
    }

    return (
        <div className='dashboard'>
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
                    <KPICard label={localize('Expected Starting')} value={formatCurrency(baseRow.start, currency)} />
                    <KPICard label={localize("Today's Profit Target")} value={`+${formatCurrency(baseRow.profit, currency)}`} accent />
                    <KPICard label={localize("Today's Target %")} value={`${baseRow.rate}%`} />
                    <KPICard label={localize('Expected End')} value={formatCurrency(baseRow.end, currency)} />
                    <KPICard
                        label={localize('Live Balance')}
                        value={formatCurrency(balance, currency)}
                        sub={delta >= 0 ? `+${formatCurrency(delta, currency)} vs target` : `${formatCurrency(delta, currency)} vs target`}
                        live
                        highlight={delta >= 0}
                    />
                </div>
            </div>

            <div className='dashboard__section'>
                <div className='dashboard__section-header'>
                    <div>
                        <div className='dashboard__section-label'>{localize('Progress')}</div>
                        <h2 className='dashboard__section-title'>{localize("Today's Progress")}</h2>
                    </div>
                    <div className='dashboard__status-badge'>
                        {displayRow.status === 'complete' ? '✅ ' + localize('Complete') : displayRow.status === 'behind' ? '⚠ ' + localize('Behind') : displayRow.status === 'missed' ? '❄ ' + localize('Missed') : localize('Pending')}
                    </div>
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

            <div className='dashboard__section'>
                <div className='dashboard__section-header'>
                    <div>
                        <div className='dashboard__section-label'>{localize('Live')}</div>
                        <h2 className='dashboard__section-title'>{localize('Live Schedule')}</h2>
                    </div>
                </div>

                <div className='dashboard__table-card'>
                    <div className='dashboard__table-wrap'>
                        <table className='dashboard__table'>
                            <thead>
                                <tr>
                                    <th className='text-left'>{localize('Day')}</th>
                                    <th className='text-right'>{localize('Expected Start')}</th>
                                    <th className='text-right'>{localize('Expected End')}</th>
                                    <th className='text-right'>{localize('Daily Profit')}</th>
                                    <th className='text-right'>{localize('Required %')}</th>
                                    <th className='text-right'>{localize('Actual Balance')}</th>
                                    <th className='text-right'>{localize('Difference')}</th>
                                    <th className='text-center'>{localize('Status')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {schedule.slice(0, 7).map(row => {
                                    const computed = computeJourneyDay(row, balance, currentDay);
                                    if (!computed) return null;
                                    const isToday = row.day === currentDay;
                                    const status = computed.status === 'pending' ? 'pending' : computed.status === 'complete' ? 'complete' : computed.status === 'missed' ? 'behind' : computed.status;
                                    const statusLabel = status === 'complete' ? '✅ ' + localize('On Track') : status === 'behind' ? '⚠ ' + localize('Below') : status === 'missed' ? '❄ ' + localize('Missed') : localize('Pending');
                                    
                                    return (
                                        <tr key={row.day} className={classNames('dashboard__table-row', { 'dashboard__table-row--today': isToday })}>
                                            <td className='font-medium'>
                                                <div>{localize('Day')} {row.day}</div>
                                                <div className='dashboard__table-date'>{row.date}</div>
                                            </td>
                                            <td className='text-right mono'>{formatCurrency(row.start, currency)}</td>
                                            <td className='text-right mono'>{formatCurrency(row.end, currency)}</td>
                                            <td className='text-right mono font-semibold text-brand-700'>+{formatCurrency(row.profit, currency)}</td>
                                            <td className='text-right mono'>{row.rate}%</td>
                                            <td className={classNames('text-right mono font-semibold', { 'text-slate-900': computed.actual != null, 'text-slate-400': computed.actual == null })}>
                                                {computed.actual != null ? formatCurrency(computed.actual, currency) : '—'}
                                            </td>
                                            <td className={classNames('text-right mono font-semibold', {
                                                'text-emerald-600': computed.diff != null && computed.diff >= 0,
                                                'text-rose-600': computed.diff != null && computed.diff < 0,
                                                'text-slate-400': computed.diff == null,
                                            })}>
                                                {computed.diff != null ? `${computed.diff >= 0 ? '+' : ''}${formatCurrency(computed.diff, currency)}` : '—'}
                                            </td>
                                            <td className='text-center'>
                                                <span className={classNames('chip', {
                                                    'bg-slate-100 text-slate-600': status === 'pending',
                                                    'bg-emerald-50 text-emerald-700': status === 'complete',
                                                    'bg-rose-50 text-rose-700': status === 'behind',
                                                })}>
                                                    {statusLabel}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
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

export default Dashboard;
