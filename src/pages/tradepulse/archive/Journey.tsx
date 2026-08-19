// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useTradePulse } from './TradePulseContext';
import { buildSchedule, normalizeJourneyDays, getCurrentJourneyDay, computeJourneyDay, formatCurrency } from './utils';

const Journey = () => {
    const { journey, getSelected, loadJourney } = useTradePulse();
    const [showLockModal, setShowLockModal] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [form, setForm] = useState({
        initial_balance: 1000,
        daily_target_pct: 5,
        cycle_length_days: 30,
        start_date: new Date().toISOString().slice(0, 10),
    });

    const selected = getSelected();
    const live = selected ? selected.balance : 0;
    const currency = selected?.currency || 'USD';

    useEffect(() => {
        loadJourney();
    }, [loadJourney]);

    useEffect(() => {
        if (journey) {
            setForm({
                initial_balance: journey.initial_balance,
                daily_target_pct: journey.daily_target_pct,
                cycle_length_days: journey.cycle_length_days,
                start_date: journey.start_date,
            });
        }
    }, [journey]);

    const updateField = (field, value) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const handleLock = async () => {
        await createJourney({
            initial_balance: Number(form.initial_balance),
            daily_target_pct: Number(form.daily_target_pct),
            cycle_length_days: Number(form.cycle_length_days),
            start_date: form.start_date,
        });
        setShowLockModal(false);
        await loadJourney();
    };

    const handleReset = async () => {
        await deleteJourney();
        setShowResetModal(false);
        await loadJourney();
    };

    const schedule = journey ? {
        initial: journey.initial_balance,
        days: journey.cycle_length_days,
        rate: journey.daily_target_pct,
        startDate: journey.start_date,
        rows: normalizeJourneyDays(journey.days, journey.daily_target_pct),
    } : null;

    const currentDay = getCurrentJourneyDay(journey?.start_date);
    const progress = journey && journey.initial_balance > 0 ? ((live - journey.initial_balance) / journey.initial_balance * 100) : 0;

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Where am I going</div>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 700, color: 'var(--text-prominent)', margin: '4px 0 8px 0' }}>My Journey</h1>
                <p style={{ fontSize: '1rem', color: 'var(--text-less-prominent)', margin: 0 }}>
                    Your overall trading progression and target tracking.
                </p>
            </div>

            {!journey ? (
                <div className='tradepulse__glass-card' style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(99,102,241,.1)', border: '1px solid rgba(99,102,241,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-primary)' }}>
                            <circle cx="12" cy="12" r="10"></circle>
                            <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                        </svg>
                    </div>
                    <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-prominent)', margin: '0 0 8px 0' }}>No Journey Locked</h3>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-less-prominent)', margin: '0 0 24px 0', maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
                        Create your permanent trading plan. Set your goals, lock your journey, and track your progress automatically.
                    </p>
                    <button className='tradepulse__btn tradepulse__btn--primary' onClick={() => setShowLockModal(true)}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                        </svg>
                        Start My Journey
                    </button>
                </div>
            ) : (
                <>
                    <div className='tradepulse__kpi-grid' style={{ marginBottom: 16 }}>
                        <div className='tradepulse__kpi-card'>
                            <div className='tradepulse__kpi-label'>Starting Balance</div>
                            <div className='tradepulse__kpi-value'>{formatCurrency(journey.initial_balance, currency)}</div>
                            <div className='tradepulse__kpi-sub'>Journey baseline</div>
                        </div>
                        <div className='tradepulse__kpi-card'>
                            <div className='tradepulse__kpi-label'>Daily Target</div>
                            <div className='tradepulse__kpi-value' style={{ color: 'var(--brand-primary)' }}>+{journey.daily_target_pct}%</div>
                            <div className='tradepulse__kpi-sub'>Plan to secure</div>
                        </div>
                        <div className='tradepulse__kpi-card'>
                            <div className='tradepulse__kpi-label'>Cycle Length</div>
                            <div className='tradepulse__kpi-value'>{journey.cycle_length_days} days</div>
                            <div className='tradepulse__kpi-sub'>Trading days</div>
                        </div>
                        <div className='tradepulse__kpi-card'>
                            <div className='tradepulse__kpi-label'>Start Date</div>
                            <div className='tradepulse__kpi-value'>{journey.start_date}</div>
                            <div className='tradepulse__kpi-sub'>Locked date</div>
                        </div>
                    </div>

                    <div className='tradepulse__glass-card' style={{ marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div>
                                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-prominent)' }}>Journey Progress</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-less-prominent)' }}>Day {currentDay} of {journey.cycle_length_days}</div>
                            </div>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--brand-primary)' }}>
                                {Math.min(100, Math.round((currentDay / journey.cycle_length_days) * 100))}%
                            </div>
                        </div>
                        <div className='tradepulse__progress-bar'>
                            <div className='tradepulse__progress-fill' style={{ width: `${Math.min(100, (currentDay / journey.cycle_length_days) * 100)}%` }} />
                        </div>
                        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.85rem', color: 'var(--text-less-prominent)' }}>
                            <span>Current Balance: {formatCurrency(live, currency)}</span>
                            <span style={{ color: progress >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                                {progress >= 0 ? '+' : ''}{progress.toFixed(2)}%
                            </span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10 }}>
                        <button className='tradepulse__btn tradepulse__btn--secondary' onClick={() => setShowLockModal(true)}>Edit Journey</button>
                        <button className='tradepulse__btn tradepulse__btn--danger' onClick={() => setShowResetModal(true)}>Reset Journey</button>
                    </div>
                </>
            )}

            {showLockModal && (
                <div className='tradepulse__modal-overlay' onClick={() => setShowLockModal(false)}>
                    <div className='tradepulse__modal' onClick={e => e.stopPropagation()}>
                        <div className='tradepulse__modal-header'>
                            <div>
                                <div className='tradepulse__modal-subtitle'>Lock Your Journey</div>
                                <h3 className='tradepulse__modal-title'>Start My Journey</h3>
                            </div>
                            <button className='tradepulse__btn--ghost' onClick={() => setShowLockModal(false)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div className='tradepulse__modal-body'>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-less-prominent)', margin: '0 0 16px 0' }}>
                                Set your trading goals. Once locked, these values cannot be changed — only reset.
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
                                <div className='tradepulse__form-group'>
                                    <label className='tradepulse__form-label'>Initial Balance (USD)</label>
                                    <input type='number' className='tradepulse__form-input' value={form.initial_balance} onChange={e => updateField('initial_balance', e.target.value)} min='1' step='0.01' required />
                                </div>
                                <div className='tradepulse__form-group'>
                                    <label className='tradepulse__form-label'>Daily Target (%)</label>
                                    <input type='number' className='tradepulse__form-input' value={form.daily_target_pct} onChange={e => updateField('daily_target_pct', e.target.value)} min='0.01' max='100' step='0.01' required />
                                </div>
                                <div className='tradepulse__form-group'>
                                    <label className='tradepulse__form-label'>Cycle Length (Days)</label>
                                    <input type='number' className='tradepulse__form-input' value={form.cycle_length_days} onChange={e => updateField('cycle_length_days', e.target.value)} min='1' max='365' required />
                                </div>
                                <div className='tradepulse__form-group'>
                                    <label className='tradepulse__form-label'>Start Date</label>
                                    <input type='date' className='tradepulse__form-input' value={form.start_date} onChange={e => updateField('start_date', e.target.value)} required />
                                </div>
                            </div>
                            <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.15)', fontSize: '0.85rem', color: '#fbbf24', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                                    <line x1="12" y1="9" x2="12" y2="13"></line>
                                    <line x1="12" y1="17" x2="12.01" y2="17"></line>
                                </svg>
                                <span>This action is irreversible. Your journey parameters will be permanently locked. You can only reset the entire journey.</span>
                            </div>
                        </div>
                        <div className='tradepulse__modal-footer'>
                            <button className='tradepulse__btn tradepulse__btn--secondary' onClick={() => setShowLockModal(false)}>Cancel</button>
                            <button className='tradepulse__btn tradepulse__btn--primary' onClick={handleLock}>Lock Journey</button>
                        </div>
                    </div>
                </div>
            )}

            {showResetModal && (
                <div className='tradepulse__modal-overlay' onClick={() => setShowResetModal(false)}>
                    <div className='tradepulse__modal' onClick={e => e.stopPropagation()}>
                        <div className='tradepulse__modal-header'>
                            <div>
                                <div className='tradepulse__modal-subtitle' style={{ color: '#f87171' }}>Danger Zone</div>
                                <h3 className='tradepulse__modal-title'>Reset Journey?</h3>
                            </div>
                            <button className='tradepulse__btn--ghost' onClick={() => setShowResetModal(false)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>
                        <div className='tradepulse__modal-body'>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-less-prominent)', margin: '0 0 16px 0' }}>
                                This will permanently delete your current journey and all associated data. This action cannot be undone.
                            </p>
                        </div>
                        <div className='tradepulse__modal-footer'>
                            <button className='tradepulse__btn tradepulse__btn--secondary' onClick={() => setShowResetModal(false)}>Cancel</button>
                            <button className='tradepulse__btn tradepulse__btn--danger' onClick={handleReset}>Reset</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Journey;
