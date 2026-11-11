// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import useTradePulseData from '../hooks/useTradePulseData';
import { formatCurrency } from '../utils/calculations';
import './Performance.scss';

const TYPE_LABELS: Record<string, string> = {
    CALL: 'Rise',
    PUT: 'Fall',
    CALLE: 'Rise Equal',
    PUTE: 'Fall Equal',
    DIGITOVER: 'Digit Over',
    DIGITUNDER: 'Digit Under',
    DIGITEVEN: 'Digit Even',
    DIGITODD: 'Digit Odd',
    DIGITMATCH: 'Digit Match',
    DIGITDIFF: 'Digit Differs',
    ONETOUCH: 'Touch',
    NOTOUCH: 'No Touch',
    EXPIRYRANGE: 'Ends Between',
    EXPIRYMISS: 'Ends Outside',
    RANGE: 'Stays Between',
    UPORDOWN: 'Goes Outside',
    MULTUP: 'Multiplier Up',
    MULTDOWN: 'Multiplier Down',
    ACCU: 'Accumulator',
};

const Performance = observer(() => {
    const store = useStore();
    const { client } = store;
    const {
        contractPerformance,
        rawContracts,
        currency,
        loading,
        overallStats,
        dailyPnL,
    } = useTradePulseData();

    const displayCurrency = client?.currency ?? currency ?? 'USD';

    const netProfit = overallStats?.total_profit || 0;
    const winRate = overallStats?.win_rate || 0;
    const totalTrades = overallStats?.total_trades || 0;
    const winCount = overallStats?.winning_trades || 0;
    const lossCount = overallStats?.losing_trades || 0;

    const winningDaysList = dailyPnL.filter(d => d.profit > 0);
    const losingDaysList = dailyPnL.filter(d => d.profit < 0);
    const winningDays = winningDaysList.length;
    const losingDays = losingDaysList.length;

    const bestDayVal =
        winningDaysList.length > 0 ? Math.max(...winningDaysList.map(d => d.profit)) : 0;
    const worstDayVal =
        losingDaysList.length > 0 ? Math.min(...losingDaysList.map(d => d.profit)) : 0;

    const chartData = dailyPnL.slice(-30);
    const maxAbs = Math.max(...chartData.map(d => Math.abs(d.profit)), 1);

    // Use today's contract breakdown if present, otherwise aggregate across all closed contracts so historical users always see their breakdown
    const displayContracts = useMemo(() => {
        if (contractPerformance && contractPerformance.length > 0) {
            return contractPerformance;
        }
        if (!rawContracts || rawContracts.length === 0) return [];
        const groups: Record<string, any> = {};
        rawContracts.forEach((c: any) => {
            const type = c.contractType || 'Unknown';
            if (!groups[type]) {
                groups[type] = {
                    type,
                    trades: 0,
                    wins: 0,
                    losses: 0,
                    net: 0,
                };
            }
            groups[type].trades++;
            const p = Number(c.profit || 0);
            if (p > 0) groups[type].wins++;
            else if (p < 0) groups[type].losses++;
            groups[type].net += p;
        });
        return Object.values(groups).sort((a: any, b: any) => b.trades - a.trades);
    }, [contractPerformance, rawContracts]);

    if (loading && displayContracts.length === 0 && dailyPnL.length === 0) {
        return (
            <div className='tradepulse__page fade-in'>
                <div className='tradepulse__kpi-grid tradepulse__kpi-grid--four'>
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className='tradepulse__kpi-card'>
                            <div className='tradepulse__skeleton tradepulse__skeleton-text tradepulse__skeleton-text--short' />
                            <div className='tradepulse__skeleton tradepulse__skeleton-title' />
                        </div>
                    ))}
                </div>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-body'>
                        <div className='tradepulse__skeleton tradepulse__skeleton-card' />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className='tradepulse__page fade-in'>
            {/* 4 Icon-Badged Executive KPI Cards */}
            <section className='tradepulse__kpi-grid tradepulse__kpi-grid--four'>
                {/* 1. Net P/L */}
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Net P/L')}</span>
                        <span
                            className={`tradepulse__kpi-badge-icon ${
                                netProfit >= 0
                                    ? 'tradepulse__kpi-badge-icon--emerald'
                                    : 'tradepulse__kpi-badge-icon--rose'
                            }`}
                        >
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2.2'
                            >
                                <polyline points='23 6 13.5 15.5 8.5 10.5 1 18' />
                                <polyline points='17 6 23 6 23 12' />
                            </svg>
                        </span>
                    </div>
                    <div
                        className={`tradepulse__kpi-value ${
                            netProfit >= 0 ? 'tradepulse__text-success' : 'tradepulse__text-danger'
                        }`}
                    >
                        {netProfit >= 0 ? '+' : ''}
                        {formatCurrency(netProfit, displayCurrency)}
                    </div>
                    <div className='tradepulse__kpi-sub'>
                        {totalTrades} closed {totalTrades === 1 ? 'contract' : 'contracts'}
                    </div>
                </div>

                {/* 2. Win Rate */}
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Win Rate')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--indigo'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2.2'
                            >
                                <circle cx='12' cy='12' r='10' />
                                <path d='M9 12l2 2 4-4' />
                            </svg>
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value'>{winRate.toFixed(1)}%</div>
                    <div className='tp-perf-winbar'>
                        <div
                            className='tp-perf-winbar__fill'
                            style={{ width: `${Math.min(100, winRate)}%` }}
                        />
                    </div>
                    <div className='tradepulse__kpi-sub'>
                        {winCount}W / {lossCount}L
                    </div>
                </div>

                {/* 3. Winning Days */}
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Winning Days')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--emerald'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2.4'
                            >
                                <polyline points='20 6 9 17 4 12' />
                            </svg>
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value'>{winningDays}</div>
                    <div className='tradepulse__kpi-sub tradepulse__kpi-sub--profit'>
                        {bestDayVal > 0
                            ? `Best: +${formatCurrency(bestDayVal, displayCurrency)}`
                            : 'No winning days yet'}
                    </div>
                </div>

                {/* 4. Losing Days */}
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Losing Days')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--rose'>
                            <svg
                                width='18'
                                height='18'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2.4'
                            >
                                <line x1='18' y1='6' x2='6' y2='18' />
                                <line x1='6' y1='6' x2='18' y2='18' />
                            </svg>
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value'>{losingDays}</div>
                    <div className='tradepulse__kpi-sub tradepulse__kpi-sub--loss'>
                        {worstDayVal < 0
                            ? `Worst: ${formatCurrency(worstDayVal, displayCurrency)}`
                            : 'Zero loss days'}
                    </div>
                </div>
            </section>

            {/* 30-Day Daily P/L Bar Chart Card */}
            <section className='tradepulse__card'>
                <div className='tradepulse__card-header'>
                    <div>
                        <h2 className='tradepulse__section-title'>
                            {localize('30-Day Daily P/L')}
                        </h2>
                        <p className='tradepulse__section-subtitle'>
                            {localize(
                                'Net realized profit and loss by trading day from your Deriv account'
                            )}
                        </p>
                    </div>
                    <div className='tp-chart-legend'>
                        <span className='tp-chart-legend__item'>
                            <span className='tp-chart-legend__dot tp-chart-legend__dot--profit' />
                            {localize('Profit Day')}
                        </span>
                        <span className='tp-chart-legend__item'>
                            <span className='tp-chart-legend__dot tp-chart-legend__dot--loss' />
                            {localize('Loss Day')}
                        </span>
                    </div>
                </div>

                <div className='tradepulse__card-body'>
                    {chartData.length === 0 ? (
                        <div className='tp-perf-empty'>
                            {localize(
                                'No performance data available yet. Closed trades will populate your daily P/L chart automatically.'
                            )}
                        </div>
                    ) : (
                        <div className='tp-bar-chart'>
                            <div className='tp-bar-chart__zero' />
                            <div className='tp-bar-chart__cols'>
                                {chartData.map(d => {
                                    const ratio = Math.max(0.08, Math.abs(d.profit) / maxAbs);
                                    const heightPct = Math.round(ratio * 46);
                                    const isPos = d.profit >= 0;
                                    const shortDate = d.date ? d.date.slice(5) : '';

                                    return (
                                        <div
                                            key={d.date}
                                            className='tp-bar-chart__col'
                                            title={`${d.date}: ${isPos ? '+' : ''}${formatCurrency(
                                                d.profit,
                                                displayCurrency
                                            )} (${d.trades} trades)`}
                                        >
                                            <div className='tp-bar-chart__track'>
                                                <div
                                                    className={`tp-bar-chart__bar ${
                                                        isPos
                                                            ? 'tp-bar-chart__bar--pos'
                                                            : 'tp-bar-chart__bar--neg'
                                                    }`}
                                                    style={
                                                        isPos
                                                            ? {
                                                                  bottom: '50%',
                                                                  height: `${heightPct}%`,
                                                              }
                                                            : {
                                                                  top: '50%',
                                                                  height: `${heightPct}%`,
                                                              }
                                                    }
                                                />
                                            </div>
                                            <span className='tp-bar-chart__label mono'>
                                                {shortDate}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </section>

            {/* Option Contract Performance Table Card */}
            <section className='tradepulse__card'>
                <div className='tradepulse__card-header'>
                    <div>
                        <h2 className='tradepulse__section-title'>
                            {localize('Option Contract Performance')}
                        </h2>
                        <p className='tradepulse__section-subtitle'>
                            {localize(
                                'Completed contracts grouped by contract type. Open positions are excluded.'
                            )}
                        </p>
                    </div>
                </div>

                {displayContracts.length === 0 ? (
                    <div className='tradepulse__card-body'>
                        <div className='tp-perf-empty'>
                            {localize(
                                'No completed option contracts recorded yet. Closed trades will appear here automatically.'
                            )}
                        </div>
                    </div>
                ) : (
                    <div className='tradepulse__table-wrapper'>
                        <table className='tradepulse__table'>
                            <thead>
                                <tr>
                                    <th>{localize('Contract Type')}</th>
                                    <th className='tradepulse__table-right'>
                                        {localize('Trades')}
                                    </th>
                                    <th className='tradepulse__table-center'>W / L</th>
                                    <th>{localize('Win Rate')}</th>
                                    <th className='tradepulse__table-right'>
                                        {localize('Net P/L')}
                                    </th>
                                    <th className='tradepulse__table-right'>
                                        {localize('Avg Profit')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayContracts.map((row: any) => {
                                    const code = row.type || 'UNKNOWN';
                                    const friendly = TYPE_LABELS[code] || code;
                                    const rowTrades = Number(row.trades || 0);
                                    const rowWins = Number(row.wins || 0);
                                    const rowLosses = Number(row.losses || 0);
                                    const rowNet = Number(row.net || 0);
                                    const rowAvg = rowTrades > 0 ? rowNet / rowTrades : 0;
                                    const rowWinRate =
                                        rowTrades > 0 ? (rowWins / rowTrades) * 100 : 0;

                                    const fillClass =
                                        rowWinRate >= 55
                                            ? 'tradepulse__win-fill--high'
                                            : rowWinRate >= 45
                                            ? 'tradepulse__win-fill--mid'
                                            : 'tradepulse__win-fill--low';

                                    return (
                                        <tr key={code}>
                                            <td>
                                                <div className='tp-contract-cell'>
                                                    <span className='tp-contract-badge mono'>
                                                        {code}
                                                    </span>
                                                    <span className='tradepulse__table-name'>
                                                        {friendly}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className='tradepulse__table-right tradepulse__table-mono tradepulse__table-bold'>
                                                {rowTrades}
                                            </td>
                                            <td className='tradepulse__table-center tradepulse__table-mono'>
                                                <span className='tradepulse__text-success tradepulse__table-bold'>
                                                    {rowWins}W
                                                </span>
                                                {' / '}
                                                <span className='tradepulse__text-danger tradepulse__table-bold'>
                                                    {rowLosses}L
                                                </span>
                                            </td>
                                            <td>
                                                <div className='tp-win-cell'>
                                                    <div className='tradepulse__win-bar'>
                                                        <div
                                                            className={`tradepulse__win-fill ${fillClass}`}
                                                            style={{
                                                                width: `${Math.min(
                                                                    100,
                                                                    rowWinRate
                                                                )}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <span className='tradepulse__table-mono tradepulse__table-bold'>
                                                        {rowWinRate.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td
                                                className={`tradepulse__table-right tradepulse__table-mono tradepulse__table-bold ${
                                                    rowNet >= 0
                                                        ? 'tradepulse__text-success'
                                                        : 'tradepulse__text-danger'
                                                }`}
                                            >
                                                {rowNet >= 0 ? '+' : ''}
                                                {formatCurrency(rowNet, displayCurrency)}
                                            </td>
                                            <td
                                                className={`tradepulse__table-right tradepulse__table-mono ${
                                                    rowAvg >= 0
                                                        ? 'tradepulse__text-success'
                                                        : 'tradepulse__text-danger'
                                                }`}
                                            >
                                                {rowAvg >= 0 ? '+' : ''}
                                                {formatCurrency(rowAvg, displayCurrency)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
});

export default Performance;
