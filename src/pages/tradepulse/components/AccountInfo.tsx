// @ts-nocheck — TradePulse component with known type gaps
import React from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useTradePulse } from '../TradePulseContext';
import { localize } from '@deriv-com/translations';
import useTradePulseData from '../hooks/useTradePulseData';
import { formatCurrency } from '../utils/calculations';
import './AccountInfo.scss';

const AccountInfo = observer(() => {
    const store = useStore();
    const { client } = store;
    const { journey } = useTradePulse();
    const {
        loginid: dataLoginid,
        balance,
        currency: dataCurrency,
        isVirtual: dataVirtual,
        overallStats,
        loading,
    } = useTradePulseData();

    const loginid = client?.loginid || dataLoginid || '—';
    const curr = client?.currency || dataCurrency || 'USD';
    const isVirtual = client?.is_virtual ?? dataVirtual ?? false;

    const totalTrades = overallStats?.total_trades || 0;
    const wins = overallStats?.winning_trades || 0;
    const losses = overallStats?.losing_trades || 0;
    const winRate = overallStats?.win_rate || 0;
    const netProfit = overallStats?.total_profit || 0;
    const avgProfit = overallStats?.avg_win || 0;
    const avgLoss = overallStats?.avg_loss || 0;
    const largestWin = overallStats?.largest_win || 0;
    const largestLoss = overallStats?.largest_loss || 0;
    const bestDay = overallStats?.best_day;
    const worstDay = overallStats?.worst_day;
    const mostTradedContract = overallStats?.most_traded_contract || '—';
    const winStreak = overallStats?.win_streak || 0;
    const lossStreak = overallStats?.loss_streak || 0;

    const journeyInitialBalance = Number(journey?.initial_balance || 0);
    const roi = journeyInitialBalance > 0 ? (netProfit / journeyInitialBalance) * 100 : 0;

    const jurisdiction = (
        client?.landing_company_shortcode || (isVirtual ? 'virtual' : 'svg')
    ).toUpperCase();

    if (loading && balance === 0) {
        return (
            <div className='tradepulse__page fade-in'>
                <div className='tradepulse__kpi-grid tradepulse__kpi-grid--four'>
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className='tradepulse__kpi-card'>
                            <div className='tradepulse__skeleton tradepulse__skeleton-text tradepulse__skeleton-text--short' />
                            <div className='tradepulse__skeleton tradepulse__skeleton-title' />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className='tradepulse__page fade-in'>
            {/* 8-Card Executive Account Summary Grid */}
            <section className='tradepulse__kpi-grid tradepulse__kpi-grid--four'>
                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Live Balance')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--indigo'>
                            $
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value'>{formatCurrency(balance, curr)}</div>
                    <div className='tradepulse__kpi-sub'>
                        {!isVirtual ? 'Real Trading Account' : 'Demo Practice Account'}
                    </div>
                </div>

                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Net Profit')}</span>
                        <span
                            className={`tradepulse__kpi-badge-icon ${
                                netProfit >= 0
                                    ? 'tradepulse__kpi-badge-icon--emerald'
                                    : 'tradepulse__kpi-badge-icon--rose'
                            }`}
                        >
                            <svg
                                width='17'
                                height='17'
                                viewBox='0 0 24 24'
                                fill='none'
                                stroke='currentColor'
                                strokeWidth='2.2'
                            >
                                <polyline points='23 6 13.5 15.5 8.5 10.5 1 18' />
                            </svg>
                        </span>
                    </div>
                    <div
                        className={`tradepulse__kpi-value ${
                            netProfit >= 0 ? 'tradepulse__text-success' : 'tradepulse__text-danger'
                        }`}
                    >
                        {netProfit >= 0 ? '+' : ''}
                        {formatCurrency(netProfit, curr)}
                    </div>
                    <div className='tradepulse__kpi-sub'>
                        {journeyInitialBalance > 0
                            ? `ROI vs Journey: ${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`
                            : 'Realized closed P/L'}
                    </div>
                </div>

                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Total Trades')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--slate'>
                            #
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value'>{totalTrades}</div>
                    <div className='tradepulse__kpi-sub'>
                        {wins}W • {losses}L
                    </div>
                </div>

                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Win Rate')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--emerald'>
                            %
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value'>{winRate.toFixed(1)}%</div>
                    <div className='tradepulse__kpi-sub'> Top type: {mostTradedContract}</div>
                </div>

                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Largest Win')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--emerald'>
                            ↑
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value tradepulse__text-success'>
                        +{formatCurrency(Math.max(0, largestWin), curr)}
                    </div>
                    <div className='tradepulse__kpi-sub'>
                        Avg Win: +{formatCurrency(Math.max(0, avgProfit), curr)}
                    </div>
                </div>

                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Largest Loss')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--rose'>
                            ↓
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value tradepulse__text-danger'>
                        {formatCurrency(Math.min(0, largestLoss), curr)}
                    </div>
                    <div className='tradepulse__kpi-sub'>
                        Avg Loss: {formatCurrency(Math.min(0, avgLoss), curr)}
                    </div>
                </div>

                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Best Day')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--emerald'>
                            ★
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value tradepulse__text-success'>
                        {bestDay ? `+${formatCurrency(bestDay.profit, curr)}` : '—'}
                    </div>
                    <div className='tradepulse__kpi-sub'>
                        {bestDay ? bestDay.date : 'No winning day recorded'}
                    </div>
                </div>

                <div className='tradepulse__kpi-card'>
                    <div className='tradepulse__kpi-header'>
                        <span className='tradepulse__kpi-label'>{localize('Streaks')}</span>
                        <span className='tradepulse__kpi-badge-icon tradepulse__kpi-badge-icon--amber'>
                            ⚡
                        </span>
                    </div>
                    <div className='tradepulse__kpi-value'>
                        {winStreak}W / {lossStreak}L
                    </div>
                    <div className='tradepulse__kpi-sub'>
                        {worstDay
                            ? `Worst day: ${formatCurrency(worstDay.profit, curr)}`
                            : 'Max win / loss streaks'}
                    </div>
                </div>
            </section>

            {/* Connected Deriv Account Details Card */}
            <section className='tradepulse__card'>
                <div className='tradepulse__card-header'>
                    <div>
                        <h2 className='tradepulse__section-title'>
                            {localize('Account Details')}
                        </h2>
                        <p className='tradepulse__section-subtitle'>
                            {localize('Connected Deriv account information.')}
                        </p>
                    </div>
                    {loginid !== '—' && (
                        <span
                            className={`tradepulse__chip ${
                                !isVirtual
                                    ? 'tradepulse__chip--ontrack'
                                    : 'tradepulse__chip--today'
                            }`}
                        >
                            {!isVirtual ? localize('Real Account') : localize('Demo Account')}
                        </span>
                    )}
                </div>

                <div className='tradepulse__card-body'>
                    <div className='tradepulse__account-grid'>
                        <div className='tradepulse__account-block'>
                            <div className='tradepulse__account-block-title'>
                                {localize('Account Info')}
                            </div>
                            <div className='tradepulse__account-row'>
                                <span className='tradepulse__account-label'>
                                    {localize('Login ID')}
                                </span>
                                <span className='tradepulse__account-value mono'>{loginid}</span>
                            </div>
                            <div className='tradepulse__account-row'>
                                <span className='tradepulse__account-label'>
                                    {localize('Account Type')}
                                </span>
                                <span className='tradepulse__account-value'>
                                    {!isVirtual ? localize('Real') : localize('Demo')}
                                </span>
                            </div>
                            <div className='tradepulse__account-row'>
                                <span className='tradepulse__account-label'>
                                    {localize('Currency')}
                                </span>
                                <span className='tradepulse__account-value mono'>{curr}</span>
                            </div>
                            <div className='tradepulse__account-row'>
                                <span className='tradepulse__account-label'>
                                    {localize('Jurisdiction')}
                                </span>
                                <span className='tradepulse__account-value mono'>
                                    {jurisdiction}
                                </span>
                            </div>
                        </div>

                        <div className='tradepulse__account-block'>
                            <div className='tradepulse__account-block-title'>
                                {localize('Journey & Session')}
                            </div>
                            <div className='tradepulse__account-row'>
                                <span className='tradepulse__account-label'>
                                    {localize('Current Balance')}
                                </span>
                                <span className='tradepulse__account-value mono'>
                                    {formatCurrency(balance, curr)}
                                </span>
                            </div>
                            <div className='tradepulse__account-row'>
                                <span className='tradepulse__account-label'>
                                    {localize('Journey Initial Balance')}
                                </span>
                                <span className='tradepulse__account-value mono'>
                                    {journeyInitialBalance > 0
                                        ? formatCurrency(journeyInitialBalance, curr)
                                        : '—'}
                                </span>
                            </div>
                            <div className='tradepulse__account-row'>
                                <span className='tradepulse__account-label'>
                                    {localize('Compounding Plan')}
                                </span>
                                <span className='tradepulse__account-value'>
                                    {journey
                                        ? `${journey.cycle_length_days} Days @ +${journey.daily_target_pct}%/day`
                                        : localize('Not Locked')}
                                </span>
                            </div>
                            <div className='tradepulse__account-row'>
                                <span className='tradepulse__account-label'>
                                    {localize('Session Sync')}
                                </span>
                                <span className='tradepulse__account-value tradepulse__text-success'>
                                    {loginid !== '—' ? localize('Live Connected') : localize('Waiting')}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
});

export default AccountInfo;
