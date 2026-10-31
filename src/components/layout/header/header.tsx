import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { observer } from 'mobx-react-lite';
import ApiTokenModal from '@/components/api-token-modal/api-token-modal';
import { generateOAuthURL } from '@/components/shared';
import Button from '@/components/shared_ui/button';
import { DBOT_TABS } from '@/constants/bot-contents';
import { DERIV_CREATE_ACCOUNT_URL } from '@/constants/social-links';
import useActiveAccount from '@/hooks/api/account/useActiveAccount';
import { useApiBase } from '@/hooks/useApiBase';
import { useLogout } from '@/hooks/useLogout';
import { useStore } from '@/hooks/useStore';
import useThemeSwitcher from '@/hooks/useThemeSwitcher';
import { Localize } from '@deriv-com/translations';
import { Header, useDevice, Wrapper } from '@deriv-com/ui';
import { AppLogo } from '../app-logo';
import AccountSwitcher from './account-switcher';
import MenuItems from './menu-items';
import MobileMenu from './mobile-menu';
import './header.scss';

const AppHeader = observer(() => {
    const { isDesktop } = useDevice();
    const { isAuthorizing, activeLoginid, setIsAuthorizing } = useApiBase();
    const { client, dashboard } = useStore() ?? {};
    const { is_dark_mode_on, toggleTheme } = useThemeSwitcher();
    const [authTimeout, setAuthTimeout] = useState(false);
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
    const is_account_regenerating = client?.is_account_regenerating || false;
    const activeCurrency = client?.currency || 'USD';

    const [isOAuthPending, setIsOAuthPending] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return Boolean(params.get('code') && params.get('state'));
    });

    const { data: activeAccount } = useActiveAccount({
        allBalanceData: client?.all_accounts_balance,
        directBalance: client?.balance,
    });

    const handleLogout = useLogout();

    useEffect(() => {
        if (!isOAuthPending) return;

        if (activeLoginid) {
            setIsOAuthPending(false);
            return;
        }

        const timer = setTimeout(() => setIsOAuthPending(false), 30_000);
        return () => clearTimeout(timer);
    }, [isOAuthPending, activeLoginid]);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const account_id = urlParams.get('account_id');
        if (account_id) {
            setIsAuthorizing(true);
        }
    }, [setIsAuthorizing]);

    useEffect(() => {
        if (isOAuthPending) return;

        const timer = setTimeout(() => {
            if (isAuthorizing && !activeLoginid) {
                setAuthTimeout(true);
                setIsAuthorizing(false);
            }
        }, 5000);

        if (activeLoginid || !isAuthorizing) {
            if (authTimeout) setAuthTimeout(false);
            clearTimeout(timer);
        }

        return () => clearTimeout(timer);
    }, [isAuthorizing, activeLoginid, setIsAuthorizing, authTimeout, isOAuthPending]);

    const handleSignup = useCallback(() => {
        window.open(DERIV_CREATE_ACCOUNT_URL, '_blank', 'noopener,noreferrer');
    }, []);

    const handleLogin = useCallback(async () => {
        try {
            setIsAuthorizing(true);
            const oauthUrl = await generateOAuthURL();
            if (oauthUrl) {
                window.location.replace(oauthUrl);
            } else {
                setIsAuthorizing(false);
            }
        } catch {
            setIsAuthorizing(false);
        }
    }, [setIsAuthorizing]);

    const renderThemeToggle = () => (
        <button
            type='button'
            className='app-header__theme-pill'
            onClick={toggleTheme}
            title={is_dark_mode_on ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label='Toggle Theme'
        >
            {is_dark_mode_on ? (
                <svg width='15' height='15' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <path
                        d='M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z'
                        fill='#f8fafc'
                    />
                </svg>
            ) : (
                <svg width='16' height='16' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <circle cx='12' cy='12' r='5' fill='#facc15' />
                    <path
                        d='M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32l1.41-1.41'
                        stroke='#facc15'
                        strokeWidth='2'
                        strokeLinecap='round'
                    />
                </svg>
            )}
        </button>
    );

    const renderAccountSection = useCallback(() => {
        if (activeLoginid && !is_account_regenerating) {
            return (
                <div className='auth-actions'>
                    <div className='account-info'>
                        <AccountSwitcher activeAccount={activeAccount} onLogout={handleLogout} />
                    </div>
                    {renderThemeToggle()}
                </div>
            );
        }

        if (
            !isOAuthPending &&
            ((!is_account_regenerating && !isAuthorizing && !activeLoginid) || authTimeout)
        ) {
            const isAuthConfigured = Boolean(process.env.NEXT_PUBLIC_DERIV_APP_ID);
            return (
                <div className='auth-actions'>
                    <button
                        type='button'
                        className='app-header__token-btn'
                        onClick={() => setIsTokenModalOpen(true)}
                    >
                        PAT Login
                    </button>
                    <Button tertiary disabled={!isAuthConfigured} onClick={handleLogin}>
                        <Localize i18n_default_text='Log in' />
                    </Button>
                    {isDesktop && (
                        <Button primary_light onClick={handleSignup}>
                            <Localize i18n_default_text='Sign up' />
                        </Button>
                    )}
                    {renderThemeToggle()}
                </div>
            );
        }

        return (
            <div className='auth-actions auth-actions--loading'>
                {!activeLoginid && (
                    <button
                        type='button'
                        className='app-header__token-btn'
                        onClick={() => setIsTokenModalOpen(true)}
                    >
                        PAT Login
                    </button>
                )}
                <svg
                    className='auth-actions__spinner'
                    viewBox='0 0 24 24'
                    fill='none'
                    xmlns='http://www.w3.org/2000/svg'
                >
                    <circle
                        cx='12'
                        cy='12'
                        r='10'
                        stroke='currentColor'
                        strokeWidth='2.5'
                        strokeLinecap='round'
                        strokeDasharray='31.416'
                        strokeDashoffset='10'
                    />
                </svg>
                {renderThemeToggle()}
            </div>
        );
    }, [
        isAuthorizing,
        isDesktop,
        activeLoginid,
        activeAccount,
        authTimeout,
        is_account_regenerating,
        isOAuthPending,
        is_dark_mode_on,
        handleLogin,
        handleLogout,
        handleSignup,
        toggleTheme,
    ]);

    if (client?.should_hide_header) return null;

    return (
        <>
            <Header
                className={clsx('app-header', {
                    'app-header--desktop': isDesktop,
                    'app-header--mobile': !isDesktop,
                })}
            >
                <Wrapper variant='left'>
                    <MobileMenu onLogout={handleLogout} />
                    <AppLogo />
                    {!isDesktop && <span className='app-header__brand-text'>TRADERSPULSE</span>}
                    {isDesktop && (
                        <button
                            type='button'
                            className='app-header__chat-pill'
                            onClick={() => dashboard?.setActiveTab?.(DBOT_TABS.AI_DEVELOPER)}
                            title='AI Strategy Developer'
                            aria-label='AI Strategy Developer'
                        >
                            <svg width='15' height='15' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                                <path
                                    d='M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-9 9H7V9h4v2zm6 0h-4V9h4v2z'
                                    fill='currentColor'
                                />
                            </svg>
                        </button>
                    )}
                    {isDesktop && <MenuItems />}
                </Wrapper>
                <Wrapper variant='right'>{renderAccountSection()}</Wrapper>
            </Header>
            <ApiTokenModal isOpen={isTokenModalOpen} onClose={() => setIsTokenModalOpen(false)} />
        </>
    );
});

export default AppHeader;
