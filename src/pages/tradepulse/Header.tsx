// @ts-nocheck
import React, { useState, useRef, useEffect } from 'react';
import { useTradePulse } from './TradePulseContext';

const Header = ({ title, onToggleSidebar }: { title: string; onToggleSidebar: () => void }) => {
    const { isLoggedIn, accounts, currentAccount, switchAccount, logout } = useTradePulse();
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const selected = accounts.find(a => a.loginid === currentAccount) || null;

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const sortedAccounts = [...accounts].sort((a, b) => {
        if (!a.is_virtual && b.is_virtual) return -1;
        if (a.is_virtual && !b.is_virtual) return 1;
        return 0;
    });

    return (
        <header className='tradepulse__header'>
            <button className='tradepulse__header-toggle' onClick={onToggleSidebar}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="3" y1="12" x2="21" y2="12"></line>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <line x1="3" y1="18" x2="21" y2="18"></line>
                </svg>
            </button>

            <div style={{ flex: 1, minWidth: 0 }}>
                <div className='tradepulse__header-title'>{title}</div>
            </div>

            {isLoggedIn && selected && (
                <div style={{ position: 'relative' }} ref={dropdownRef}>
                    <button
                        className='tradepulse__account-card'
                        onClick={(e) => { e.stopPropagation(); setDropdownOpen(!dropdownOpen); }}
                    >
                        <span className={`tradepulse__account-badge ${!selected.is_virtual ? 'tradepulse__account-badge--real' : 'tradepulse__account-badge--demo'}`}>
                            {!selected.is_virtual ? 'REAL' : 'DEMO'}
                        </span>
                        <span className='mono' style={{ fontSize: '0.875rem', color: 'var(--text-prominent)', fontWeight: 500 }}>
                            {selected.loginid}
                        </span>
                        <span className='mono' style={{ fontSize: '0.875rem', color: '#10b981', fontWeight: 600 }}>
                            {Number(selected.balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-less-prominent)' }}>{selected.currency}</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-less-prominent)', marginLeft: 4 }}>
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </button>

                    {dropdownOpen && (
                        <div className='tradepulse__dropdown'>
                            <div className='tradepulse__dropdown-header'>Switch Account</div>
                            <div className='tradepulse__dropdown-list'>
                                {sortedAccounts.map(account => (
                                    <button
                                        key={account.loginid}
                                        className={`tradepulse__dropdown-item ${account.loginid === currentAccount ? 'tradepulse__dropdown-item--active' : ''}`}
                                        onClick={() => {
                                            switchAccount(account.loginid);
                                            setDropdownOpen(false);
                                        }}
                                    >
                                        <div style={{
                                            width: 36, height: 36, borderRadius: 8,
                                            background: !account.is_virtual ? 'rgba(16,185,129,.15)' : 'rgba(56,189,248,.15)',
                                            color: !account.is_virtual ? '#10b981' : '#38bdf8',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: '0.875rem', fontWeight: 700, flexShrink: 0,
                                        }}>
                                            {!account.is_virtual ? 'R' : 'D'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span className='mono' style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-prominent)' }}>
                                                    {account.loginid}
                                                </span>
                                                <span className={`tradepulse__account-badge ${!account.is_virtual ? 'tradepulse__account-badge--real' : 'tradepulse__account-badge--demo'}`}>
                                                    {!account.is_virtual ? 'REAL' : 'DEMO'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.875rem', color: 'var(--text-less-prominent)', marginTop: 2 }}>
                                                {account.landing_company_shortcode || ''} · {account.currency || ''}
                                            </div>
                                        </div>
                                        {account.loginid === currentAccount && (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--brand-primary)', flexShrink: 0 }}>
                                                <polyline points="20 6 9 17 4 12"></polyline>
                                            </svg>
                                        )}
                                    </button>
                                ))}
                            </div>
                            <div className='tradepulse__dropdown-footer'>
                                <button
                                    className='tradepulse__btn tradepulse__btn--danger'
                                    style={{ width: '100%', justifyContent: 'center' }}
                                    onClick={() => {
                                        setDropdownOpen(false);
                                        logout();
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                                        <polyline points="16 17 21 12 16 7"></polyline>
                                        <line x1="21" y1="12" x2="9" y2="12"></line>
                                    </svg>
                                    Disconnect
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </header>
    );
};

export default Header;
