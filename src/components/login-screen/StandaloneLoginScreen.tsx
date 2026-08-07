import React, { useState, useEffect, useCallback } from 'react';
import { generateOAuthURL } from '@/components/shared';
import './LoginScreen.scss';

const PARTICLES = 50;
const FEATURES = [
    { icon: '⚡', title: 'Automated Trading', desc: 'Deploy custom strategies across 10+ volatility markets simultaneously with sniper-precision entry.' },
    { icon: '🎯', title: 'Sniper Engine', desc: 'Tick-level micro-structure analysis with multi-indicator scoring for high-probability entries.' },
    { icon: '🛡️', title: 'Virtual Hook', desc: 'Backtest strategies risk-free with virtual trades. Switch to real only after proven profitability.' },
    { icon: '🤖', title: 'Smart Martingale', desc: 'Advanced position sizing with configurable thresholds, capped exposure, and streak management.' },
    { icon: '🔬', title: 'Market Killer', desc: 'High-frequency Rise/Fall and Over/Under auto-trader with adaptive entry logic.' },
    { icon: '📊', title: 'Live Analytics', desc: 'Real-time P&L tracking, transaction journal, and per-market performance breakdowns.' },
];

const WHITELABEL_STATS = [
    { value: '10+', label: 'Indices' },
    { value: '24/7', label: 'Markets' },
    { value: '2-tick', label: 'Entry' },
    { value: '0-Risk', label: 'Virtual' },
];

const safeParse = (raw: string | null): unknown => {
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
};

const isUserLoggedIn = () => {
    if (localStorage.getItem('active_loginid')) return true;
    const accountsList = safeParse(localStorage.getItem('accountsList'));
    if (accountsList && typeof accountsList === 'object' && Object.keys(accountsList as Record<string, unknown>).length > 0) {
        return true;
    }
    // Treat a valid OAuth token as logged-in so the screen hides as soon as the
    // token exchange completes, even if the async accounts fetch is still running.
    const authInfo = safeParse(localStorage.getItem('auth_info'));
    if (authInfo && typeof authInfo === 'object') {
        const info = authInfo as { access_token?: string; expires_at?: number };
        if (info.access_token && (!info.expires_at || Date.now() < info.expires_at * 1000)) return true;
    }
    return false;
};

const isOAuthCallbackInProgress = () => {
    const path = window.location.pathname;
    if (path.includes('/callback') || path.includes('/endpoint')) return true;
    const params = new URLSearchParams(window.location.search);
    return params.has('code') || params.has('state') || params.has('error');
};

