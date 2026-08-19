// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { useTradePulse } from './TradePulseContext';
import { useTradePulseApi } from './useTradePulseApi';

const LoginScreen = () => {
    const [token, setToken] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { externalTokenLogin, mockLogin } = useTradePulseApi();

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!token.trim()) return;
        setLoading(true);
        setError('');
        try {
            await externalTokenLogin(token.trim());
        } catch (err) {
            setError(err.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    const handleMock = async () => {
        setLoading(true);
        setError('');
        try {
            await mockLogin();
        } catch (err) {
            setError(err.message || 'Mock login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'var(--general-main-1)',
        }}>
            <div style={{
                width: '100%',
                maxWidth: 400,
                background: 'var(--general-main-2)',
                border: '1px solid var(--border-normal)',
                borderRadius: 16,
                padding: 32,
                boxShadow: '0 20px 40px -20px rgba(0,0,0,.3)',
            }}>
                <div style={{ textAlign: 'center', marginBottom: 24 }}>
                    <div style={{
                        width: 48, height: 48, borderRadius: 12,
                        background: 'var(--general-section-1)', border: '1px solid var(--border-normal)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 16px',
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-primary)' }}>
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                    </div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--brand-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Secure Connect</div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-prominent)', margin: 0 }}>Connect with Deriv</h2>
                </div>

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-general)', marginBottom: 6 }}>API Token</label>
                        <input
                            type='password'
                            value={token}
                            onChange={e => setToken(e.target.value)}
                            placeholder='Paste your Deriv API token'
                            style={{
                                width: '100%', padding: '12px 16px', borderRadius: 12,
                                background: 'var(--general-main-1)', border: '1px solid var(--border-normal)',
                                color: 'var(--text-prominent)', fontSize: '1rem', outline: 'none',
                                fontFamily: 'JetBrains Mono, monospace',
                            }}
                            required
                        />
                    </div>

                    <div style={{
                        padding: 12, borderRadius: 10, background: 'rgba(99,102,241,.08)',
                        border: '1px solid rgba(99,102,241,.15)', fontSize: '0.8rem', color: 'var(--text-general)',
                        marginBottom: 16, lineHeight: 1.5,
                    }}>
                        Configure <b>trade</b> and <b>account_manage</b> scopes when generating your PAT at the{' '}
                        <a href='https://app.deriv.com/api-token' target='_blank' rel='noopener' style={{ color: 'var(--brand-primary)', textDecoration: 'none' }}>
                            Deriv API Token page
                        </a>
                        .
                    </div>

                    {error && (
                        <div style={{
                            padding: 12, borderRadius: 10, background: 'rgba(239,68,68,.08)',
                            border: '1px solid rgba(239,68,68,.2)', fontSize: '0.85rem', color: '#f87171',
                            marginBottom: 16,
                        }}>
                            {error}
                        </div>
                    )}

                    <button
                        type='submit'
                        disabled={loading}
                        style={{
                            width: '100%', padding: '12px 16px', borderRadius: 12,
                            background: 'var(--brand-primary)', color: '#fff', border: 'none',
                            fontSize: '1rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.6 : 1, marginBottom: 10,
                        }}
                    >
                        {loading ? 'Connecting...' : 'Connect with Token'}
                    </button>

                    <button
                        type='button'
                        onClick={handleMock}
                        disabled={loading}
                        style={{
                            width: '100%', padding: '12px 16px', borderRadius: 12,
                            background: 'transparent', color: 'var(--text-general)',
                            border: '1px solid var(--border-normal)', fontSize: '1rem', fontWeight: 600,
                            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
                        }}
                    >
                        Mock Login (Demo)
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginScreen;
