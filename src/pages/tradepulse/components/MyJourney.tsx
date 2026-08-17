// @ts-nocheck — TradePulse component with known type gaps
import React, { useMemo, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import {
    loadJourney,
    saveJourney,
    getCurrentJourneyDay,
    buildSchedule,
    computeJourneyDay,
    formatCurrency,
    getDefaultJourney,
} from '../utils/calculations';
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './MyJourney.scss';

const MyJourney = observer(({ loginid }: { loginid: string }) => {
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
    const progress = Math.min(100, Math.max(0, ((currentDay - 1) / journey.cycle_length_days) * 100));
    const balanceProgress = journey.initial_balance > 0
        ? ((balance - journey.initial_balance) / journey.initial_balance * 100)
        : 0;

    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        initial_balance: journey.initial_balance,
        daily_target_pct: journey.daily_target_pct,
        cycle_length_days: journey.cycle_length_days,
        start_date: journey.start_date,
    });

    const handleLock = () => {
        const locked = {
            loginid,
            initial_balance: Number(form.initial_balance) || 0,
            daily_target_pct: Number(form.daily_target_pct) || 0,
            cycle_length_days: Number(form.cycle_length_days) || 30,
            start_date: form.start_date || new Date().toISOString().slice(0, 10),
            created_at: journey.created_at,
            updated_at: new Date().toISOString(),
        };
        saveJourney(loginid, locked);
        setEditing(false);
    };

    const handleReset = () => {
        localStorage.removeItem(`tradepulse_journey_${loginid}`);
        window.location.reload();
    };

    const updateField = (field: string, value: string | number) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    if (loading && balance === 0) {
        return (
            <div className='my-journey'>
                <p className='my-journey__loading'>{localize('Loading journey data...')}</p>
            </div>
        );
    }

    const displayRow = row || baseRow;
    const delta = balance - baseRow.end;

    return (
        <div className='my-journey'>
            <div className='my-journey__header'>
                <div>
                    <div className='my-journey__label-today'>{localize('Today')}</div>
                    <h1 className='my-journey__title'>{localize('My Journey')}</h1>
                    <p className='my-journey__subtitle'>{localize('Daily target tracking with live balance sync.')}</p>
                </div>
            </div>

            <div className='my-journey__grid'>
                <KPICard
                    label={localize('Starting Balance')}
                    value={formatCurrency(baseRow.start, currency)}
                    sub={localize('Expected today')}
                />
                <KPICard
                    label={localize("Today's Profit Target")}
                    value={`+${formatCurrency(baseRow.profit, currency)}`}
                    sub={localize('Plan to secure')}
                    accent
                />
                <KPICard
                    label={localize('Required %')}
                    value={`${baseRow.rate}%`}
                    sub={localize('Daily growth rate')}
                />
                <KPICard
                    label={localize('Expected Balance')}
                    value={formatCurrency(baseRow.end, currency)}
                    sub={localize('End of day target')}
                />
                <KPICard
                    label={localize('Live Balance')}
                    value={formatCurrency(balance, currency)}
                    sub={delta >= 0 ? `+${formatCurrency(delta, currency)} vs target` : `${formatCurrency(delta, currency)} vs target`}
                    live
                    highlight={delta >= 0}
                />
                <KPICard
                    label={localize('30-Day Goal')}
                    value={formatCurrency(schedule[schedule.length - 1].end, currency)}
                    sub={localize('Cycle end target')}
                />
            </div>

            <div className='my-journey__progress'>
                <div className='my-journey__progress-header'>
                    <div>
                        <div className='my-journey__progress-label'>{localize('Cycle Progress')}</div>
                        <div className='my-journey__progress-sub'>{localize('Day')} {currentDay} {localize('of')} {journey.cycle_length_days}</div>
                    </div>
                    <div className='my-journey__progress-pct'>{Math.round(progress)}%</div>
                </div>
                <div className='my-journey__progress-bar'>
                    <div className='my-journey__progress-fill' style={{ width: `${progress}%` }} />
                </div>
            </div>

            <div className='my-journey__status'>
                <div className='my-journey__status-label'>{localize("Today's Progress")}</div>
                <div className='my-journey__status-value'>
                    {displayRow.status === 'complete' ? localize('Complete') : displayRow.status === 'behind' ? localize('Behind') : displayRow.status === 'missed' ? localize('Missed') : localize('Pending')}
                </div>
            </div>

            <div className='my-journey__actions'>
                <button className='my-journey__edit-btn' onClick={() => setEditing(true)} type='button'>
                    {localize('Edit Journey')}
                </button>
            </div>

            {editing && (
                <div className='my-journey__modal-overlay'>
                    <div className='my-journey__modal'>
                        <h3 className='my-journey__modal-title'>{localize('Lock Your Journey')}</h3>
                        <div className='my-journey__settings-grid'>
                            <label className='my-journey__field'>
                                <span className='my-journey__label'>{localize('Initial Balance')}</span>
                                <input
                                    type='number'
                                    className='my-journey__input'
                                    value={form.initial_balance}
                                    onChange={e => updateField('initial_balance', parseFloat(e.target.value) || 0)}
                                    step='0.01'
                                />
                            </label>
                            <label className='my-journey__field'>
                                <span className='my-journey__label'>{localize('Daily Target %')}</span>
                                <input
                                    type='number'
                                    className='my-journey__input'
                                    value={form.daily_target_pct}
                                    onChange={e => updateField('daily_target_pct', parseFloat(e.target.value) || 0)}
                                    step='0.01'
                                />
                            </label>
                            <label className='my-journey__field'>
                                <span className='my-journey__label'>{localize('Cycle Length (Days)')}</span>
                                <input
                                    type='number'
                                    className='my-journey__input'
                                    value={form.cycle_length_days}
                                    onChange={e => updateField('cycle_length_days', parseInt(e.target.value) || 30)}
                                    min='1'
                                />
                            </label>
                            <label className='my-journey__field'>
                                <span className='my-journey__label'>{localize('Start Date')}</span>
                                <input
                                    type='date'
                                    className='my-journey__input'
                                    value={form.start_date}
                                    onChange={e => updateField('start_date', e.target.value)}
                                />
                            </label>
                        </div>
                        <div className='my-journey__modal-actions'>
                            <button className='my-journey__cancel-btn' onClick={() => setEditing(false)} type='button'>
                                {localize('Cancel')}
                            </button>
                            <button className='my-journey__save-btn' onClick={handleLock} type='button'>
                                {localize('Lock Journey')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

const KPICard = ({ label, value, sub, accent, live, highlight }: {
    label: string;
    value: string;
    sub: string;
    accent?: boolean;
    live?: boolean;
    highlight?: boolean;
}) => (
    <div className={classNames('kpi-card', {
        'kpi-card--accent': accent,
        'kpi-card--live': live,
        'kpi-card--highlight': highlight,
    })}>
        <div className='kpi-card__header'>
            <span className='kpi-card__label'>{label}</span>
            {live && <span className='kpi-card__live-dot' />}
        </div>
        <div className='kpi-card__value'>{value}</div>
        <div className={classNames('kpi-card__sub', { 'text-profit': highlight, 'text-loss': highlight === false })}>{sub}</div>
    </div>
);

export default MyJourney;
