// @ts-nocheck — TradePulse component with known type gaps
import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import useTradePulseData from '../hooks/useTradePulseData';
import useTradePulseFetch from '../hooks/useTradePulseFetch';
import './AccountInfo.scss';

const AccountInfo = observer(() => {
    const store = useStore();
    const { client } = store;
    const loginid = client?.loginid ?? '—';
    const { data: activeAccount } = useTradePulseData();
    const { balance: fetchedBalance, loading } = useTradePulseFetch();
    const balance = client?.balance ? parseFloat(client.balance) : fetchedBalance;
    const currency = client?.currency ?? 'USD';
    const isVirtual = client?.is_virtual ?? false;
    const accountType = isVirtual ? 'Demo' : 'Real';

    const [accounts, setAccounts] = useState<any[]>([]);
    const [currentAccount, setCurrentAccount] = useState<string | null>(null);

    useEffect(() => {
        if (client?.all_accounts_balance) {
            const accs = Object.entries(client.all_accounts_balance).map(([id, bal]: [string, any]) => ({
                loginid: id,
                balance: bal?.balance ?? 0,
                currency: bal?.currency ?? currency,
                is_virtual: !bal?.is_virtual ? false : true,
            }));
            setAccounts(accs);
            setCurrentAccount(client.loginid);
        }
    }, [client?.all_accounts_balance, client?.loginid, currency]);

    if (loading && balance === 0) {
        return (
            <div className='tradepulse__section'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div className='tradepulse__section-brand'>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                                <path d="M3 12v5a2 2 0 0 0 2 2h16v-5"></path>
                                <path d="M18 12a2 2 0 0 1 0 4"></path>
                            </svg>
                            {localize('Account')}
                        </div>
                        <h2 className='tradepulse__section-title'>{localize('Account Details')}</h2>
                        <p className='tradepulse__section-subtitle'>{localize('Manage your connected Deriv account and settings.')}</p>
                    </div>
                    <div className='tradepulse__card-body'>
                        <p className='text-sm text-slate-500'>{localize('Loading account details...')}</p>
                    </div>
                </div>
            </div>
        );
    }

    const isReal = !isVirtual;

    return (
        <div className='tradepulse'>
            <div className='tradepulse__section fade-in'>
                <div className='tradepulse__card'>
                    <div className='tradepulse__card-header'>
                        <div className='tradepulse__section-brand'>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                                <path d="M3 12v5a2 2 0 0 0 2 2h16v-5"></path>
                                <path d="M18 12a2 2 0 0 1 0 4"></path>
                            </svg>
                            {localize('Account')}
                        </div>
                        <h2 className='tradepulse__section-title'>{localize('Account Details')}</h2>
                        <p className='tradepulse__section-subtitle'>{localize('Manage your connected Deriv account and settings.')}</p>
                    </div>

                    <div className='tradepulse__account-grid'>
                        {/* Account Info */}
                        <div className='tradepulse__account-block'>
                            <div className='tradepulse__account-block-header'>
                                <div className='tradepulse__account-block-title'>{localize('Account Info')}</div>
                            </div>
                            <div className='tradepulse__account-block-body'>
                                <div className='tradepulse__account-row'>
                                    <span className='tradepulse__account-row-label'>{localize('Login ID')}</span>
                                    <span className='tradepulse__account-row-value mono'>{loginid}</span>
                                </div>
                                <div className='tradepulse__account-row'>
                                    <span className='tradepulse__account-row-label'>{localize('Account Type')}</span>
                                    <span className={`tradepulse__account-row-value tradepulse__chip ${isReal ? 'tradepulse__chip--ontrack' : 'tradepulse__chip--pending'}`}>
                                        {isReal ? 'REAL' : 'DEMO'}
                                    </span>
                                </div>
                                <div className='tradepulse__account-row'>
                                    <span className='tradepulse__account-row-label'>{localize('Currency')}</span>
                                    <span className='tradepulse__account-row-value mono'>{currency}</span>
                                </div>
                                <div className='tradepulse__account-row'>
                                    <span className='tradepulse__account-row-label'>{localize('Landing Company')}</span>
                                    <span className='tradepulse__account-row-value'>{client?.landing_company_shortcode || '—'}</span>
                                </div>
                            </div>
                        </div>

                        {/* Balance */}
                        <div className='tradepulse__account-block'>
                            <div className='tradepulse__account-block-header'>
                                <div className='tradepulse__account-block-title'>{localize('Balance')}</div>
                            </div>
                            <div className='tradepulse__account-block-body'>
                                <div className='text-xs text-emerald-700 mb-1'>{localize('Current Balance')}</div>
                                <div className='text-3xl font-bold text-emerald-900 mono'>
                                    {formatCurrency(balance, currency)}
                                </div>
                            </div>
                        </div>

                        {/* All Accounts */}
                        {accounts.length > 1 && (
                            <div className='tradepulse__account-block' style={{ gridColumn: '1 / -1' }}>
                                <div className='tradepulse__account-block-header'>
                                    <div className='tradepulse__account-block-title'>{localize('All Accounts')}</div>
                                </div>
                                <div className='tradepulse__account-block-body'>
                                    <div className='tradepulse__account-grid' style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                                        {accounts.map((acc: any) => (
                                            <div key={acc.loginid} className={`p-4 rounded-xl border ${acc.loginid === currentAccount ? 'border-brand-500 bg-brand-50/40' : 'border-slate-200'}`}>
                                                <div className='flex items-center gap-3'>
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${!acc.is_virtual ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
                                                        {!acc.is_virtual ? '🇺🇸' : 'D'}
                                                    </div>
                                                    <div className='flex-1'>
                                                        <div className='flex items-center gap-2'>
                                                            <span className='mono text-sm font-semibold text-slate-900'>{acc.loginid}</span>
                                                            <span className={`tradepulse__chip ${!acc.is_virtual ? 'tradepulse__chip--ontrack' : 'tradepulse__chip--pending'}`}>
                                                                {!acc.is_virtual ? 'REAL' : 'DEMO'}
                                                            </span>
                                                        </div>
                                                        <div className='text-[11px] text-slate-500'>{acc.currency}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Connection */}
                        <div className='tradepulse__account-block' style={{ gridColumn: '1 / -1' }}>
                            <div className='tradepulse__account-block-header'>
                                <div className='tradepulse__account-block-title'>{localize('Connection')}</div>
                            </div>
                            <div className='tradepulse__account-block-body'>
                                <div className='tradepulse__account-row'>
                                    <span className='tradepulse__account-row-label'>{localize('Status')}</span>
                                    <div className='flex items-center gap-2'>
                                        <span className='w-2 h-2 rounded-full bg-emerald-500'></span>
                                        <span className='text-sm font-semibold text-emerald-700'>{localize('Connected')}</span>
                                    </div>
                                </div>
                                <div className='tradepulse__account-row'>
                                    <span className='tradepulse__account-row-label'>{localize('WebSocket')}</span>
                                    <span className='tradepulse__account-row-value mono text-xs'>wss://ws.derivws.com/websockets/v3</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

const formatCurrency = (value: number, currency: string): string => {
    if (Math.abs(value) < 0.01) return `${currency} 0.00`;
    return `${currency} ${value.toFixed(2)}`;
};

export default AccountInfo;
