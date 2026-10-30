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
            background: '#f8fafc',
        }}
    >
        <div
            style={{
                maxWidth: '460px',
                width: '100%',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '20px',
                padding: '36px 28px',
                textAlign: 'center',
                boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -12px rgba(15, 23, 42, 0.08)',
            }}
        >
            <div
                style={{
                    width: '48px',
                    height: '48px',
                    margin: '0 auto 16px',
                    borderRadius: '14px',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    boxShadow: '0 6px 18px -6px rgba(99, 102, 241, 0.45)',
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
                    color: '#6366f1',
                    marginBottom: '6px',
                }}
            >
                TradePulse · Plan. Track. Perform.
            </div>
            <h3
                style={{
                    fontSize: '20px',
                    fontWeight: 700,
                    color: '#0f172a',
                    margin: '0 0 8px',
                }}
            >
                <Localize i18n_default_text='SpeedBots Coming Soon' />
            </h3>
            <p
                style={{
                    fontSize: '14px',
                    lineHeight: 1.6,
                    color: '#64748b',
                    margin: 0,
                }}
            >
                <Localize i18n_default_text='High-frequency tick execution strategies are currently being calibrated for TradePulse.' />
            </p>
        </div>
    </div>
);

export default HybridBots;
