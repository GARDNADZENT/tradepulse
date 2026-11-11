import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import { sendViaNewSystemWithPromise } from '@/auth/NewDerivAuth';
import { getAuthInfo } from '@/external/deriv-core';
import { useApiBase } from '@/hooks/useApiBase';
import { useStore } from '@/hooks/useStore';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { getAccountId, isDemoAccount } from '@/utils/account-helpers';
import { isCustomDemoIconActive } from '@/utils/custom-demo-icon-utils';
import { Localize } from '@deriv-com/translations';
import { TAccountSwitcher } from './common/types';
import AccountInfoWrapper from './account-info-wrapper';
import './account-switcher.scss';

const AccountSwitcher = observer(({ activeAccount, onLogout }: TAccountSwitcher) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showAsReal, setShowAsReal] = useState(false);
    const [trippleTrickActive, setTrippleTrickActive] = useState(
        () => localStorage.getItem('tripple_trick_active') === 'true'
    );
    const [resetBusy, setResetBusy] = useState(false);
    const [logoutBusy, setLogoutBusy] = useState(false);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const [isMobileViewport, setIsMobileViewport] = useState(
        () => typeof window !== 'undefined' && window.innerWidth <= 768
    );
    const wrapperRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const { accountList, activeLoginid } = useApiBase();
    const { client, run_panel } = useStore() ?? {};

    useEffect(() => {
        const handleIconChange = () => {
            setShowAsReal(isCustomDemoIconActive());
        };
        window.addEventListener('custom_demo_icon_changed', handleIconChange);
        handleIconChange();
        return () => window.removeEventListener('custom_demo_icon_changed', handleIconChange);
    }, []);

    useEffect(() => {
        const checkTrippleTrick = () =>
            setTrippleTrickActive(localStorage.getItem('tripple_trick_active') === 'true');
        const interval = setInterval(checkTrippleTrick, 1000);
        window.addEventListener('storage', checkTrippleTrick);
        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', checkTrippleTrick);
        };
    }, []);

    const is_bot_running = run_panel?.is_running || api_base.is_running;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            const insideTrigger = wrapperRef.current?.contains(target) ?? false;
            const insideDropdown = dropdownRef.current?.contains(target) ?? false;
            if (!insideTrigger && !insideDropdown) {
                setIsOpen(false);
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    const updateDropdownPosition = useCallback(() => {
        if (typeof window === 'undefined') return;
        const mobile = window.innerWidth <= 768;
        setIsMobileViewport(mobile);
        const rect = wrapperRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (mobile) {
            const topOffset = rect.bottom > 0 ? Math.max(52, Math.round(rect.bottom + 6)) : 56;
            setDropdownStyle({
                position: 'fixed',
                top: `${topOffset}px`,
                right: '12px',
                left: 'auto',
                width: 'min(210px, calc(100vw - 24px))',
                minWidth: 0,
            });
            return;
        }

        const topOffset = rect.bottom > 0 ? Math.round(rect.bottom + 6) : 54;
        const rightOffset = rect.right > 0 ? Math.max(12, Math.round(window.innerWidth - rect.right)) : 16;
        setDropdownStyle({
            position: 'fixed',
            top: `${topOffset}px`,
            right: `${rightOffset}px`,
            left: 'auto',
        });
    }, []);

    useLayoutEffect(() => {
        if (!isOpen) return;
        updateDropdownPosition();
        window.addEventListener('resize', updateDropdownPosition);
        window.addEventListener('scroll', updateDropdownPosition, true);
        return () => {
            window.removeEventListener('resize', updateDropdownPosition);
            window.removeEventListener('scroll', updateDropdownPosition, true);
        };
    }, [isOpen, updateDropdownPosition]);

    const toggleDropdown = useCallback(() => {
        if (is_bot_running) return;
        setIsOpen(prev => !prev);
    }, [is_bot_running]);

    const handleLogoutClick = useCallback(async () => {
        if (logoutBusy) return;
        setLogoutBusy(true);
        try {
            setIsOpen(false);
            if (onLogout) {
                await onLogout();
            } else {
                await client?.logout?.();
            }
        } finally {
            setLogoutBusy(false);
        }
    }, [logoutBusy, onLogout, client]);

    const handleResetBalance = useCallback(
        async (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (resetBusy) return;
            setResetBusy(true);
            try {
                // Prefer the REST reset endpoint: topup_virtual only tops up to the
                // current virtual credit limit and does NOT restore a blown balance.
                const authInfo = getAuthInfo();
                const accessToken = authInfo?.access_token || localStorage.getItem('authToken');
                const accountId = getAccountId() || activeLoginid;
                let reset = false;
                if (accountId && accessToken) {
                    try {
                        await DerivWSAccountsService.resetDemoBalance(accessToken, accountId);
                        reset = true;
                    } catch (err) {
                        console.warn('[ResetBalance] REST reset failed, falling back to topup_virtual:', err);
                    }
                }
                if (!reset) {
                    await sendViaNewSystemWithPromise({ topup_virtual: 1 });
                }
                // Force an immediate balance refresh (the balance stream also pushes on its own).
                await sendViaNewSystemWithPromise({ balance: 1 });
            } catch (err) {
                console.error('[ResetBalance] Failed to reset demo balance:', err);
            } finally {
                setResetBusy(false);
            }
        },
        [resetBusy, activeLoginid]
    );

    const handleAccountSelect = useCallback(
        (loginid: string) => {
            localStorage.setItem('active_loginid', loginid);
            client?.checkAndRegenerateWebSocket();
            setIsOpen(false);
        },
        [client]
    );

    const getFormattedAccounts = () => {
        if (!accountList) return [];
        const allBal = client?.all_accounts_balance?.accounts ?? {};
        const liveBalance = client?.balance;
        const results: Array<{
            loginid: string;
            currency: string;
            balance: string;
            isVirtual: boolean;
            isActive: boolean;
            _isFakeReal?: boolean;
        }> = [];

        for (const account of accountList) {
            const isVirtual = isDemoAccount(account.loginid);
            const isActive = account.loginid === activeLoginid;
            const rawBal =
                isActive && liveBalance
                    ? liveBalance
                    : (allBal[account.loginid]?.balance ?? account.balance ?? 0);
            const entry = {
                loginid: account.loginid,
                currency: account.currency,
                balance: addComma(Number(rawBal).toFixed(getDecimalPlaces(account.currency))),
                isVirtual,
                isActive,
            };

            if (showAsReal && isVirtual) {
                const fakeReal = { ...entry, isVirtual: false, isActive: entry.isActive, _isFakeReal: true };
                entry.balance = addComma((10000).toFixed(getDecimalPlaces(account.currency)));
                entry.isActive = false;
                results.push(fakeReal);
                results.push(entry);
            } else if (!showAsReal) {
                results.push(entry);
            }
        }

        return results.sort((a, b) => {
            if (a._isFakeReal) return -1;
            if (b._isFakeReal) return 1;
            if (a.isActive) return -1;
            if (b.isActive) return 1;
            return 0;
        });
    };
    const formattedAccounts = getFormattedAccounts();

    const resolvedLoginId = activeAccount?.loginid || activeLoginid || client?.loginid || '';
    if (!activeAccount && !resolvedLoginId) return null;

    const currency = activeAccount?.currency || client?.currency || 'USD';
    const isVirtual = activeAccount?.isVirtual ?? isDemoAccount(resolvedLoginId);
    const balance =
        activeAccount?.balance ??
        addComma(Number(client?.balance || 0).toFixed(getDecimalPlaces(currency)));
    const showChevron = !is_bot_running;
    const isRealDisplay = (showAsReal && isVirtual) || !isVirtual;
    const displayCurrencyCode = currency ? getCurrencyDisplayCode(currency) : 'USD';

    const displayAccounts =
        formattedAccounts.length > 0
            ? formattedAccounts
            : [
                  {
                      loginid: resolvedLoginId,
                      currency,
                      balance: String(balance),
                      isVirtual: !isRealDisplay,
                      isActive: true,
                      _isFakeReal: false,
                  },
              ];

    return (
        <div className='acc-info__wrapper' ref={wrapperRef}>
            <AccountInfoWrapper>
                <div
                    data-testid='dt_acc_info'
                    id='dt_core_account-info_acc-info'
                    role={showChevron ? 'button' : undefined}
                    tabIndex={showChevron ? 0 : -1}
                    aria-expanded={showChevron ? isOpen : undefined}
                    aria-haspopup={showChevron ? 'listbox' : undefined}
                    className={classNames('acc-info acc-info--compact', {
                        'acc-info--is-virtual': !isRealDisplay,
                        'acc-info--interactive': showChevron,
                        'acc-info--open': isOpen,
                    })}
                    onClick={toggleDropdown}
                    onKeyDown={e => {
                        if (showChevron && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            toggleDropdown();
                        }
                    }}
                >
                    <div className='acc-info__content'>
                        <div className='acc-info__account-type-header'>
                            <span
                                className={classNames('acc-info__account-type', {
                                    'acc-info__account-type--virtual': !isRealDisplay,
                                })}
                            >
                                {isRealDisplay ? (
                                    <Localize i18n_default_text='Real account' />
                                ) : (
                                    <Localize i18n_default_text='Demo account' />
                                )}
                            </span>
                            {showChevron && (
                                <span
                                    className={classNames('acc-info__select-arrow', {
                                        'acc-info__select-arrow--invert': isOpen,
                                    })}
                                >
                                    <svg width='12' height='12' viewBox='0 0 12 12' fill='none'>
                                        <path
                                            d='M2.25 4.25L6 8L9.75 4.25'
                                            stroke='currentColor'
                                            strokeWidth='1.5'
                                            strokeLinecap='round'
                                            strokeLinejoin='round'
                                        />
                                    </svg>
                                </span>
                            )}
                        </div>
                        {(typeof balance !== 'undefined' || !currency) && (
                            <div className='acc-info__balance-section'>
                                <p
                                    data-testid='dt_balance'
                                    className={classNames('acc-info__balance', {
                                        'acc-info__balance--no-currency': !currency && !isVirtual,
                                    })}
                                >
                                    {!currency ? (
                                        <Localize i18n_default_text='No currency assigned' />
                                    ) : (
                                        `${balance} ${displayCurrencyCode}`
                                    )}
                                </p>
                                {isVirtual && !showAsReal && !trippleTrickActive && (
                                    <button
                                        type='button'
                                        className={`acc-info__reset-balance${resetBusy ? ' acc-info__reset-balance--busy' : ''}`}
                                        title='Reset demo balance'
                                        aria-label='Reset demo balance'
                                        onClick={handleResetBalance}
                                    >
                                        <svg width='11' height='11' viewBox='0 0 24 24' fill='none'>
                                            <path
                                                d='M4 4v6h6'
                                                stroke='currentColor'
                                                strokeWidth='2'
                                                strokeLinecap='round'
                                                strokeLinejoin='round'
                                            />
                                            <path
                                                d='M20 20v-6h-6'
                                                stroke='currentColor'
                                                strokeWidth='2'
                                                strokeLinecap='round'
                                                strokeLinejoin='round'
                                            />
                                            <path
                                                d='M4 10a8 8 0 0 1 14-3l2 3'
                                                stroke='currentColor'
                                                strokeWidth='2'
                                                strokeLinecap='round'
                                                strokeLinejoin='round'
                                            />
                                            <path
                                                d='M20 14a8 8 0 0 1-14 3l-2-3'
                                                stroke='currentColor'
                                                strokeWidth='2'
                                                strokeLinecap='round'
                                                strokeLinejoin='round'
                                            />
                                        </svg>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </AccountInfoWrapper>
            {isOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                    <>
                        {isMobileViewport && (
                            <div
                                data-testid='dt_acc_dropdown_backdrop'
                                className='acc-dropdown__backdrop'
                                aria-hidden='true'
                                onMouseDown={e => e.stopPropagation()}
                                onClick={() => setIsOpen(false)}
                            />
                        )}
                        <div
                            ref={dropdownRef}
                            data-testid='dt_acc_dropdown'
                            style={dropdownStyle}
                            className={classNames('acc-dropdown acc-dropdown--compact acc-dropdown--portal', {
                                'acc-dropdown--mobile': isMobileViewport,
                            })}
                            role='dialog'
                            aria-label='Account Switcher'
                        >
                            <div className='acc-dropdown__list' role='listbox'>
                                {displayAccounts.map((account, idx) => {
                                    const rowIsDemo = account.isVirtual && !account._isFakeReal;
                                    return (
                                        <div
                                            key={
                                                account._isFakeReal
                                                    ? `${account.loginid}-real`
                                                    : `${account.loginid || 'active'}-${idx}`
                                            }
                                            role='option'
                                            aria-selected={account.isActive}
                                            tabIndex={0}
                                            className={classNames('acc-dropdown__account', {
                                                'acc-dropdown__account--selected': account.isActive,
                                                'acc-dropdown__account--virtual': rowIsDemo,
                                            })}
                                            onClick={() =>
                                                !account.isActive &&
                                                account.loginid &&
                                                handleAccountSelect(account.loginid)
                                            }
                                            onKeyDown={e => {
                                                if (
                                                    !account.isActive &&
                                                    account.loginid &&
                                                    (e.key === 'Enter' || e.key === ' ')
                                                ) {
                                                    e.preventDefault();
                                                    handleAccountSelect(account.loginid);
                                                }
                                            }}
                                        >
                                            <span
                                                className={classNames('acc-dropdown__account-type', {
                                                    'acc-dropdown__account-type--virtual': rowIsDemo,
                                                })}
                                            >
                                                {rowIsDemo ? (
                                                    <Localize i18n_default_text='Demo account' />
                                                ) : (
                                                    <Localize i18n_default_text='Real account' />
                                                )}
                                            </span>
                                            <span className='acc-dropdown__balance'>
                                                {account.currency ? (
                                                    `${account.balance} ${getCurrencyDisplayCode(account.currency)}`
                                                ) : (
                                                    <Localize i18n_default_text='No currency assigned' />
                                                )}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                            <button
                                type='button'
                                data-testid='dt_account_card_logout'
                                className='acc-dropdown__logout-row'
                                disabled={logoutBusy}
                                onClick={() => void handleLogoutClick()}
                            >
                                <span>{logoutBusy ? 'Logging out…' : 'Log out'}</span>
                                <svg width='15' height='15' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                                    <path
                                        d='M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'
                                        stroke='currentColor'
                                        strokeWidth='2'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    />
                                    <polyline
                                        points='16 17 21 12 16 7'
                                        stroke='currentColor'
                                        strokeWidth='2'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    />
                                    <line
                                        x1='21'
                                        y1='12'
                                        x2='9'
                                        y2='12'
                                        stroke='currentColor'
                                        strokeWidth='2'
                                        strokeLinecap='round'
                                        strokeLinejoin='round'
                                    />
                                </svg>
                            </button>
                        </div>
                    </>,
                    document.body
                )}
        </div>
    );
});

export default AccountSwitcher;
