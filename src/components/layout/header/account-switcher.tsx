import { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { observer } from 'mobx-react-lite';
import { addComma, getCurrencyDisplayCode, getDecimalPlaces } from '@/components/shared';
import Text from '@/components/shared_ui/text';
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
    const wrapperRef = useRef<HTMLDivElement>(null);
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
    const isSingleAccount = !accountList || accountList.length <= 1;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
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
            const rawBal = isActive && liveBalance ? liveBalance : (allBal[account.loginid]?.balance ?? account.balance ?? 0);
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

    return (
        <div className='acc-info__wrapper' ref={wrapperRef}>
            <AccountInfoWrapper>
                <div
                    data-testid='dt_acc_info'
                    id='dt_core_account-info_acc-info'
                    role={showChevron ? 'button' : undefined}
                    tabIndex={showChevron ? 0 : -1}
                    aria-expanded={showChevron ? isOpen : undefined}
                    aria-haspopup={showChevron ? 'dialog' : undefined}
                    className={classNames('acc-info acc-info--card', {
                        'acc-info--is-virtual': isVirtual && !showAsReal,
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
                                className={classNames('acc-info__mode-tag', {
                                    'acc-info__mode-tag--demo': !isRealDisplay,
                                    'acc-info__mode-tag--real': isRealDisplay,
                                })}
                            >
                                {isRealDisplay ? 'LIVE' : 'DEMO'}
                            </span>
                            {resolvedLoginId && (
                                <span className='acc-info__loginid'>· {resolvedLoginId}</span>
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
                                        <svg width='12' height='12' viewBox='0 0 24 24' fill='none'>
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
                    {showChevron && (
                        <span
                            className={classNames('acc-info__select-arrow', {
                                'acc-info__select-arrow--invert': isOpen,
                            })}
                        >
                            <svg width='12' height='12' viewBox='0 0 12 12' fill='none'>
                                <path
                                    d='M2.5 4.25L6 7.75L9.5 4.25'
                                    stroke='currentColor'
                                    strokeWidth='1.6'
                                    strokeLinecap='round'
                                    strokeLinejoin='round'
                                />
                            </svg>
                        </span>
                    )}
                </div>
            </AccountInfoWrapper>
            {isOpen && (
                <div
                    data-testid='dt_acc_dropdown'
                    className='acc-dropdown acc-dropdown--card'
                    role='dialog'
                    aria-label='Active Account Details'
                >
                    <div className='acc-dropdown__section-head'>Active Account Details</div>
                    <div className='acc-dropdown__details'>
                        <div className='acc-dropdown__detail-row'>
                            <span>Account ID</span>
                            <strong>{resolvedLoginId || '—'}</strong>
                        </div>
                        <div className='acc-dropdown__detail-row'>
                            <span>Type</span>
                            <strong>{isRealDisplay ? 'Real Account' : 'Demo Account'}</strong>
                        </div>
                        <div className='acc-dropdown__detail-row'>
                            <span>Currency</span>
                            <strong>{displayCurrencyCode}</strong>
                        </div>
                        <div className='acc-dropdown__detail-row'>
                            <span>Balance</span>
                            <strong className='acc-dropdown__detail-balance'>
                                {balance} {displayCurrencyCode}
                            </strong>
                        </div>
                    </div>

                    {formattedAccounts.length > 1 && (
                        <>
                            <div className='acc-dropdown__section-head acc-dropdown__section-head--sub'>
                                Switch Account
                            </div>
                            <div className='acc-dropdown__switch-list' role='listbox'>
                                {formattedAccounts.map((account, idx) => {
                                    const rowIsDemo = account.isVirtual && !account._isFakeReal;
                                    return (
                                        <div
                                            key={
                                                account._isFakeReal
                                                    ? `${account.loginid}-real`
                                                    : `${account.loginid}-${idx}`
                                            }
                                            role='option'
                                            aria-selected={account.isActive}
                                            tabIndex={0}
                                            className={classNames('acc-dropdown__switch-row', {
                                                'is-selected': account.isActive,
                                            })}
                                            onClick={() => !account.isActive && handleAccountSelect(account.loginid)}
                                            onKeyDown={e => {
                                                if (!account.isActive && (e.key === 'Enter' || e.key === ' ')) {
                                                    e.preventDefault();
                                                    handleAccountSelect(account.loginid);
                                                }
                                            }}
                                        >
                                            <div className='acc-dropdown__switch-left'>
                                                <i className={account.isActive ? 'is-on' : ''} />
                                                <span>
                                                    {rowIsDemo ? 'DEMO' : 'LIVE'} · {account.loginid}
                                                </span>
                                            </div>
                                            <strong className='acc-dropdown__switch-bal'>
                                                {account.currency
                                                    ? `${account.balance} ${getCurrencyDisplayCode(account.currency)}`
                                                    : '—'}
                                            </strong>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    <div className='acc-dropdown__footer'>
                        {isVirtual && !showAsReal && !trippleTrickActive && (
                            <button
                                type='button'
                                className='acc-dropdown__reset-btn'
                                disabled={resetBusy}
                                onClick={handleResetBalance}
                            >
                                <span>{resetBusy ? 'Resetting balance…' : 'Reset Demo Balance'}</span>
                            </button>
                        )}
                        <button
                            type='button'
                            data-testid='dt_account_card_logout'
                            className='acc-dropdown__logout-btn'
                            disabled={logoutBusy}
                            onClick={() => void handleLogoutClick()}
                        >
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
                            <span>{logoutBusy ? 'Logging out…' : 'Log out'}</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
});

export default AccountSwitcher;
