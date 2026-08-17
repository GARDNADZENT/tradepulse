// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo } from 'react';
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
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './Dashboard.scss';

const Dashboard = observer(({ loginid }: { loginid: string }) => {
    const store = useStore();
    const { client } = store;
    const { connectionStatus } = useApiBase();
    const { data: activeAccount } = useActiveAccount({
        allBalanceData: client?.all_accounts_balance,
        directBalance: client?.balance,
    });
    const { overallStats, todayStats, contractPerformance, currency } = useTradePulseData();
    const { balance: fetchedBalance, loading } = useTradePulseFetch();

    const balance = client?.balance ? parseFloat(client.balance) : (fetchedBalance || (activeAccount?.balance ? parseFloat(activeAccount.balance) : 0));
    const displayCurrency = client?.currency ?? currency ?? 'USD';

    const journey = useMemo(() => loadJourney(loginid) ?? getDefaultJourney(loginid), [loginid]);
    const currentDay = getCurrentJourneyDay(journey.start_date);
    const schedule = useMemo(() => buildSchedule(journey), [journey]);
    const idx = Math.min(Math.max(currentDay, 1), schedule.length) - 1;
    const baseRow = schedule[idx];
    const row = computeJourneyDay(baseRow, balance, currentDay);
    const displayRow = row || baseRow;

    const progress = Math.min(100, Math.max(0, ((currentDay - 1) / journey.cycle_length_days) * 100));
    const delta = balance - baseRow.end;

    const isConnected = connectionStatus === 'opened' || connectionStatus === 'OPENED';
    const equity = balance;

    if (loading && balance === 0) {
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

            <div className='dashboard__row'>
                <div className='dashboard__section dashboard__section--full'>
                    <div className='dashboard__section-header'>
                        <div>
                            <div className='dashboard__section-label'>{localize('Analytics')}</div>
                            <h2 className='dashboard__section-title'>{localize('Performance')}</h2>
                        </div>
                    </div>

                    <div className='dashboard__stats-grid'>
                        <StatCard label={localize('Total Trades')} value={String(overallStats.total_trades)} />
                        <StatCard label={localize('Total Wins')} value={String(overallStats.winning_trades)} accent />
                        <StatCard label={localize('Total Losses')} value={String(overallStats.losing_trades)} />
                        <StatCard label={localize('Win Rate')} value={overallStats.win_rate !== null ? `${overallStats.win_rate.toFixed(1)}%` : '—'} accent />
                        <StatCard label={localize('Net P/L')} value={formatCurrency(overallStats.total_profit, displayCurrency)} highlight={overallStats.total_profit >= 0} />
                        <StatCard label={localize('Avg Win')} value={overallStats.avg_win !== null ? formatCurrency(overallStats.avg_win, displayCurrency) : '—'} />
                        <StatCard label={localize('Avg Loss')} value={overallStats.avg_loss !== null ? formatCurrency(overallStats.avg_loss, displayCurrency) : '—'} />
                        <StatCard label={localize('Win Streak')} value={String(overallStats.win_streak)} accent />
                        <StatCard label={localize('Loss Streak')} value={String(overallStats.loss_streak)} />
                    </div>

                    <div className='dashboard__table-card'>
                        <div className='dashboard__table-wrap'>
                            <table className='dashboard__table'>
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
                                                <div className='dashboard__empty'>
                                                    <div className='dashboard__empty-text'>{localize('No completed contracts yet')}</div>
                                                    <div className='dashboard__empty-sub'>{localize('Trades will appear here automatically once connected.')}</div>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : (
                                        contractPerformance.map((g: any) => {
                                            const winPct = g.trades ? (g.wins / g.trades * 100) : 0;
                                            const avg = g.trades ? g.net / g.trades : 0;
                                            const barColor = winPct >= 70 ? 'bg-emerald-500' : winPct >= 50 ? 'bg-amber-500' : 'bg-rose-500';

                                            return (
                                                <tr key={g.type} className='dashboard__table-row'>
                                                    <td>
                                                        <div className='font-semibold'>{typeLabel(g.type)}</div>
                                                        <div className='dashboard__win-bar'>
                                                            <div className={classNames('dashboard__win-fill', barColor)} style={{ width: `${Math.min(100, winPct)}%` }} />
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
                                                        {g.net >= 0 ? '+' : ''}{formatCurrency(g.net, displayCurrency)}
                                                    </td>
                                                    <td className='text-right mono'>{avg >= 0 ? '+' : ''}{formatCurrency(avg, displayCurrency)}</td>
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

            <div className='dashboard__row'>
                <div className='dashboard__col'>
                    <div className='dashboard__link-card'>
                        <div className='dashboard__link-card-header'>
                            <span className='dashboard__link-card-label'>{localize('My Journey')}</span>
                        </div>
                        <div className='dashboard__link-card-body'>
                            <KPICard label={localize('Day')} value={`${currentDay} / ${journey.cycle_length_days}`} />
                            <KPICard label={localize('Progress')} value={`${Math.round(progress)}%`} accent />
                            <KPICard label={localize('Status')} value={displayRow.status === 'complete' ? localize('Complete') : displayRow.status === 'behind' ? localize('Behind') : displayRow.status === 'missed' ? localize('Missed') : localize('Pending')} />
                        </div>
                    </div>
                </div>

                <div className='dashboard__col'>
                    <div className='dashboard__link-card'>
                        <div className='dashboard__link-card-header'>
                            <span className='dashboard__link-card-label'>{localize('Master Schedule')}</span>
                        </div>
                        <div className='dashboard__link-card-body'>
                            <KPICard label={localize('Cycle')} value={`${schedule.length} ${localize('days')}`} />
                            <KPICard label={localize('Daily Target')} value={`${schedule[0]?.rate ?? 0}%`} accent />
                            <KPICard label={localize('Start')} value={formatCurrency(schedule[0]?.start ?? 0, displayCurrency)} />
                        </div>
                    </div>
                </div>

                <div className='dashboard__col'>
                    <div className='dashboard__link-card'>
                        <div className='dashboard__link-card-header'>
                            <span className='dashboard__link-card-label'>{localize('Performance')}</span>
                        </div>
                        <div className='dashboard__link-card-body'>
                            <KPICard label={localize('Trades')} value={String(overallStats.total_trades)} />
                            <KPICard label={localize('Win Rate')} value={overallStats.win_rate !== null ? `${overallStats.win_rate.toFixed(1)}%` : '—'} accent />
                            <KPICard label={localize('Net P/L')} value={formatCurrency(overallStats.total_profit, displayCurrency)} highlight={overallStats.total_profit >= 0} />
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

export default Dashboard;
