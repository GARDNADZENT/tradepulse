// @ts-nocheck — TradePulse component with known type gaps
import React, { useState, useMemo } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { buildSchedule, formatCurrency, getDefaultJourney, saveJourney } from './utils/calculations';
import MyJourney from './components/MyJourney';
import MasterSchedule from './components/MasterSchedule';
import Performance from './components/Performance';
import AccountInfo from './components/AccountInfo';
import DebugOverlay from './components/DebugOverlay';
import './tradepulse.scss';

const PerformanceWrapper = () => {
    const [error, setError] = useState<string | null>(null);
    const [logs, setLogs] = useState<any[]>([]);

    const addLog = (entry: any) => {
        const timestamp = new Date().toISOString();
        const fullEntry = { timestamp, ...entry };
        setLogs(prev => [...prev.slice(-200), fullEntry]);
        console.log('[PerformanceDebug]', fullEntry);
    };

    useEffect(() => {
        addLog({ type: 'WRAPPER_MOUNT' });
        return () => addLog({ type: 'WRAPPER_UNMOUNT' });
    }, []);

    useEffect(() => {
        addLog({ type: 'ERROR_STATE_CHANGE', error });
    }, [error]);

    if (error) {
        return (
            <>
                <div className='performance'>
                    <p className='performance__error'>{localize('Failed to load performance data.')}</p>
                    <button className='master-schedule__submit-btn' onClick={() => { setError(null); setLogs([]); }} type='button'>
                        {localize('Retry')}
                    </button>
                </div>
                <DebugOverlay logs={logs} onClose={() => { setError(null); setLogs([]); }} />
            </>
        );
    }

    try {
        addLog({ type: 'RENDER_PERFORMANCE_START' });
        const result = <Performance />;
        addLog({ type: 'RENDER_PERFORMANCE_SUCCESS' });
        return result;
    } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        addLog({ type: 'RENDER_PERFORMANCE_CRASH', message: err.message, stack: err.stack });
        setError(err.message);
        return <DebugOverlay logs={logs} onClose={() => { setError(null); setLogs([]); }} />;
    }
};

type TabKey = 'journey' | 'schedule' | 'performance' | 'account';

const tabs: { key: TabKey; label: string; icon: string }[] = [
    { key: 'journey', label: 'My Journey', icon: 'compass' },
    { key: 'schedule', label: 'Master Schedule', icon: 'calendar-range' },
    { key: 'performance', label: 'Performance', icon: 'bar-chart-3' },
    { key: 'account', label: 'Account', icon: 'wallet' },
];

