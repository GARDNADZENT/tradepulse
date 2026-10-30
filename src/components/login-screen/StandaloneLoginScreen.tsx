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

const PulseIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round'>
        <polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
    </svg>
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
            <header className='login-screen__top-bar'>
                <div className='login-screen__brand'>
                    <div className='login-screen__brand-icon'>
                        <PulseIcon size={20} />
                    </div>
                    <div className='login-screen__brand-copy'>
                        <div className='login-screen__brand-name'>TradePulse</div>
                        <div className='login-screen__brand-tag'>Plan. Track. Perform.</div>
                    </div>
                </div>
                <div className='login-screen__top-bar-right'>
                    <a
                        href='https://whatsapp.com/channel/0029VbBmfLc3LdQbqcezuz0d'
                        target='_blank'
                        rel='noopener noreferrer'
                        className='login-screen__whatsapp-btn'
                    >
                        <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                            <path d='M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z' />
                        </svg>
                        <span>WhatsApp Channel</span>
                    </a>
                </div>
            </header>

            <main className='login-screen__center'>
                <div className='login-screen__shell'>
                    <div className='login-screen__intro'>
                        <span className='login-screen__eyebrow'>
                            <span className='login-screen__live-dot' />
                            TradePulse Workspace
                        </span>
                        <h1 className='login-screen__headline'>
                            Plan. Track. <span>Perform.</span>
                        </h1>
                        <p className='login-screen__lead'>
                            Lock your permanent trading journey, compound daily targets with discipline, and execute automated strategies seamlessly with your Deriv account.
                        </p>

                        <div className='login-screen__pills'>
                            <div className='login-screen__pill-card'>
                                <div className='login-screen__pill-label'>MY JOURNEY</div>
                                <div className='login-screen__pill-val'>Daily Target Lock</div>
                            </div>
                            <div className='login-screen__pill-card'>
                                <div className='login-screen__pill-label'>MASTER SCHEDULE</div>
                                <div className='login-screen__pill-val'>Cycle Compounding</div>
                            </div>
                            <div className='login-screen__pill-card'>
                                <div className='login-screen__pill-label'>AUTOMATION</div>
                                <div className='login-screen__pill-val'>Bots &amp; Scanners</div>
                            </div>
                        </div>
                    </div>

                    <div className='login-screen__auth-card'>
                        <div className='login-screen__auth-header'>
                            <div className='login-screen__auth-badge'>
                                <PulseIcon size={22} />
                            </div>
                            <h2 className='login-screen__auth-title'>Sign in to TradePulse</h2>
                            <p className='login-screen__auth-sub'>Connect securely with your Deriv account</p>
                        </div>

                        <button
                            className={`login-screen__btn login-screen__btn--login${isNewLoginLoading ? ' login-screen__btn--loading' : ''}`}
                            onClick={handleNewAccountsLogin}
                            disabled={isNewLoginLoading}
                        >
                            {isNewLoginLoading ? <span className='login-screen__spinner' /> : null}
                            <span className='login-screen__btn-text'>
                                {isNewLoginLoading ? 'Connecting to Deriv…' : 'Login with Deriv'}
                            </span>
                        </button>

                        {newLoginError && <p className='login-screen__error'>{newLoginError}</p>}

                        <div className='login-screen__divider'>
                            <span>New to Deriv?</span>
                        </div>

                        <button
                            className={`login-screen__btn login-screen__btn--create${isNewSignupLoading ? ' login-screen__btn--loading' : ''}`}
                            onClick={handleNewAccountsSignup}
                            disabled={isNewSignupLoading}
                        >
                            <span className='login-screen__btn-text'>
                                {isNewSignupLoading ? 'Redirecting…' : 'Create Free Account'}
                            </span>
                        </button>

                        <a
                            href='https://whatsapp.com/channel/0029VbBmfLc3LdQbqcezuz0d'
                            target='_blank'
                            rel='noopener noreferrer'
                            className='login-screen__whatsapp-link'
                        >
                            Join our WhatsApp Channel for updates &amp; support
                        </a>
                    </div>
                </div>
            </main>

            <footer className='login-screen__bottom-bar'>
                <span>© 2026 TradePulse · Plan. Track. Perform.</span>
                <span>Contact: +254 799 476 880</span>
                <span>Powered by Deriv</span>
            </footer>
        </div>
    );
};

export default StandaloneLoginScreen;
