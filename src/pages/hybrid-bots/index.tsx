import React from 'react';
import { Localize } from '@deriv-com/translations';

const HybridBots: React.FC = () => (
    <div
        style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '60vh',
            padding: '32px 20px',
            fontFamily: "'Inter', system-ui, sans-serif",
        }}
    >
        <div
            style={{
                maxWidth: '460px',
                width: '100%',
                background: 'var(--tp-surface, #ffffff)',
                border: '1px solid var(--tp-border, #e2e8f0)',
                borderRadius: '18px',
                padding: '36px 28px',
                textAlign: 'center',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 16px 40px -16px rgba(15, 23, 42, 0.1)',
            }}
        >
            <div
                style={{
                    width: '48px',
                    height: '48px',
                    margin: '0 auto 16px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 60%, #3730a3 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    boxShadow: '0 8px 20px -6px rgba(79, 70, 229, 0.45)',
                }}
            >
                <svg width='22' height='22' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.3' strokeLinecap='round' strokeLinejoin='round'>
                    <polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2' />
                </svg>
            </div>
            <div
                style={{
                    fontSize: '11.5px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    color: 'var(--tp-accent, #4f46e5)',
                    marginBottom: '6px',
                }}
            >
                TradePulse · Plan. Track. Perform.
            </div>
            <h3
                style={{
                    fontSize: '20px',
                    fontWeight: 700,
                    color: 'var(--tp-text-primary, #0f172a)',
                    margin: '0 0 8px',
                }}
            >
                <Localize i18n_default_text='SpeedBots Coming Soon' />
            </h3>
            <p
                style={{
                    fontSize: '14px',
                    lineHeight: 1.6,
                    color: 'var(--tp-text-tertiary, #64748b)',
                    margin: 0,
                }}
            >
                <Localize i18n_default_text='High-frequency tick execution strategies are currently being calibrated for TradePulse.' />
            </p>
        </div>
    </div>
);

export default HybridBots;
