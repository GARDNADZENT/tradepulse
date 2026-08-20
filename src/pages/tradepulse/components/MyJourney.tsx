// @ts-nocheck — TradePulse component with known type gaps
import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useApiBase } from '@/hooks/useApiBase';
import { useTradePulse } from '../TradePulseContext';
import { localize } from '@deriv-com/translations';
import {
    getCurrentJourneyDay,
    computeJourneyDay,
    formatCurrency,
    saveJourney,
} from '../utils/calculations';
import useTradePulseData from '../hooks/useTradePulseData';
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './MyJourney.scss';

const MyJourney = observer(() => {
    const { connectionStatus } = useApiBase();
    const { balance: fetchedBalance, loading } = useTradePulseFetch();
    const balance = fetchedBalance;
    const currency = 'USD';

    const { journey, schedule, journeyLoading, currentAccount, refreshJourney } = useTradePulse();
    const isConnected = connectionStatus === 'opened' || connectionStatus === 'OPENED';

    const [showJourneyModal, setShowJourneyModal] = useState(false);
    const [isLocking, setIsLocking] = useState(false);

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

    const handleLockJourney = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!currentAccount) {
            console.error('No account selected');
            return;
        }
        setIsLocking(true);
        const form = e.currentTarget;
        const initial_balance = Number((form.elements.namedItem('j-initial') as HTMLInputElement).value);
        const daily_target_pct = Number((form.elements.namedItem('j-rate') as HTMLInputElement).value);
        const cycle_length_days = Number((form.elements.namedItem('j-days') as HTMLInputElement).value);
        const start_date = (form.elements.namedItem('j-start') as HTMLInputElement).value;

        try {
            await saveJourney(currentAccount, {
                loginid: currentAccount,
                initial_balance,
                daily_target_pct,
                cycle_length_days,
                start_date,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            });
            await refreshJourney();
            setShowJourneyModal(false);
        } catch (err) {
            console.error('Lock journey failed:', err);
        } finally {
            setIsLocking(false);
        }
    };

    if (journeyLoading) {
        return (
            <div className='tradepulse__page'>
                <div className='tradepulse__section'>
                    <div className='tradepulse__section-header'>
                        <div>
                            <div className='tradepulse__section-brand'>{localize('Today')}</div>
                            <h2 className='tradepulse__section-title'>{localize("Today's Target")}</h2>
                            <p className='tradepulse__section-subtitle'>{localize('Track your daily progress against the plan.')}</p>
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
                </div>
            </div>
        );
    }

    if (!journey || !schedule) {
        return (
            <div className='tradepulse__page'>
                <div className='tradepulse__section'>
                    <div className='tradepulse__section-header'>
                        <div>
                            <div className='tradepulse__section-brand'>{localize('Today')}</div>
                            <h2 className='tradepulse__section-title'>{localize("Today's Target")}</h2>
                            <p className='tradepulse__section-subtitle'>{localize('Track your daily progress against the plan.')}</p>
                        </div>
                    </div>
                    <div style={{
                        textAlign: 'center',
                        padding: '60px 24px',
                        background: 'var(--tp-surface)',
                        border: '1px solid var(--tp-border)',
                        borderRadius: '20px',
                    }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '50%',
                            background: 'rgba(99, 102, 241, .1)',
                            border: '1px solid rgba(99, 102, 241, .2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0 auto 16px',
                        }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#818cf8' }}>
                                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
                                <path d="M12 6v6l4 2"></path>
                            </svg>
                        </div>
                        <h3 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--tp-text-primary)', margin: '0 0 12px' }}>{localize('No Journey Locked')}</h3>
                        <p style={{ fontSize: '1rem', color: 'var(--tp-text-secondary)', maxWidth: '440px', margin: '0 auto 28px', lineHeight: 1.7 }}>
                            {localize('Create your permanent trading plan. Set your goals, lock your journey, and track your progress automatically.')}
                        </p>
                        <button
                            onClick={() => setShowJourneyModal(true)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '12px 24px',
                                borderRadius: '12px',
                                background: '#6366f1',
                                color: '#fff',
                                border: 'none',
                                fontSize: '0.9rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
                                <path d="M12 6v6l4 2"></path>
                            </svg>
                            {localize('Start My Journey')}
                        </button>
                    </div>
                </div>

                {/* Journey Creation Modal */}
                {showJourneyModal && (
                    <div style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, .7)',
                        backdropFilter: 'blur(4px)',
                        zIndex: 50,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px',
                    }} onClick={() => setShowJourneyModal(false)}>
                        <div style={{
                            background: 'var(--tp-surface)',
                            border: '1px solid var(--tp-border)',
                            borderRadius: '20px',
                            width: '100%',
                            maxWidth: '480px',
                            overflow: 'hidden',
                        }} onClick={e => e.stopPropagation()}>
                            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(148, 163, 184, .08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--tp-accent)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>{localize('Lock Your Journey')}</div>
                                    <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--tp-text-primary)', margin: 0 }}>{localize('Start My Journey')}</h3>
                                </div>
                                <button onClick={() => setShowJourneyModal(false)} style={{ background: 'none', border: 'none', color: 'var(--tp-text-tertiary)', cursor: 'pointer', padding: '4px' }}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>
                            <form onSubmit={handleLockJourney} style={{ padding: '24px' }}>
                                <p style={{ fontSize: '0.95rem', color: 'var(--tp-text-secondary)', margin: '0 0 24px', lineHeight: 1.7 }}>
                                    {localize('Set your trading goals. Once locked, these values cannot be changed — only reset.')}
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--tp-text-secondary)', marginBottom: '8px' }}>{localize('Initial Balance (USD)')}</label>
                                        <input name='j-initial' type='number' min='1' step='0.01' defaultValue='1000' required
                                            style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--tp-border)', borderRadius: '12px', background: 'var(--tp-surface)', color: 'var(--tp-text-primary)', fontSize: '0.95rem', fontFamily: 'inherit', outline: 'none' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--tp-text-secondary)', marginBottom: '8px' }}>{localize('Daily Target (%)')}</label>
                                        <input name='j-rate' type='number' min='0.01' max='100' step='0.01' defaultValue='5' required
                                            style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--tp-border)', borderRadius: '12px', background: 'var(--tp-surface)', color: 'var(--tp-text-primary)', fontSize: '0.95rem', fontFamily: 'inherit', outline: 'none' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--tp-text-secondary)', marginBottom: '8px' }}>{localize('Cycle Length (Days)')}</label>
                                        <input name='j-days' type='number' min='1' max='365' defaultValue='30' required
                                            style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--tp-border)', borderRadius: '12px', background: 'var(--tp-surface)', color: 'var(--tp-text-primary)', fontSize: '0.95rem', fontFamily: 'inherit', outline: 'none' }} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--tp-text-secondary)', marginBottom: '8px' }}>{localize('Start Date')}</label>
                                        <input name='j-start' type='date' required
                                            style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--tp-border)', borderRadius: '12px', background: 'var(--tp-surface)', color: 'var(--tp-text-primary)', fontSize: '0.95rem', fontFamily: 'inherit', outline: 'none' }} />
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                                    <button type='button' onClick={() => setShowJourneyModal(false)} disabled={isLocking}
                                        style={{ padding: '10px 20px', borderRadius: '12px', background: 'transparent', color: '#e2e8f0', border: '1px solid rgba(148, 163, 184, .15)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                                        {localize('Cancel')}
                                    </button>
                                    <button type='submit' disabled={isLocking}
                                        style={{ padding: '10px 20px', borderRadius: '12px', background: '#6366f1', color: '#fff', border: 'none', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 1px 2px rgba(15, 23, 42, .04), 0 20px 40px -20px rgba(15, 23, 42, .2)' }}>
                                        {isLocking ? localize('Locking...') : localize('Lock Journey')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
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

                {/* Locked Journey Banner */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px 18px',
                    background: 'var(--tp-accent-soft)',
                    border: '1px solid rgba(99, 102, 241, .2)',
                    borderRadius: '12px',
                    marginBottom: '24px',
                }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--tp-accent)', flexShrink: 0 }}>
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                    </svg>
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--tp-accent)' }}>
                        {localize('Journey Locked')}
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--tp-text-secondary)', marginLeft: '4px' }}>
                        {localize('Your plan is active and linked to your account.')}
                    </span>
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