// @ts-nocheck
import React, { useMemo } from 'react';
import { useTradePulse } from './TradePulseContext';
import { computeStats, formatCurrency } from './utils';

const Account = () => {
    const { contracts, journey, getSelected } = useTradePulse();

    const selected = getSelected();
    const currency = selected?.currency || 'USD';
    const overallStats = useMemo(() => computeStats(contracts), [contracts]);

    const startBalance = journey ? Number(journey.initial_balance) : (Number(selected?.balance || 0) - overallStats.net);
    const roi = journey && journey.initial_balance > 0 ? (overallStats.net / journey.initial_balance * 100) : 0;

    const items = [
        { label: 'Current Balance', value: formatCurrency(selected?.balance || 0, currency), icon: 'wallet', tone: 'emerald', isText: true },
        { label: 'Starting Journey Balance', value: formatCurrency(startBalance, currency), icon: 'flag', tone: 'brand', isText: true },
        { label: 'Login ID', value: selected?.loginid || '—', icon: 'user', tone: 'slate', isText: true, mono: true },
        { label: 'Account Type', value: selected?.is_virtual ? 'Demo' : 'Real', icon: selected?.is_virtual ? 'flask-conical' : 'shield-check', tone: selected?.is_virtual ? 'sky' : 'emerald', isText: true },
        { label: 'Currency', value: currency, icon: 'coins', tone: 'slate', isText: true },
        { label: 'Total Trades', value: overallStats.total, icon: 'activity', tone: 'slate' },
        { label: 'Total Wins', value: overallStats.wins, icon: 'trophy', tone: 'emerald' },
        { label: 'Total Losses', value: overallStats.losses, icon: 'alert-triangle', tone: 'rose' },
        { label: 'Overall Win Rate', value: overallStats.total ? overallStats.winRate.toFixed(2) + '%' : '—', icon: 'percent', tone: 'brand', isText: true },
        { label: 'ROI', value: formatCurrency(roi, currency), icon: 'trending-up', tone: roi >= 0 ? 'emerald' : 'rose', isText: true },
        { label: 'Net Profit', value: formatCurrency(overallStats.net, currency), icon: 'banknote', tone: overallStats.net >= 0 ? 'emerald' : 'rose', isText: true },
        { label: 'Best Trading Day', value: overallStats.bestDay ? overallStats.bestDay[0] : '—', sub: overallStats.bestDay ? formatCurrency(overallStats.bestDay[1], currency) : '', icon: 'calendar-check', tone: 'emerald', isText: true },
        { label: 'Worst Trading Day', value: overallStats.worstDay ? overallStats.worstDay[0] : '—', sub: overallStats.worstDay ? formatCurrency(overallStats.worstDay[1], currency) : '', icon: 'calendar-x', tone: 'rose', isText: true },
        { label: 'Largest Win', value: formatCurrency(overallStats.largestWin, currency), icon: 'arrow-up-right', tone: 'emerald', isText: true },
        { label: 'Largest Loss', value: formatCurrency(overallStats.largestLoss, currency), icon: 'arrow-down-right', tone: 'rose', isText: true },
        { label: 'Average Profit', value: formatCurrency(overallStats.avgProfit, currency), icon: 'plus-circle', tone: 'emerald', isText: true },
        { label: 'Average Loss', value: formatCurrency(overallStats.avgLoss, currency), icon: 'minus-circle', tone: 'rose', isText: true },
        { label: 'Most Traded Market', value: overallStats.mostTradedMarket || '—', icon: 'layers', tone: 'amber', isText: true },
        { label: 'Most Traded Contract', value: overallStats.mostTradedContract || '—', icon: 'box', tone: 'amber', isText: true },
        { label: 'Winning Streak', value: overallStats.winStreak > 0 ? '🔥 ' + overallStats.winStreak : '—', icon: 'flame', tone: 'emerald', isText: true },
        { label: 'Losing Streak', value: overallStats.lossStreak > 0 ? '❄ ' + overallStats.lossStreak : '—', icon: 'snowflake', tone: 'rose', isText: true },
    ];

    const toneMap = {
        slate: 'var(--text-less-prominent)',
        emerald: '#10b981',
        rose: '#ef4444',
        brand: 'var(--brand-primary)',
        amber: '#f59e0b',
        sky: '#38bdf8',
    };

    const accentMap = {
        slate: '',
        emerald: 'tradepulse__glass-card--accent-green',
        rose: 'tradepulse__glass-card--accent-red',
        brand: 'tradepulse__glass-card--accent-purple',
        amber: 'tradepulse__glass-card--accent-orange',
        sky: 'tradepulse__glass-card--accent-blue',
    };

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Account</div>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-prominent)', margin: '4px 0 8px 0' }}>Account — Lifetime Performance</h1>
                <p style={{ fontSize: '1rem', color: 'var(--text-less-prominent)', margin: 0 }}>Long-term analytics and account summary.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                {items.map((item, i) => (
                    <div key={i} className={`tradepulse__glass-card ${accentMap[item.tone] || ''}`}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-less-prominent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</span>
                            <Icon name={item.icon} color={toneMap[item.tone] || 'var(--text-less-prominent)'} />
                        </div>
                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-prominent)', fontFamily: item.mono ? 'JetBrains Mono, monospace' : 'inherit' }}>
                            {item.value}
                        </div>
                        {item.sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-less-prominent)', marginTop: 4 }}>{item.sub}</div>}
                    </div>
                ))}
            </div>
        </div>
    );
};

const Icon = ({ name, color }: { name: string; color: string }) => {
    const icons: any = {
        wallet: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path><path d="M3 12v5a2 2 0 0 0 2 2h16v-5"></path><path d="M18 12a2 2 0 0 1 0 4"></path></svg>,
        flag: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>,
        user: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>,
        'shield-check': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><polyline points="9 12 11 14 15 10"></polyline></svg>,
        'flask-conical': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"></path><path d="M8.5 2h7"></path></svg>,
        coins: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6"></circle><path d="M18.09 14.58A6 6 0 0 0 15 17.5"></path><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M3 21v-5h5"></path></svg>,
        activity: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>,
        trophy: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>,
        'alert-triangle': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>,
        percent: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="5" x2="5" y2="19"></line><circle cx="6.5" cy="6.5" r="2.5"></circle><circle cx="17.5" cy="17.5" r="2.5"></circle></svg>,
        'trending-up': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>,
        banknote: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path></svg>,
        'calendar-check': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><path d="m9 16 2 2 4-4"></path></svg>,
        'calendar-x': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line><line x1="9" y1="16" x2="15" y2="16"></line></svg>,
        'arrow-up-right': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 17 17 7"></polyline><polyline points="7 7 17 17"></polyline></svg>,
        'arrow-down-right': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 7 7 17"></polyline><polyline points="7 7 17 17"></polyline></svg>,
        'plus-circle': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>,
        'minus-circle': <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>,
        layers: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>,
        box: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>,
        flame: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path></svg>,
        snowflake: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line><line x1="19.07" y1="4.93" x2="4.93" y2="19.07"></line></svg>,
    };

    return <span style={{ color, display: 'inline-flex' }}>{icons[name] || null}</span>;
};

export default Account;
