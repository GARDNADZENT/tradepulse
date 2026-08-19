// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo, useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import useTradePulseData from '../hooks/useTradePulseData';
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './Performance.scss';

const Performance = observer(() => {
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid ?? '—';
    const { contractPerformance, currency, loading } = useTradePulseData();
    const { balance: fetchedBalance } = useTradePulseFetch();
    const balance = client?.balance ? parseFloat(client.balance) : fetchedBalance;
    const displayCurrency = client?.currency ?? currency ?? 'USD';

    if (loading) {
        return (
            <div className='tradepulse__section'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div className='tradepulse__section-brand'>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                            {localize('Performance')}
                        </div>
                        <h3 className='tradepulse__section-title'>{localize('Option Contract Performance')}</h3>
                        <p className='tradepulse__section-subtitle'>{localize('Completed contracts only — grouped by contract type. Open positions are excluded.')}</p>
                    </div>
                    <div className='tradepulse__card-body'>
                        <p className='text-sm text-slate-500'>{localize('Loading performance data...')}</p>
                    </div>
                </div>
            </div>
        );
    }

    const totalTrades = contractPerformance.reduce((s, g) => s + g.trades, 0);
    const totalWins = contractPerformance.reduce((s, g) => s + g.wins, 0);
    const totalLosses = contractPerformance.reduce((s, g) => s + g.losses, 0);
    const netProfit = contractPerformance.reduce((s, g) => s + g.net, 0);
    const winRate = totalTrades > 0 ? (totalWins / totalTrades) * 100 : 0;

    return (
        <div className='tradepulse'>
            <div className='tradepulse__section fade-in'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div className='tradepulse__section-brand'>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                            {localize('Performance')}
                        </div>
                        <h3 className='tradepulse__section-title'>{localize('Option Contract Performance')}</h3>
                        <p className='tradepulse__section-subtitle'>{localize('Completed contracts only — grouped by contract type. Open positions are excluded.')}</p>
                    </div>

                    {contractPerformance.length === 0 ? (
                        <div className='tradepulse__card-body text-center py-10'>
                            <p className='text-sm text-slate-500'>{localize('No completed contracts yet. Trades will appear here automatically once connected.')}</p>
                        </div>
                    ) : (
                        <div className='tradepulse__table-wrapper scrollbar-thin'>
                            <table className='tradepulse__table'>
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
                                    {contractPerformance.map((g: any) => {
                                        const winPct = g.trades ? (g.wins / g.trades * 100) : 0;
                                        const avg = g.trades ? g.net / g.trades : 0;
                                        const barColor = winPct >= 70 ? 'bg-emerald-500' : winPct >= 50 ? 'bg-amber-500' : 'bg-rose-500';

                                        return (
                                            <tr key={g.type}>
                                                <td>
                                                    <div className='font-semibold text-slate-900'>{typeLabel(g.type)}</div>
                                                    <div className='tradepulse__win-bar'>
                                                        <div className={`tradepulse__win-fill ${barColor}`} style={{ width: `${Math.min(100, winPct)}%` }} />
                                                    </div>
                                                </td>
                                                <td className='text-right mono text-slate-700'>{g.trades}</td>
                                                <td className='text-right mono text-emerald-600 font-semibold'>{g.wins}</td>
                                                <td className='text-right mono text-rose-600 font-semibold'>{g.losses}</td>
                                                <td className='text-right mono font-semibold text-slate-900'>{winPct.toFixed(1)}%</td>
                                                <td className={`text-right mono font-semibold ${g.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {g.net >= 0 ? '+' : ''}{formatCurrency(g.net, displayCurrency)}
                                                </td>
                                                <td className='text-right mono text-slate-700'>{avg >= 0 ? '+' : ''}{formatCurrency(avg, displayCurrency)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

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

export default Performance;