const TradePulse = observer(() => {
    const [activeTab, setActiveTab] = useState<TabKey>('journey');
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid ?? '';
    const isLoggedIn = client?.is_logged_in ?? false;

    const preloginSchedule = useMemo(() => {
        try {
            const raw = localStorage.getItem('tradepulse_prelogin_schedule');
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }, []);

    if (!isLoggedIn || !loginid) {
        return (
            <div className='tradepulse'>
                <div className='tradepulse__header'>
                    <div className='tradepulse__brand'>
                        <div className='tradepulse__logo'>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                        </div>
                        <div>
                            <div className='tradepulse__brand-name'>TradersPulse</div>
                            <div className='tradepulse__brand-tag'>Capital-First Analytics</div>
                        </div>
                    </div>
                </div>

                <div className='tradepulse__prelogin'>
                    <div className='tradepulse__prelogin-card'>
                        <h3 className='tradepulse__prelogin-title'>{localize('Master Schedule Planner')}</h3>
                        <p className='tradepulse__prelogin-sub'>{localize('Set your trading goal to generate your complete trading plan.')}</p>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const schedule = buildSchedule({
                                loginid: 'prelogin',
                                initial_balance: Number((e.target as any).balance.value),
                                cycle_length_days: Number((e.target as any).days.value),
                                daily_target_pct: Number((e.target as any).rate.value),
                                start_date: (e.target as any).start.value,
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                            });
                            localStorage.setItem('tradepulse_prelogin_schedule', JSON.stringify(schedule));
                            window.location.reload();
                        }} className='tradepulse__prelogin-form'>
                            <div className='tradepulse__prelogin-grid'>
                                <label className='tradepulse__field'>
                                    <span className='tradepulse__label'>{localize('Initial Balance')}</span>
                                    <div className='tradepulse__input-wrap'>
                                        <span className='tradepulse__input-prefix'>$</span>
                                        <input type='number' name='balance' className='tradepulse__input tradepulse__input--prefix' defaultValue={100} step='0.01' min='1' required />
                                    </div>
                                </label>
                                <label className='tradepulse__field'>
                                    <span className='tradepulse__label'>{localize('Trading Days')}</span>
                                    <input type='number' name='days' className='tradepulse__input' defaultValue={30} min='1' max='365' required />
                                </label>
                                <label className='tradepulse__field'>
                                    <span className='tradepulse__label'>{localize('Daily Growth Rate (%)')}</span>
                                    <input type='number' name='rate' className='tradepulse__input' defaultValue={5} min='0.01' max='100' step='0.01' required />
                                </label>
                                <label className='tradepulse__field'>
                                    <span className='tradepulse__label'>{localize('Cycle Start Date')}</span>
                                    <input type='date' name='start' className='tradepulse__input' defaultValue={new Date().toISOString().slice(0, 10)} required />
                                </label>
                            </div>
                            <button type='submit' className='tradepulse__prelogin-btn'>
                                {localize('Generate Master Schedule')}
                            </button>
                        </form>
                    </div>

                    {preloginSchedule && (
                        <div className='tradepulse__schedule-output'>
                            <div className='tradepulse__schedule-header'>
                                <h3 className='tradepulse__schedule-title'>{localize('Generated Schedule')}</h3>
                                <p className='tradepulse__schedule-meta'>
                                    {preloginSchedule.days} days · {preloginSchedule.rate}% daily · starting {formatCurrency(preloginSchedule.initial, 'USD')} · from {preloginSchedule.startDate}
                                </p>
                            </div>
                            <div className='tradepulse__table-wrapper'>
                                <table className='tradepulse__table'>
                                    <thead>
                                        <tr>
                                            <th>{localize('Day')}</th>
                                            <th className='text-right'>{localize('Expected Start')}</th>
                                            <th className='text-right'>{localize('Expected End')}</th>
                                            <th className='text-right'>{localize('Daily Profit Target')}</th>
                                            <th className='text-right'>{localize('Required %')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preloginSchedule.rows.map((row: any) => (
                                            <tr key={row.day} className='tradepulse__table-row'>
                                                <td>
                                                    <div>{localize('Day')} {row.day}</div>
                                                    <div className='tradepulse__table-date'>{row.date}</div>
                                                </td>
                                                <td className='text-right mono'>{formatCurrency(row.start, 'USD')}</td>
                                                <td className='text-right mono'>{formatCurrency(row.end, 'USD')}</td>
                                                <td className='text-right mono font-semibold text-brand-700'>+{formatCurrency(row.profit, 'USD')}</td>
                                                <td className='text-right mono'>{row.rate}%</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className='tradepulse__schedule-footer'>
                                {localize('After logging in, your actual account balance will automatically be compared with the expected balance for each trading day.')}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className='tradepulse'>
            <div className='tradepulse__header'>
                <div className='tradepulse__brand'>
                    <div className='tradepulse__logo'>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                    </div>
                    <div>
                        <div className='tradepulse__brand-name'>TradersPulse</div>
                        <div className='tradepulse__brand-tag'>Capital-First Analytics</div>
                    </div>
                </div>

                <nav className='tradepulse__nav'>
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            className={classNames('tradepulse__nav-item', {
                                'tradepulse__nav-item--active': activeTab === tab.key,
                            })}
                            onClick={() => setActiveTab(tab.key)}
                            type='button'
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className='tradepulse__nav-icon'>
                                {tab.icon === 'home' && <><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></>}
                                {tab.icon === 'compass' && <><circle cx="12" cy="12" r="10"></circle><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon></>}
                                {tab.icon === 'calendar-range' && <><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></>}
                                {tab.icon === 'bar-chart-3' && <><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></>}
                                {tab.icon === 'wallet' && <><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 12v5a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 1 0 4"></path></>}
                            </svg>
                            <span>{localize(tab.label)}</span>
                        </button>
                    ))}
                </nav>
            </div>
            <div className='tradepulse__content'>
                {activeTab === 'journey' && <MyJourney loginid={loginid} />}
                {activeTab === 'schedule' && <MasterSchedule loginid={loginid} />}
                {activeTab === 'performance' && <PerformanceWrapper />}
                {activeTab === 'account' && <AccountInfo />}
            </div>
        </div>
    );
});

export default TradePulse;
