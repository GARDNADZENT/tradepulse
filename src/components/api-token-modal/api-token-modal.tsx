import React, { useState } from 'react';
import { getAppId } from '@/components/shared';
import { api_base } from '@/external/bot-skeleton';
import {
    setAccountList,
    setAuthData,
    setIsAuthorized,
    setIsAuthorizing,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useStore } from '@/hooks/useStore';
import './api-token-modal.scss';

type TApiTokenModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

export const ApiTokenModal: React.FC<TApiTokenModalProps> = ({ isOpen, onClose }) => {
    const store = useStore();
    const client = store?.client;

    const existingToken = typeof window !== 'undefined' ? localStorage.getItem('deriv_api_token') || '' : '';
    const activeLoginid = typeof window !== 'undefined' ? localStorage.getItem('active_loginid') || '' : '';

    const [tokenInput, setTokenInput] = useState(existingToken);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    if (!isOpen) return null;

    const handleConnectToken = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmed = tokenInput.trim();
        if (!trimmed) {
            setError('Please enter a valid Personal Access Token (PAT).');
            return;
        }

        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            const appId = getAppId() || 1089;
            const authResult = await new Promise<any>((resolve, reject) => {
                const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
                const timeout = setTimeout(() => {
                    try {
                        ws.close();
                    } catch {}
                    reject(new Error('Connection timed out while verifying API token.'));
                }, 15000);

                ws.onopen = () => {
                    ws.send(JSON.stringify({ authorize: trimmed }));
                };

                ws.onmessage = evt => {
                    try {
                        const data = JSON.parse(evt.data);
                        if (data.msg_type === 'authorize' || data.error) {
                            clearTimeout(timeout);
                            try {
                                ws.close();
                            } catch {}
                            if (data.error) {
                                reject(new Error(data.error.message || 'Invalid Deriv API token.'));
                            } else {
                                resolve(data.authorize);
                            }
                        }
                    } catch (err) {
                        clearTimeout(timeout);
                        reject(err);
                    }
                };

                ws.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error('Unable to reach Deriv WebSocket server.'));
                };
            });

            const loginid = String(authResult.loginid || '');
            const currency = String(authResult.currency || 'USD');
            const balance = Number(authResult.balance ?? 0);
            const isDemo = Boolean(authResult.is_virtual) || loginid.startsWith('VR');
            const rawAccountList = Array.isArray(authResult.account_list) ? authResult.account_list : [];

            const accountsListMap: Record<string, string> = {};
            const clientAccountsMap: Record<string, any> = {};

            try {
                Object.assign(accountsListMap, JSON.parse(localStorage.getItem('accountsList') || '{}'));
                Object.assign(clientAccountsMap, JSON.parse(localStorage.getItem('client.accounts') || '{}'));
            } catch {}

            accountsListMap[loginid] = trimmed;
            clientAccountsMap[loginid] = {
                token: trimmed,
                currency,
                is_virtual: isDemo ? 1 : 0,
                balance,
                loginid,
            };

            rawAccountList.forEach((acc: any) => {
                if (acc?.loginid && !clientAccountsMap[acc.loginid]) {
                    clientAccountsMap[acc.loginid] = {
                        token: acc.loginid === loginid ? trimmed : '',
                        currency: acc.currency || currency,
                        is_virtual: acc.is_virtual ? 1 : 0,
                        loginid: acc.loginid,
                    };
                }
            });

            localStorage.setItem('deriv_api_token', trimmed);
            localStorage.setItem('authToken', trimmed);
            localStorage.setItem('active_loginid', loginid);
            localStorage.setItem(`token_${loginid}`, trimmed);
            localStorage.setItem('account_type', isDemo ? 'demo' : 'real');
            localStorage.setItem('accountsList', JSON.stringify(accountsListMap));
            localStorage.setItem('client.accounts', JSON.stringify(clientAccountsMap));

            setIsAuthorizing(false);
            setIsAuthorized(true);
            setAccountList(rawAccountList);
            setAuthData(authResult);

            if (client) {
                try {
                    client.setLoginId?.(loginid);
                    client.setCurrency?.(currency);
                    client.setBalance?.(balance.toFixed(2));
                    client.setIsLoggedIn?.(true);
                } catch {}
            }

            try {
                if (api_base?.api?.authorize) {
                    await api_base.api.authorize(trimmed);
                }
            } catch {}

            window.dispatchEvent(new Event('storage'));
            setSuccessMsg(`Connected to ${loginid} (${balance.toFixed(2)} ${currency})`);

            setTimeout(() => {
                onClose();
            }, 650);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Token authentication failed.');
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnectToken = () => {
        localStorage.removeItem('deriv_api_token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('active_loginid');
        localStorage.removeItem('accountsList');
        localStorage.removeItem('client.accounts');
        setIsAuthorized(false);
        setAuthData(null);
        setAccountList([]);
        window.dispatchEvent(new Event('storage'));
        setTokenInput('');
        setSuccessMsg('');
        onClose();
    };

    return (
        <div className='tp-token-modal__backdrop' onClick={onClose} role='dialog' aria-modal='true'>
            <div className='tp-token-modal' onClick={e => e.stopPropagation()}>
                <div className='tp-token-modal__header'>
                    <div>
                        <span className='tp-token-modal__eyebrow'>PERSONAL ACCESS TOKEN</span>
                        <h3 className='tp-token-modal__title'>PAT Login</h3>
                    </div>
                    <button type='button' className='tp-token-modal__close' onClick={onClose} aria-label='Close'>
                        ✕
                    </button>
                </div>

                <form className='tp-token-modal__body' onSubmit={handleConnectToken}>
                    <p className='tp-token-modal__desc'>
                        Sign in instantly using a Deriv Personal Access Token (PAT) enabled with{' '}
                        <strong>Read</strong> and <strong>Trade</strong> scopes — no OAuth redirect required.
                    </p>

                    {activeLoginid && (
                        <div className='tp-token-modal__connected'>
                            <span className='tp-token-modal__dot' />
                            <span>
                                Active Account: <strong>{activeLoginid}</strong>
                            </span>
                        </div>
                    )}

                    <label className='tp-token-modal__label' htmlFor='tp-api-token-input'>
                        Personal Access Token (PAT)
                    </label>
                    <input
                        id='tp-api-token-input'
                        type='password'
                        className='tp-token-modal__input'
                        placeholder='Paste your Personal Access Token…'
                        value={tokenInput}
                        onChange={e => setTokenInput(e.target.value)}
                        autoFocus
                    />

                    {error && <div className='tp-token-modal__alert tp-token-modal__alert--error'>{error}</div>}
                    {successMsg && <div className='tp-token-modal__alert tp-token-modal__alert--ok'>{successMsg}</div>}

                    <div className='tp-token-modal__actions'>
                        {existingToken && (
                            <button
                                type='button'
                                className='tp-token-modal__btn tp-token-modal__btn--ghost'
                                onClick={handleDisconnectToken}
                            >
                                Disconnect Token
                            </button>
                        )}
                        <button
                            type='submit'
                            className='tp-token-modal__btn tp-token-modal__btn--primary'
                            disabled={loading}
                        >
                            {loading ? 'Verifying Token…' : 'Connect Account'}
                        </button>
                    </div>

                    <a
                        className='tp-token-modal__help-link'
                        href='https://app.deriv.com/account/api-token'
                        target='_blank'
                        rel='noopener noreferrer'
                    >
                        Generate an API token in Deriv Account Settings →
                    </a>
                </form>
            </div>
        </div>
    );
};

export default ApiTokenModal;
