import React, { useCallback, useEffect, useState } from 'react';
import ApiTokenModal from '@/components/api-token-modal/api-token-modal';
import { generateOAuthURL } from '@/components/shared';
import { DERIV_CREATE_ACCOUNT_URL, SOCIAL_LINKS, TSocialPlatformId } from '@/constants/social-links';
import { getTradersPulseLogoSrc } from '@/utils/branding';
import './LoginScreen.scss';

const PARTICLES = 36;

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
    if (
        accountsList &&
        typeof accountsList === 'object' &&
        Object.keys(accountsList as Record<string, unknown>).length > 0
    ) {
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

const SocialBrandIcon: React.FC<{ id: TSocialPlatformId }> = ({ id }) => {
    switch (id) {
        case 'telegram':
            return (
                <span className='login-screen__social-badge login-screen__social-badge--telegram' aria-hidden='true'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                        <path
                            d='M20.7 4.4 3.4 11.1c-1.1.44-1.08 1.06-.2 1.33l4.44 1.38 10.27-6.48c.49-.3.94-.14.57.19l-8.32 7.5-.31 4.58c.45 0 .65-.21.9-.45l2.17-2.1 4.5 3.32c.83.46 1.43.22 1.64-.77l2.96-13.94c.3-1.22-.46-1.77-1.32-1.26Z'
                            fill='#ffffff'
                        />
                    </svg>
                </span>
            );
        case 'whatsapp':
            return (
                <span className='login-screen__social-badge login-screen__social-badge--whatsapp' aria-hidden='true'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                        <path
                            d='M12.04 3.5a8.46 8.46 0 0 0-7.35 12.66L3.5 20.5l4.48-1.17a8.46 8.46 0 1 0 4.06-15.83Zm4.92 11.96c-.2.58-1.18 1.1-1.65 1.17-.43.07-.98.1-1.59-.1a14.4 14.4 0 0 1-1.44-.53c-2.54-1.1-4.2-3.66-4.33-3.83-.12-.17-1.03-1.37-1.03-2.62 0-1.24.65-1.85.88-2.1.23-.25.5-.31.67-.31h.48c.16 0 .37-.06.58.44.2.5.7 1.72.76 1.85.06.12.1.27.02.44-.08.17-.12.27-.25.42-.12.15-.26.33-.37.44-.12.12-.25.26-.11.5.15.25.65 1.07 1.4 1.73.96.86 1.77 1.12 2.02 1.25.25.12.4.1.54-.06.15-.17.63-.73.8-.98.17-.25.33-.21.56-.12.23.08 1.46.69 1.7.81.25.13.42.19.48.29.06.1.06.6-.15 1.18Z'
                            fill='#ffffff'
                        />
                    </svg>
                </span>
            );
        case 'youtube':
            return (
                <span className='login-screen__social-badge login-screen__social-badge--youtube' aria-hidden='true'>
                    <svg width='16' height='16' viewBox='0 0 24 24' fill='none'>
                        <rect x='2.2' y='5.2' width='19.6' height='13.6' rx='4' fill='#FF0000' />
                        <path d='M10 9.1v5.8L15.2 12 10 9.1Z' fill='#ffffff' />
                    </svg>
                </span>
            );
        case 'tiktok':
            return (
                <span className='login-screen__social-badge login-screen__social-badge--tiktok' aria-hidden='true'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                        <path
                            d='M16.6 5.8A4.2 4.2 0 0 1 15.3 3h-2.9v11.6a2.5 2.5 0 1 1-1.8-2.4V9.2a5.4 5.4 0 1 0 4.7 5.3V8.7a7 7 0 0 0 4.1 1.3V7.2c-1 0-2-.5-2.8-1.4Z'
                            fill='#25F4EE'
                            transform='translate(-0.7, -0.5)'
                        />
                        <path
                            d='M16.6 5.8A4.2 4.2 0 0 1 15.3 3h-2.9v11.6a2.5 2.5 0 1 1-1.8-2.4V9.2a5.4 5.4 0 1 0 4.7 5.3V8.7a7 7 0 0 0 4.1 1.3V7.2c-1 0-2-.5-2.8-1.4Z'
                            fill='#FE2C55'
                            transform='translate(0.7, 0.5)'
                        />
                        <path
                            d='M16.6 5.8A4.2 4.2 0 0 1 15.3 3h-2.9v11.6a2.5 2.5 0 1 1-1.8-2.4V9.2a5.4 5.4 0 1 0 4.7 5.3V8.7a7 7 0 0 0 4.1 1.3V7.2c-1 0-2-.5-2.8-1.4Z'
                            fill='#ffffff'
                        />
                    </svg>
                </span>
            );
        case 'instagram':
            return (
                <span className='login-screen__social-badge login-screen__social-badge--instagram' aria-hidden='true'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                        <rect
                            x='3.5'
                            y='3.5'
                            width='17'
                            height='17'
                            rx='5'
                            stroke='#ffffff'
                            strokeWidth='2'
                        />
                        <circle cx='12' cy='12' r='3.8' stroke='#ffffff' strokeWidth='2' />
                        <circle cx='17.2' cy='6.8' r='1.1' fill='#ffffff' />
                    </svg>
                </span>
            );
        case 'twitter':
            return (
                <span className='login-screen__social-badge login-screen__social-badge--twitter' aria-hidden='true'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                        <path
                            d='M18.24 3.5h2.88l-6.3 7.2L22.24 20.5h-5.8l-4.54-5.94-5.2 5.94H3.8l6.74-7.7L3.44 3.5h5.95l4.1 5.43 4.75-5.43Zm-1.01 15.28h1.6L8.52 5.13H6.8l10.43 13.65Z'
                            fill='#ffffff'
                        />
                    </svg>
                </span>
            );
        case 'facebook':
            return (
                <span className='login-screen__social-badge login-screen__social-badge--facebook' aria-hidden='true'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                        <path
                            d='M13.6 20.5v-7.4h2.5l.38-2.9h-2.88V8.35c0-.84.24-1.42 1.45-1.42h1.54V4.34c-.27-.04-1.18-.12-2.25-.12-2.23 0-3.75 1.36-3.75 3.86v2.12H8.1v2.9h2.49v7.4h3.01Z'
                            fill='#ffffff'
                        />
                    </svg>
                </span>
            );
        case 'discord':
            return (
                <span className='login-screen__social-badge login-screen__social-badge--discord' aria-hidden='true'>
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                        <path
                            d='M19.27 5.33A16.7 16.7 0 0 0 15.14 4a12 12 0 0 0-.53 1.1 15.4 15.4 0 0 0-5.22 0A12 12 0 0 0 8.86 4c-1.45.25-2.84.7-4.13 1.33C2.11 9.28 1.4 13.13 1.75 16.92a16.9 16.9 0 0 0 5.07 2.57c.41-.56.77-1.15 1.08-1.77-.6-.22-1.17-.5-1.71-.83.14-.1.28-.21.42-.32 3.3 1.54 6.89 1.54 10.15 0 .14.11.28.22.42.32-.54.33-1.12.61-1.71.83.31.62.67 1.21 1.08 1.77a16.8 16.8 0 0 0 5.07-2.57c.42-4.39-.71-8.2-2.35-11.59ZM8.68 14.59c-.99 0-1.8-.91-1.8-2.03 0-1.12.79-2.03 1.8-2.03 1.01 0 1.82.91 1.8 2.03 0 1.12-.79 2.03-1.8 2.03Zm6.64 0c-.99 0-1.8-.91-1.8-2.03 0-1.12.79-2.03 1.8-2.03 1.01 0 1.82.91 1.8 2.03 0 1.12-.79 2.03-1.8 2.03Z'
                            fill='#ffffff'
                        />
                    </svg>
                </span>
            );
    }
};

const StandaloneLoginScreen: React.FC = () => {
    const [show, setShow] = useState(() => !isUserLoggedIn() && !isOAuthCallbackInProgress());
    const [visible, setVisible] = useState(false);
    const [isNewLoginLoading, setIsNewLoginLoading] = useState(false);
    const [newLoginError, setNewLoginError] = useState('');
    const [socialHint, setSocialHint] = useState('');
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);

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

    const handleNewAccountsLogin = useCallback(
        async (e: React.MouseEvent) => {
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
        },
        [isNewLoginLoading]
    );

    const handleNewAccountsSignup = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setNewLoginError('');
        window.open(DERIV_CREATE_ACCOUNT_URL, '_blank', 'noopener,noreferrer');
    }, []);

    const handleSocialClick = (label: string, url: string) => {
        const trimmed = url.trim();
        if (trimmed) {
            setSocialHint('');
            window.open(trimmed, '_blank', 'noopener,noreferrer');
            return;
        }
        setSocialHint(`${label} channel link will be connected soon.`);
    };

    if (!show) return null;

    const logoSrc = getTradersPulseLogoSrc();

    return (
        <div className={`login-screen${visible ? ' login-screen--visible' : ''}`}>
            <div className='login-screen__bg-glow' aria-hidden='true' />
            <div className='login-screen__arc login-screen__arc--left' aria-hidden='true' />
            <div className='login-screen__arc login-screen__arc--right' aria-hidden='true' />

            <div className='login-screen__particles' aria-hidden='true'>
                {[...Array(PARTICLES)].map((_, i) => (
                    <div
                        key={i}
                        className='login-screen__particle'
                        style={{
                            left: `${(i * 7.3 + 4) % 96}%`,
                            top: `${(i * 11.7 + 6) % 92}%`,
                            width: `${2 + (i % 3) * 1.5}px`,
                            height: `${2 + (i % 3) * 1.5}px`,
                            animationDelay: `${(i % 8) * 0.45}s`,
                            animationDuration: `${5 + (i % 5) * 2.5}s`,
                            opacity: 0.18 + (i % 4) * 0.12,
                        }}
                    />
                ))}
            </div>

            {/* Top Header Bar */}
            <header className='login-screen__top-bar'>
                <div className='login-screen__top-bar-left'>
                    <img src={logoSrc} alt='TradersPulse' className='login-screen__top-logo' />
                    <span className='login-screen__wordmark'>
                        TRADERS<b>PULSE</b>
                    </span>
                </div>
                <div className='login-screen__top-bar-right'>
                    <div className='login-screen__powered-pill'>
                        <span>Powered by</span>
                        <span className='login-screen__deriv-dot' aria-hidden='true'>
                            D
                        </span>
                        <strong>Deriv</strong>
                    </div>
                </div>
            </header>

            {/* Centered Auth & Socials Card */}
            <main className='login-screen__center'>
                <div className='login-screen__auth-card'>
                    <div className='login-screen__auth-header'>
                        <div className='login-screen__card-logo-wrap'>
                            <img src={logoSrc} alt='TradersPulse logo' className='login-screen__card-logo' />
                        </div>
                        <h1 className='login-screen__auth-title'>Welcome to TradersPulse</h1>
                        <p className='login-screen__auth-sub'>
                            Sign in to trade with AI bots, signals &amp; live execution
                        </p>
                    </div>

                    <div className='login-screen__actions'>
                        <button
                            type='button'
                            className={`login-screen__btn login-screen__btn--login${isNewLoginLoading ? ' login-screen__btn--loading' : ''}`}
                            onClick={handleNewAccountsLogin}
                            disabled={isNewLoginLoading}
                        >
                            <span className='login-screen__deriv-btn-icon' aria-hidden='true'>
                                D
                            </span>
                            <span className='login-screen__btn-text'>
                                {isNewLoginLoading ? 'Connecting…' : 'Login with Deriv'}
                            </span>
                        </button>

                        <button
                            type='button'
                            className='login-screen__btn login-screen__btn--token'
                            onClick={() => setIsTokenModalOpen(true)}
                        >
                            <svg width='16' height='16' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                                <circle cx='8.5' cy='15.5' r='4.5' stroke='currentColor' strokeWidth='1.9' />
                                <path
                                    d='M12 12l8-8m-3 3 2.5 2.5M15 9l2 2'
                                    stroke='currentColor'
                                    strokeWidth='1.9'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                />
                            </svg>
                            <span className='login-screen__btn-text'>PAT Login (Personal Access Token)</span>
                        </button>
                    </div>

                    {newLoginError && <p className='login-screen__error'>{newLoginError}</p>}

                    <div className='login-screen__divider'>
                        <span>NEW TO DERIV?</span>
                    </div>

                    <button
                        type='button'
                        className='login-screen__btn login-screen__btn--create'
                        onClick={handleNewAccountsSignup}
                    >
                        <svg width='17' height='17' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                            <circle cx='10' cy='8' r='3.5' stroke='currentColor' strokeWidth='1.9' />
                            <path
                                d='M4 19c0-3 2.7-5 6-5s6 2 6 5M19 8v6m-3-3h6'
                                stroke='currentColor'
                                strokeWidth='1.9'
                                strokeLinecap='round'
                            />
                        </svg>
                        <span className='login-screen__btn-text'>Create Free Account</span>
                    </button>

                    {/* Official Community & Socials 4x2 Grid */}
                    <section className='login-screen__socials' aria-label='Official Community and Socials'>
                        <h2 className='login-screen__socials-heading'>OFFICIAL COMMUNITY &amp; SOCIALS</h2>
                        <div className='login-screen__socials-grid'>
                            {SOCIAL_LINKS.map(account => (
                                <button
                                    key={account.id}
                                    type='button'
                                    className={`login-screen__social-tile login-screen__social-tile--${account.id}`}
                                    onClick={() => handleSocialClick(account.label, account.url)}
                                    title={account.url ? `Open ${account.label}` : `${account.label} (link coming soon)`}
                                >
                                    <SocialBrandIcon id={account.id} />
                                    <span className='login-screen__social-label'>{account.label}</span>
                                </button>
                            ))}
                        </div>
                        {socialHint && <p className='login-screen__social-hint'>{socialHint}</p>}
                    </section>
                </div>
            </main>

            <footer className='login-screen__bottom-bar'>
                <span>© 2026 TradersPulse</span>
                <span className='login-screen__bottom-dot' aria-hidden='true'>
                    ·
                </span>
                <span>Official Trading Suite</span>
            </footer>

            <ApiTokenModal isOpen={isTokenModalOpen} onClose={() => setIsTokenModalOpen(false)} />
        </div>
    );
};

export default StandaloneLoginScreen;
