import React, { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { AIBotContractKind, compileAIBotToXml, loadXmlIntoBotBuilder } from '@/utils/ai-bot-xml-builder';
import '../riskmanagers-tools.scss';

const CONTRACT_OPTIONS: { value: AIBotContractKind; label: string; defaultPayoutPct: number }[] = [
    { value: 'DIGITEVEN', label: 'Digit Even', defaultPayoutPct: 95 },
    { value: 'DIGITODD', label: 'Digit Odd', defaultPayoutPct: 95 },
    { value: 'DIGITOVER', label: 'Digit Over 2', defaultPayoutPct: 40 },
    { value: 'DIGITUNDER', label: 'Digit Under 7', defaultPayoutPct: 40 },
    { value: 'DIGITDIFF', label: 'Digit Differs', defaultPayoutPct: 9.5 },
    { value: 'CALL', label: 'Rise / Fall', defaultPayoutPct: 95 },
];

const Calculator = observer(() => {
    const { client, dashboard, load_modal, run_panel } = useStore();
    const liveBalance = client?.balance ? String(Number(client.balance).toFixed(2)) : '';

    const [balance, setBalance] = useState(liveBalance || '100');
    const [stake, setStake] = useState('1');
    const [multiplier, setMultiplier] = useState('2.1');
    const [steps, setSteps] = useState('6');
    const [target, setTarget] = useState('10');
    const [stopLossPct, setStopLossPct] = useState('25');
    const [payoutPct, setPayoutPct] = useState('95');
    const [contractType, setContractType] = useState<AIBotContractKind>('DIGITEVEN');
    const [symbol, setSymbol] = useState('1HZ10V');
    const [statusMsg, setStatusMsg] = useState('');

    const rows = useMemo(() => {
        const first = Math.max(0.35, Number(stake) || 0.35);
        const factor = Math.max(1, Number(multiplier) || 1);
        const count = Math.max(1, Math.min(12, Math.round(Number(steps) || 1)));
        const rate = Math.max(1, Number(payoutPct) || 95) / 100;
        let cumulativeLoss = 0;

        return Array.from({ length: count }, (_, i) => {
            const amount = Number((first * factor ** i).toFixed(2));
            const priorLoss = cumulativeLoss;
            cumulativeLoss += amount;
            const winProfit = Number((amount * rate).toFixed(2));
            const netRecovery = Number((winProfit - priorLoss).toFixed(2));
            return {
                step: i + 1,
                amount,
                total: Number(cumulativeLoss.toFixed(2)),
                winProfit,
                netRecovery,
            };
        });
    }, [stake, multiplier, steps, payoutPct]);

    const numBalance = Math.max(0, Number(balance) || 0);
    const maxDrawdown = rows.at(-1)?.total || 0;
    const targetAmount = numBalance * (Math.max(0, Number(target) || 0) / 100);
    const stopLossAmount = numBalance * (Math.max(0, Number(stopLossPct) || 0) / 100);
    const balanceCoversLadder = numBalance >= maxDrawdown;

    const handleSyncAccountBalance = () => {
        if (client?.balance) {
            setBalance(String(Number(client.balance).toFixed(2)));
            setStatusMsg(`Synced with active ${client.currency || 'USD'} balance.`);
        } else {
            setStatusMsg('Connect your Deriv account to sync live balance.');
        }
    };

    const handleContractPreset = (nextType: AIBotContractKind) => {
        setContractType(nextType);
        const preset = CONTRACT_OPTIONS.find(c => c.value === nextType);
        if (preset) setPayoutPct(String(preset.defaultPayoutPct));
    };

    const handleBuildBotFromPlan = async (runNow = false) => {
        const barrier = contractType === 'DIGITOVER' ? 2 : contractType === 'DIGITUNDER' ? 7 : 4;
        const xml = compileAIBotToXml({
            name: `RiskManager Ladder (${symbol})`,
            symbol,
            contractType,
            barrier,
            baseStake: Math.max(0.35, Number(stake) || 1),
            martingaleMultiplier: Math.max(1, Number(multiplier) || 2),
            takeProfit: Math.max(0.5, Number(targetAmount.toFixed(2)) || 10),
            stopLoss: Math.max(1, Number(stopLossAmount.toFixed(2)) || Math.max(10, maxDrawdown)),
            virtualHookEnabled: true,
            virtualHookStartMode: 'real',
            virtualHookLosses: 2,
            virtualHookWins: 1,
        });
        await loadXmlIntoBotBuilder({
            xml,
            name: `RiskManager Ladder (${symbol})`,
            dashboard,
            load_modal,
            runNow,
            run_panel,
        });
    };

    return (
        <div className='rm-tool'>
            <div className='rm-tool__header'>
                <div>
                    <h2>Calculator</h2>
                    <span>Stake progression, recovery exposure and target planning</span>
                </div>
                <div className='rm-tool__header-actions'>
                    <button type='button' className='rm-button rm-button--secondary' onClick={handleSyncAccountBalance}>
                        Sync Account Balance {client?.balance ? `(${Number(client.balance).toFixed(2)} ${client.currency || 'USD'})` : ''}
                    </button>
                    <span className={balanceCoversLadder ? 'rm-status rm-status--live' : 'rm-status'}>
                        {balanceCoversLadder ? 'Balance Covers Full Ladder' : 'Insufficient Balance for Max Step'}
                    </span>
                </div>
            </div>

            <div className='rm-grid'>
                <section className='rm-card'>
                    <div className='rm-card__title'>Risk &amp; Progression Inputs</div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <label>
                            Account Balance ({client?.currency || 'USD'})
                            <input type='number' min='0' step='0.01' value={balance} onChange={e => setBalance(e.target.value)} />
                        </label>
                        <label>
                            Base Stake
                            <input type='number' min='0.35' step='0.01' value={stake} onChange={e => setStake(e.target.value)} />
                        </label>
                        <label>
                            Martingale Multiplier
                            <input type='number' min='1' step='0.05' value={multiplier} onChange={e => setMultiplier(e.target.value)} />
                        </label>
                        <label>
                            Recovery Steps (1–12)
                            <input type='number' min='1' max='12' value={steps} onChange={e => setSteps(e.target.value)} />
                        </label>
                        <label>
                            Target Profit %
                            <input type='number' min='0.5' step='0.5' value={target} onChange={e => setTarget(e.target.value)} />
                        </label>
                        <label>
                            Stop Loss %
                            <input type='number' min='1' step='0.5' value={stopLossPct} onChange={e => setStopLossPct(e.target.value)} />
                        </label>
                        <label>
                            Strategy Contract Preset
                            <select value={contractType} onChange={e => handleContractPreset(e.target.value as AIBotContractKind)}>
                                {CONTRACT_OPTIONS.map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label>
                            Estimated Win Payout %
                            <input type='number' min='5' max='900' step='0.5' value={payoutPct} onChange={e => setPayoutPct(e.target.value)} />
                        </label>
                    </div>

                    <label>
                        Target Bot Market
                        <select value={symbol} onChange={e => setSymbol(e.target.value)}>
                            <option value='1HZ10V'>Volatility 10 (1s) — 1HZ10V</option>
                            <option value='1HZ25V'>Volatility 25 (1s) — 1HZ25V</option>
                            <option value='1HZ50V'>Volatility 50 (1s) — 1HZ50V</option>
                            <option value='1HZ75V'>Volatility 75 (1s) — 1HZ75V</option>
                            <option value='1HZ100V'>Volatility 100 (1s) — 1HZ100V</option>
                            <option value='R_10'>Volatility 10 — R_10</option>
                            <option value='R_25'>Volatility 25 — R_25</option>
                            <option value='R_50'>Volatility 50 — R_50</option>
                            <option value='R_75'>Volatility 75 — R_75</option>
                            <option value='R_100'>Volatility 100 — R_100</option>
                        </select>
                    </label>

                    <div className='rm-metrics'>
                        <div>
                            <strong>${targetAmount.toFixed(2)}</strong>
                            <span>Target Profit Amount</span>
                        </div>
                        <div>
                            <strong>${stopLossAmount.toFixed(2)}</strong>
                            <span>Planned Stop Loss Cap</span>
                        </div>
                        <div>
                            <strong>${maxDrawdown.toFixed(2)}</strong>
                            <span>Max Cumulative Ladder Exposure</span>
                        </div>
                        <div>
                            <strong>{numBalance > 0 ? ((maxDrawdown / numBalance) * 100).toFixed(1) : '0.0'}%</strong>
                            <span>Account Capital Required</span>
                        </div>
                    </div>

                    <div className='rm-actions-bar'>
                        <button type='button' className='rm-button rm-button--primary' onClick={() => void handleBuildBotFromPlan(false)}>
                            Load Risk Plan into Bot Builder
                        </button>
                        <button type='button' className='rm-button rm-button--emerald' onClick={() => void handleBuildBotFromPlan(true)}>
                            Load &amp; Run in Bot Builder
                        </button>
                    </div>
                    {statusMsg && <div className='rm-success'>{statusMsg}</div>}
                </section>

                <section className='rm-card'>
                    <div className='rm-card__title'>
                        <span>Recovery Ladder Schedule</span>
                        <span className='rm-muted'>{rows.length} Steps · {payoutPct}% Payout</span>
                    </div>
                    <table className='rm-table'>
                        <thead>
                            <tr>
                                <th>Step</th>
                                <th>Stake</th>
                                <th>Cumulative Risk</th>
                                <th>Win Return</th>
                                <th>Net Recovery</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map(r => (
                                <tr key={r.step}>
                                    <td>#{r.step}</td>
                                    <td>${r.amount.toFixed(2)}</td>
                                    <td>${r.total.toFixed(2)}</td>
                                    <td>+${r.winProfit.toFixed(2)}</td>
                                    <td style={{ color: r.netRecovery >= 0 ? '#34d399' : '#f87171', fontWeight: 700 }}>
                                        {r.netRecovery >= 0 ? '+' : ''}${r.netRecovery.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <div className='rm-warning'>
                        A martingale ladder increases exposure after consecutive losses. Ensure your account balance
                        exceeds the cumulative exposure of Step #{rows.length} (${maxDrawdown.toFixed(2)}) or enable
                        Virtual Hook protection in Bot Builder.
                    </div>
                </section>
            </div>
        </div>
    );
});

export default Calculator;
