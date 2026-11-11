import React, { useMemo, useState } from 'react';
import './risk-calculator.scss';

const RiskCalculator: React.FC = () => {
    const [capital, setCapital] = useState<string>('100');
    const [stakePct, setStakePct] = useState<string>('4');
    const [stopLossPct, setStopLossPct] = useState<string>('25');
    const [takeProfitPct, setTakeProfitPct] = useState<string>('15');
    const [martingale, setMartingale] = useState<string>('2.0');

    const metrics = useMemo(() => {
        const cap = Math.max(0, parseFloat(capital) || 0);
        const sPct = Math.max(0.1, parseFloat(stakePct) || 0);
        const slPct = Math.max(1, parseFloat(stopLossPct) || 0);
        const tpPct = Math.max(1, parseFloat(takeProfitPct) || 0);
        const mart = Math.max(1.05, parseFloat(martingale) || 2);

        const baseStake = Math.max(0.35, (cap * sPct) / 100);
        const stopLossAmt = (cap * slPct) / 100;
        const takeProfitAmt = (cap * tpPct) / 100;

        const schedule: { step: number; stake: number; cumulative: number; withinLimit: boolean }[] = [];
        let cumulative = 0;
        let current = baseStake;
        let safeSteps = 0;

        for (let step = 1; step <= 8; step++) {
            cumulative += current;
            const withinLimit = cumulative <= stopLossAmt + 1e-6;
            if (withinLimit) safeSteps = step;
            schedule.push({
                step,
                stake: current,
                cumulative,
                withinLimit,
            });
            current *= mart;
        }

        return {
            cap,
            sPct,
            slPct,
            tpPct,
            mart,
            baseStake: cap > 0 ? baseStake : 0,
            stopLossAmt,
            takeProfitAmt,
            safeSteps,
            schedule,
        };
    }, [capital, stakePct, stopLossPct, takeProfitPct, martingale]);

    return (
        <div className='rm-risk-calc'>
            <div className='rm-risk-calc__wrap'>
                <div className='rm-risk-calc__hero'>
                    <div>
                        <span className='rm-risk-calc__eyebrow'>PRECISION POSITION SIZING</span>
                        <h1 className='rm-risk-calc__title'>
                            Calculate and manage your trading risk positions with precision
                        </h1>
                        <p className='rm-risk-calc__sub'>
                            Set your capital and preferred percentages. Your stake, stop loss, take profit, and
                            martingale recovery ladder update instantaneously.
                        </p>
                    </div>
                    <div className='rm-risk-calc__plan-badge'>
                        <div className='rm-risk-calc__plan-heading'>Your Risk Management Plan</div>
                        <ul>
                            <li>Stake Percentage: {metrics.sPct}% of capital</li>
                            <li>Martingale Multiplier: {metrics.mart.toFixed(2)}×</li>
                            <li>Take Profit: {metrics.tpPct}% of capital</li>
                            <li>Stop Loss: {metrics.slPct}% of capital ({metrics.safeSteps} safe steps)</li>
                        </ul>
                    </div>
                </div>

                <div className='rm-risk-calc__grid'>
                    <section className='rm-risk-calc__card'>
                        <h2 className='rm-risk-calc__card-title'>Plan Parameters</h2>
                        <div className='rm-risk-calc__fields'>
                            <label className='rm-risk-calc__field'>
                                <span>CAPITAL INVESTED ($)</span>
                                <input
                                    type='number'
                                    min='0'
                                    step='1'
                                    value={capital}
                                    onChange={e => setCapital(e.target.value)}
                                />
                            </label>

                            <label className='rm-risk-calc__field'>
                                <span>STAKE PERCENTAGE (%)</span>
                                <input
                                    type='number'
                                    min='0.1'
                                    max='100'
                                    step='0.5'
                                    value={stakePct}
                                    onChange={e => setStakePct(e.target.value)}
                                />
                            </label>

                            <label className='rm-risk-calc__field'>
                                <span>STOP LOSS (%)</span>
                                <input
                                    type='number'
                                    min='1'
                                    max='100'
                                    step='1'
                                    value={stopLossPct}
                                    onChange={e => setStopLossPct(e.target.value)}
                                />
                            </label>

                            <label className='rm-risk-calc__field'>
                                <span>TAKE PROFIT (%)</span>
                                <input
                                    type='number'
                                    min='1'
                                    max='500'
                                    step='1'
                                    value={takeProfitPct}
                                    onChange={e => setTakeProfitPct(e.target.value)}
                                />
                            </label>

                            <label className='rm-risk-calc__field rm-risk-calc__field--full'>
                                <span>MARTINGALE MULTIPLIER</span>
                                <input
                                    type='number'
                                    min='1.05'
                                    max='10'
                                    step='0.1'
                                    value={martingale}
                                    onChange={e => setMartingale(e.target.value)}
                                />
                            </label>
                        </div>
                    </section>

                    <section className='rm-risk-calc__card'>
                        <h2 className='rm-risk-calc__card-title'>Computed Session Targets</h2>
                        <div className='rm-risk-calc__kpis'>
                            <div className='rm-risk-calc__kpi rm-risk-calc__kpi--navy'>
                                <span>Amount to Stake ($)</span>
                                <strong>${metrics.baseStake.toFixed(2)}</strong>
                                <small>{metrics.sPct}% of ${metrics.cap.toFixed(2)} (min $0.35)</small>
                            </div>
                            <div className='rm-risk-calc__kpi rm-risk-calc__kpi--emerald'>
                                <span>Take Profit ($)</span>
                                <strong>${metrics.takeProfitAmt.toFixed(2)}</strong>
                                <small>Target balance: ${(metrics.cap + metrics.takeProfitAmt).toFixed(2)}</small>
                            </div>
                            <div className='rm-risk-calc__kpi rm-risk-calc__kpi--rose'>
                                <span>Stop Loss ($)</span>
                                <strong>${metrics.stopLossAmt.toFixed(2)}</strong>
                                <small>Floor balance: ${Math.max(0, metrics.cap - metrics.stopLossAmt).toFixed(2)}</small>
                            </div>
                        </div>

                        <h3 className='rm-risk-calc__subhead'>Martingale Recovery Ladder (8 Steps)</h3>
                        <div className='rm-risk-calc__table-wrap'>
                            <table className='rm-risk-calc__table'>
                                <thead>
                                    <tr>
                                        <th>Step</th>
                                        <th>Order Stake</th>
                                        <th>Cumulative Risk</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {metrics.schedule.map(row => (
                                        <tr key={row.step}>
                                            <td>#{row.step}</td>
                                            <td>${row.stake.toFixed(2)}</td>
                                            <td>${row.cumulative.toFixed(2)}</td>
                                            <td>
                                                <span
                                                    className={`rm-risk-calc__tag ${row.withinLimit ? 'rm-risk-calc__tag--safe' : 'rm-risk-calc__tag--over'}`}
                                                >
                                                    {row.withinLimit ? 'Within SL' : 'Exceeds SL'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default RiskCalculator;
