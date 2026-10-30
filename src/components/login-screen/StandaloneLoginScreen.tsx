import React, { useState, useEffect, useCallback } from 'react';
import { generateOAuthURL } from '@/components/shared';
import './LoginScreen.scss';

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

const PulseMark: React.FC<{ size?: number; className?: string }> = ({ size = 36, className = '' }) => (
    <div
        className={`login-screen__pulse-mark ${className}`.trim()}
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.28) }}
        aria-hidden='true'
    >
        <svg
            width={Math.round(size * 0.56)}
            height={Math.round(size * 0.56)}
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2.5'
            strokeLinecap='round'
            strokeLinejoin='round'
        >
            <polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
        </svg>
    </div>
);

const StandaloneLoginScreen: React.FC = () => {
    const [show, setShow] = useState(() => !isUserLoggedIn() && !isOAuthCallbackInProgress());
    const [visible, setVisible] = useState(false);
    const [isNewLoginLoading, setIsNewLoginLoading] = useState(false);
    const [isNewSignupLoading, setIsNewSignupLoading] = useState(false);
    const [newLoginError, setNewLoginError] = useState('');

    useEffect(() => {
        if (!show) return;
        const t = setTimeout(() => setVisible(true), 40);
        return () => clearTimeout(t);
    }, [show]);

    useEffect(() => {
        const check = () => {
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
            <div className='login-screen__ambient' aria-hidden='true'>
                <div className='login-screen__glow login-screen__glow--primary' />
                <div className='login-screen__glow login-screen__glow--secondary' />
                <div className='login-screen__grid' />
            </div>

            <header className='login-screen__top-bar'>
                <div className='login-screen__brand'>
                    <PulseMark size={38} />
                    <div className='login-screen__brand-copy'>
                        <span className='login-screen__brand-name'>TradePulse</span>
                        <span className='login-screen__brand-tag'>Plan. Track. Perform.</span>
                    </div>
                </div>
                <div className='login-screen__top-bar-right'>
                    <a
                        href='https://whatsapp.com/channel/0029VbBmfLc3LdQbqcezuz0d'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='login-screen__community-btn'
                    >
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                            <path d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' />
                        </svg>
                        <span>WhatsApp Community</span>
                    </a>
                </div>
            </header>

            <main className='login-screen__center'>
                <div className='login-screen__shell'>
                    <section className='login-screen__hero'>
                        <div className='login-screen__eyebrow'>
                            <span className='login-screen__eyebrow-dot' />
                            <span>Capital-First Trading &amp; Analytics Suite</span>
                        </div>

                        <h1 className='login-screen__headline'>
                            Plan. Track.{' '}
                            <span className='login-screen__headline-accent'>Perform.</span>
                        </h1>

                        <p className='login-screen__lead'>
                            Structured compounding schedules, live Deriv tick telemetry, visual Blockly automation,
                            and disciplined performance analytics — engineered into one unified workspace.
                        </p>

                        <div className='login-screen__pillars'>
                            <div className='login-screen__pillar'>
                                <div className='login-screen__pillar-icon'>
                                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                                        <rect x='3' y='4' width='18' height='18' rx='2' ry='2' />
                                        <line x1='16' y1='2' x2='16' y2='6' />
                                        <line x1='8' y1='2' x2='8' y2='6' />
                                        <line x1='3' y1='10' x2='21' y2='10' />
                                    </svg>
                                </div>
                                <div>
                                    <div className='login-screen__pillar-title'>Plan — Master Compounding Schedules</div>
                                    <div className='login-screen__pillar-desc'>Lock daily profit targets and risk guardrails before placing a single trade.</div>
                                </div>
                            </div>

                            <div className='login-screen__pillar'>
                                <div className='login-screen__pillar-icon'>
                                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                                        <polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
                                    </svg>
                                </div>
                                <div>
                                    <div className='login-screen__pillar-title'>Track — Real-Time Equity &amp; Journey Telemetry</div>
                                    <div className='login-screen__pillar-desc'>Monitor live session P&amp;L, win-rate distribution, and milestone progress.</div>
                                </div>
                            </div>

                            <div className='login-screen__pillar'>
                                <div className='login-screen__pillar-icon'>
                                    <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                                        <polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2' />
                                    </svg>
                                </div>
                                <div>
                                    <div className='login-screen__pillar-title'>Perform — Automated &amp; Precision Execution</div>
                                    <div className='login-screen__pillar-desc'>Deploy visual Blockly bots, quantitative scanners, and SmartCharts seamlessly.</div>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className='login-screen__auth-card' aria-label='Sign in to TradePulse'>
                        <div className='login-screen__auth-header'>
                            <PulseMark size={52} className='login-screen__auth-emblem' />
                            <h2 className='login-screen__auth-title'>Welcome to TradePulse</h2>
                            <p className='login-screen__auth-sub'>
                                Sign in with your Deriv account to launch your workspace
                            </p>
                        </div>

                        <button
                            className={`login-screen__btn login-screen__btn--login${isNewLoginLoading ? ' login-screen__btn--loading' : ''}`}
                            onClick={handleNewAccountsLogin}
                            disabled={isNewLoginLoading}
                        >
                            <span>{isNewLoginLoading ? 'Connecting to Deriv…' : 'Login with Deriv'}</span>
                            {!isNewLoginLoading && (
                                <svg width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                                    <line x1='5' y1='12' x2='19' y2='12' />
                                    <polyline points='12 5 19 12 12 19' />
                                </svg>
                            )}
                        </button>

                        {newLoginError && <p className='login-screen__error' role='alert'>{newLoginError}</p>}

                        <div className='login-screen__divider'>
                            <span>New to Deriv?</span>
                        </div>

                        <button
                            className={`login-screen__btn login-screen__btn--create${isNewSignupLoading ? ' login-screen__btn--loading' : ''}`}
                            onClick={handleNewAccountsSignup}
                            disabled={isNewSignupLoading}
                        >
                            <span>{isNewSignupLoading ? 'Redirecting…' : 'Create Free Account'}</span>
                        </button>

                        <div className='login-screen__security-note'>
                            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
                                <path d='M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' />
                            </svg>
                            <span>Secured via Deriv OAuth 2.0 + PKCE</span>
                        </div>

                        <a
                            href='https://whatsapp.com/channel/0029VbBmfLc3LdQbqcezuz0d'
                            target='_blank'
                            rel='noopener noreferrer'
                            className='login-screen__whatsapp-link'
                        >
                            Join WhatsApp Channel for strategy updates &amp; support
                        </a>
                    </section>
                </div>
            </main>

            <footer className='login-screen__bottom-bar'>
                <span>© 2026 TradePulse — Plan. Track. Perform.</span>
                <span className='login-screen__bottom-sep'>•</span>
                <span>Support: +254 799 476 880</span>
                <span className='login-screen__bottom-sep'>•</span>
                <span>Powered by Deriv</span>
            </footer>
        </div>
    );
};

export default StandaloneLoginScreen;