const StandaloneLoginScreen: React.FC = () => {
    const [show, setShow] = useState(() => !isUserLoggedIn() && !isOAuthCallbackInProgress());
    const [visible, setVisible] = useState(false);
    const [isNewLoginLoading, setIsNewLoginLoading] = useState(false);
    const [isNewSignupLoading, setIsNewSignupLoading] = useState(false);
    const [newLoginError, setNewLoginError] = useState('');

    useEffect(() => {
        if (!show) return;
        const t = setTimeout(() => setVisible(true), 60);
        return () => clearTimeout(t);
    }, [show]);

    useEffect(() => {
        const check = () => {
            // Re-evaluate on every poll: hide when logged in, and show again
            // after logout or when the OAuth callback is not in progress.
            setShow(!isUserLoggedIn() && !isOAuthCallbackInProgress());
        };
        const interval = setInterval(check, 800);
        window.addEventListener('storage', check);
        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', check);
        };
    }, []);

    const handleNewAccountsLogin = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        if (isNewLoginLoading) return;
        setIsNewLoginLoading(true);
        setNewLoginError('');
        try {
            const url = await generateOAuthURL();
            if (url) {
                // Replace so the OAuth URL doesn't linger in history
                window.location.replace(url);
            } else {
                setIsNewLoginLoading(false);
                setNewLoginError('Login failed to start. Please try again.');
            }
        } catch (error) {
            console.error('[Login]', error);
            setIsNewLoginLoading(false);
            setNewLoginError('Login failed to start. Please try again.');
        }
    }, [isNewLoginLoading]);

    const handleNewAccountsSignup = useCallback(async (e: React.MouseEvent) => {
        e.preventDefault();
        if (isNewSignupLoading) return;
        setIsNewSignupLoading(true);
        setNewLoginError('');
        try {
            const url = await generateOAuthURL('registration');
            if (url) {
                window.location.replace(url);
            } else {
                setIsNewSignupLoading(false);
                setNewLoginError('Sign up failed to start. Please try again.');
            }
        } catch (error) {
            console.error('[Signup]', error);
            setIsNewSignupLoading(false);
            setNewLoginError('Sign up failed to start. Please try again.');
        }
    }, [isNewSignupLoading]);

    if (!show) return null;

    return (
        <div className={`login-screen${visible ? ' login-screen--visible' : ''}`}>
            <div className='login-screen__bg' />
            <div className='login-screen__bg-overlay' />
            <div className='login-screen__particles'>
                {[...Array(PARTICLES)].map((_, i) => (
                    <div key={i} className='login-screen__particle' style={{
                        left: `${(i * 3.7 + 1) % 100}%`,
                        top: `${(i * 5.1 + 3) % 100}%`,
                        width: `${1.5 + (i % 3) * 1.5}px`,
                        height: `${1.5 + (i % 3) * 1.5}px`,
                        animationDelay: `${i * 0.3}s`,
                        animationDuration: `${4 + (i % 5) * 3}s`,
                        opacity: 0.15 + (i % 4) * 0.05,
                    }} />
                ))}
            </div>

            <div className='login-screen__top-bar'>
                <div className='login-screen__top-bar-left'>
                    <img src='/makoti-logo.jpg' alt='Makoti Traders' className='login-screen__mini-logo' />
                    <span className='login-screen__top-brand'>MAKOTI TRADERS</span>
                </div>
                <div className='login-screen__top-bar-right'>
                    <a href='https://whatsapp.com/channel/0029VbBmfLc3LdQbqcezuz0d'
                       target='_blank' rel='noopener noreferrer'
                       className='login-screen__whatsapp-btn'>
                        <span className='login-screen__whatsapp-icon'>💬</span>
                        Join WhatsApp Channel
                    </a>
                </div>
            </div>

            <div className='login-screen__hero'>
                <div className='login-screen__hero-left'>
                    <div className='login-screen__brand-block'>
                        <h1 className='login-screen__main-title'>MAKOTI TRADERS</h1>
                        <p className='login-screen__main-sub'>Multi-Market Sniper Engine</p>
                        <p className='login-screen__main-desc'>
                            Professional-grade automated trading platform powered by Deriv.
                            Deploy, backtest, and execute strategies across 10 Volatility Indices
                            with tick-level precision.
                        </p>
                    </div>

                    <div className='login-screen__stats-row'>
                        {WHITELABEL_STATS.map((s, i) => (
                            <div key={i} className='login-screen__stat-card'>
                                <span className='login-screen__stat-value'>{s.value}</span>
                                <span className='login-screen__stat-label'>{s.label}</span>
                            </div>
                        ))}
                    </div>

                    <div className='login-screen__features-grid'>
                        {FEATURES.map((f, i) => (
                            <div key={i} className='login-screen__feature-card'>
                                <span className='login-screen__feature-icon'>{f.icon}</span>
                                <div>
                                    <h3 className='login-screen__feature-title'>{f.title}</h3>
                                    <p className='login-screen__feature-desc'>{f.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className='login-screen__hero-right'>
                    <div className='login-screen__auth-card'>
                        <div className='login-screen__auth-header'>
                            <img src='/makoti-logo.jpg' alt='' className='login-screen__auth-logo' />
                            <h2 className='login-screen__auth-title'>Welcome Back</h2>
                            <p className='login-screen__auth-sub'>Sign in to start trading</p>
                        </div>

                        <button
                            className={`login-screen__btn login-screen__btn--login${isNewLoginLoading ? ' login-screen__btn--loading' : ''}`}
                            onClick={handleNewAccountsLogin}
                            disabled={isNewLoginLoading}
                        >
                            <span className='login-screen__btn-text'>{isNewLoginLoading ? 'Connecting...' : 'Login with Deriv'}</span>
                        </button>

                        {newLoginError && <p className='login-screen__error'>{newLoginError}</p>}

                        <div className='login-screen__divider'><span>New here?</span></div>

                        <button
                            className={`login-screen__btn login-screen__btn--create${isNewSignupLoading ? ' login-screen__btn--loading' : ''}`}
                            onClick={handleNewAccountsSignup}
                            disabled={isNewSignupLoading}
                        >
                            <span className='login-screen__btn-text'>{isNewSignupLoading ? 'Redirecting...' : 'Create Free Account'}</span>
                        </button>

                        <a href='https://whatsapp.com/channel/0029VbBmfLc3LdQbqcezuz0d'
                           target='_blank' rel='noopener noreferrer'
                           className='login-screen__whatsapp-link'>
                            💬 Join our WhatsApp Channel for updates & support
                        </a>
                    </div>
                </div>
            </div>

            <div className='login-screen__bottom-bar'>
                <span>© 2026 Makoti Developers</span>
                <span>Contact: +254 799 476 880</span>
                <span>Version 2.0.0</span>
                <span>Powered by Deriv</span>
            </div>
        </div>
    );
};

export default StandaloneLoginScreen;
