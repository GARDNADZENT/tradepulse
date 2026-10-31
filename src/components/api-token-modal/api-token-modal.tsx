import React, { useState } from 'react';
import { DERIV_V3_WS_ENDPOINTS, getAppId, getLegacyWsAppId, isProduction } from '@/components/shared';
import { clearAuthInfo, storeAuthInfo } from '@/external/deriv-core';
import { api_base } from '@/external/bot-skeleton';
import {
    setAccountList,
    setAuthData,
    setIsAuthorized,
    setIsAuthorizing,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useStore } from '@/hooks/useStore';
import { DerivAccount, DerivWSAccountsService } from '@/services/derivws-accounts.service';
import brandConfig from '../../../brand.config.json';
import './api-token-modal.scss';

type TApiTokenModalProps = {
    isOpen: boolean;
    onClose: () => void;
};

class DerivTokenRejectedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DerivTokenRejectedError';
    }
}

/**
 * Attempts Deriv V2 Bearer / Personal Access Token (PAT) authentication against
 * GET /trading/v1/options/accounts. Returns the user's DerivAccount[] when accepted,
 * or null when the token is not a V2 Bearer PAT (allowing V3 WebSocket fallback).
 */
async function tryAuthenticateV2Pat(cleanToken: string): Promise<DerivAccount[] | null> {
    const env = isProduction() ? 'production' : 'staging';
    const primaryBase = brandConfig.platform.derivws.url[env];
    const optionsDir = brandConfig.platform.derivws.directories.options;
    const endpoints = [`${primaryBase}${optionsDir}accounts`];
    if (env !== 'production') {
        endpoints.push(`${brandConfig.platform.derivws.url.production}${optionsDir}accounts`);
    }

    const clientId = getAppId();

    for (const endpoint of endpoints) {
        const headerVariants: Record<string, string>[] = [];
        if (clientId) {
            headerVariants.push({
                Authorization: `Bearer ${cleanToken}`,
                'Deriv-App-ID': clientId,
            });
        }
        headerVariants.push({
            Authorization: `Bearer ${cleanToken}`,
        });

        for (const headers of headerVariants) {
            try {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;
                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers,
                    ...(controller ? { signal: controller.signal } : {}),
                });
                if (timer) clearTimeout(timer);

                if (response.ok) {
                    const payload = await response.json();
                    const accounts: DerivAccount[] = Array.isArray(payload?.data) ? payload.data : [];
                    if (accounts.length > 0) {
                        return accounts;
                    }
                }
            } catch {
                // Network / CORS / abort — continue to next header variant or V3 WebSocket fallback
            }
        }
    }

    return null;
}

/**
 * Attempts Deriv V3 WebSocket `{ authorize: token }` across multiple official Deriv WebSocket
 * hosts using a guaranteed numeric `app_id` (never passing a non-numeric V2 client_id).
 */
async function authenticateViaV3WebSocket(
    cleanToken: string
): Promise<{ authResult: any; wsUrl: string }> {
    const appId = getLegacyWsAppId();
    const candidateUrls = DERIV_V3_WS_ENDPOINTS.map(base => `${base}?app_id=${appId}`);
    let lastNetworkError: Error | null = null;

    for (const wsUrl of candidateUrls) {
        try {
            const authResult = await new Promise<any>((resolve, reject) => {
                let settled = false;
                const ws = new WebSocket(wsUrl);
                const timeout = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    try {
                        ws.close();
                    } catch {}
                    reject(new Error(`Connection timed out (${wsUrl})`));
                }, 10000);

                ws.onopen = () => {
                    try {
                        ws.send(JSON.stringify({ authorize: cleanToken }));
                    } catch (err) {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timeout);
                        reject(err instanceof Error ? err : new Error('WebSocket send failed'));
                    }
                };

                ws.onmessage = evt => {
                    try {
                        const data = JSON.parse(evt.data);
                        if (data.msg_type === 'authorize' || data.error) {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timeout);
                            try {
                                ws.close();
                            } catch {}
                            if (data.error) {
                                reject(
                                    new DerivTokenRejectedError(
                                        data.error.message || 'Invalid Deriv Personal Access Token (PAT).'
                                    )
                                );
                            } else {
                                resolve(data.authorize);
                            }
                        }
                    } catch (err) {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timeout);
                        reject(err instanceof Error ? err : new Error('Malformed Deriv response'));
                    }
                };

                ws.onerror = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    try {
                        ws.close();
                    } catch {}
                    reject(new Error(`WebSocket handshake failed (${wsUrl})`));
                };

                ws.onclose = evt => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timeout);
                    reject(new Error(`WebSocket closed before authorization (code ${evt.code || 0})`));
                };
            });

            return { authResult, wsUrl };
        } catch (err) {
            // If Deriv explicitly rejected the token, surface that immediately — do not retry other hosts.
            if (err instanceof DerivTokenRejectedError) {
                throw err;
            }
            lastNetworkError = err instanceof Error ? err : new Error(String(err));
        }
    }

    throw new Error(
        lastNetworkError
            ? 'Unable to reach Deriv servers. Please check your internet connection or VPN/firewall and try again.'
            : 'Token authentication failed.'
    );
}

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
        const cleanToken = tokenInput.replace(/^Bearer\s+/i, '').trim();
        if (!cleanToken) {
            setError('Please enter a valid Personal Access Token (PAT).');
            return;
        }

        setLoading(true);
        setError('');
        setSuccessMsg('');

        try {
            // 1. Try Deriv V2 Personal Access Token (Bearer PAT) via /trading/v1/options/accounts first
            const v2Accounts = await tryAuthenticateV2Pat(cleanToken);

            if (v2Accounts && v2Accounts.length > 0) {
                const activeAccounts = v2Accounts.filter(a => !a.status || a.status === 'active');
                const usableAccounts = activeAccounts.length > 0 ? activeAccounts : v2Accounts;
                const primary = usableAccounts[0];
                const loginid = String(primary.account_id || '');
                const currency = String(primary.currency || 'USD');
                const balance = parseFloat(primary.balance) || 0;
                const isDemo =
                    primary.account_type === 'demo' || loginid.startsWith('VRT') || loginid.startsWith('VRTC');

                localStorage.removeItem('deriv_pat_mode');
                localStorage.removeItem('deriv_v3_ws_url');

                storeAuthInfo({
                    access_token: cleanToken,
                    token_type: 'Bearer',
                    expires_in: 31536000,
                    expires_at: Math.floor(Date.now() / 1000) + 31536000,
                    scope: 'trade',
                    refresh_token: '',
                });
                DerivWSAccountsService.clearCache();
                DerivWSAccountsService.storeAccounts(usableAccounts);

                const accountsListMap: Record<string, string> = {};
                const clientAccountsMap: Record<string, any> = {};
                usableAccounts.forEach(acc => {
                    const accIsDemo =
                        acc.account_type === 'demo' ||
                        acc.account_id.startsWith('VRT') ||
                        acc.account_id.startsWith('VRTC');
                    accountsListMap[acc.account_id] = cleanToken;
                    clientAccountsMap[acc.account_id] = {
                        token: cleanToken,
                        currency: acc.currency || 'USD',
                        is_virtual: accIsDemo ? 1 : 0,
                        balance: parseFloat(acc.balance) || 0,
                        loginid: acc.account_id,
                    };
                });

                localStorage.setItem('deriv_api_token', cleanToken);
                localStorage.setItem('authToken', cleanToken);
                localStorage.setItem('active_loginid', loginid);
                localStorage.setItem(`token_${loginid}`, cleanToken);
                localStorage.setItem('account_type', isDemo ? 'demo' : 'real');
                localStorage.setItem('accountsList', JSON.stringify(accountsListMap));
                localStorage.setItem('client.accounts', JSON.stringify(clientAccountsMap));

                const mappedAccountList = usableAccounts.map(acc => ({
                    loginid: acc.account_id,
                    balance: parseFloat(acc.balance) || 0,
                    currency: acc.currency || 'USD',
                    is_virtual: acc.account_type === 'demo' ? 1 : 0,
                }));

                setIsAuthorizing(false);
                setIsAuthorized(true);
                setAccountList(mappedAccountList);
                setAuthData({
                    loginid,
                    balance,
                    currency,
                    is_virtual: isDemo ? 1 : 0,
                    account_list: mappedAccountList,
                });

                if (client) {
                    try {
                        client.setLoginId?.(loginid);
                        client.setCurrency?.(currency);
                        client.setBalance?.(balance.toFixed(2));
                        client.setIsLoggedIn?.(true);
                    } catch {}
                }

                try {
                    await api_base?.init?.(true);
                } catch {}

                window.dispatchEvent(new Event('storage'));
                setSuccessMsg(`Connected to ${loginid} (${balance.toFixed(2)} ${currency})`);
                setTimeout(() => onClose(), 650);
                return;
            }

            // 2. Fallback to Deriv V3 WebSocket `{ authorize: token }` across resilient endpoints
            const { authResult, wsUrl } = await authenticateViaV3WebSocket(cleanToken);

            const loginid = String(authResult.loginid || '');
            const currency = String(authResult.currency || 'USD');
            const balance = Number(authResult.balance ?? 0);
            const isDemo = Boolean(authResult.is_virtual) || loginid.startsWith('VR');
            const rawAccountList = Array.isArray(authResult.account_list) ? authResult.account_list : [];

            clearAuthInfo();
            DerivWSAccountsService.clearStoredAccounts();
            localStorage.setItem('deriv_pat_mode', 'v3');
            localStorage.setItem('deriv_v3_ws_url', wsUrl);

            const accountsListMap: Record<string, string> = {};
            const clientAccountsMap: Record<string, any> = {};

            try {
                Object.assign(accountsListMap, JSON.parse(localStorage.getItem('accountsList') || '{}'));
                Object.assign(clientAccountsMap, JSON.parse(localStorage.getItem('client.accounts') || '{}'));
            } catch {}

            accountsListMap[loginid] = cleanToken;
            clientAccountsMap[loginid] = {
                token: cleanToken,
                currency,
                is_virtual: isDemo ? 1 : 0,
                balance,
                loginid,
            };

            rawAccountList.forEach((acc: any) => {
                if (acc?.loginid && !clientAccountsMap[acc.loginid]) {
                    clientAccountsMap[acc.loginid] = {
                        token: acc.loginid === loginid ? cleanToken : '',
                        currency: acc.currency || currency,
                        is_virtual: acc.is_virtual ? 1 : 0,
                        loginid: acc.loginid,
                    };
                }
            });

            localStorage.setItem('deriv_api_token', cleanToken);
            localStorage.setItem('authToken', cleanToken);
            localStorage.setItem('active_loginid', loginid);
            localStorage.setItem(`token_${loginid}`, cleanToken);
            localStorage.setItem('account_type', isDemo ? 'demo' : 'real');
            localStorage.setItem('accountsList', JSON.stringify(accountsListMap));
            localStorage.setItem('client.accounts', JSON.stringify(clientAccountsMap));

            const mappedAccounts =
                rawAccountList.length > 0
                    ? rawAccountList.map((acc: any) => ({
                          loginid: acc.loginid,
                          balance: acc.loginid === loginid ? balance : Number(acc.balance) || 0,
                          currency: acc.currency || currency,
                          is_virtual: acc.is_virtual ? 1 : 0,
                      }))
                    : [
                          {
                              loginid,
                              balance,
                              currency,
                              is_virtual: isDemo ? 1 : 0,
                          },
                      ];

            setIsAuthorizing(false);
            setIsAuthorized(true);
            setAccountList(mappedAccounts);
            setAuthData({
                ...authResult,
                account_list: mappedAccounts,
            });

            if (client) {
                try {
                    client.setLoginId?.(loginid);
                    client.setCurrency?.(currency);
                    client.setBalance?.(balance.toFixed(2));
                    client.setIsLoggedIn?.(true);
                } catch {}
            }

            try {
                await api_base?.init?.(true);
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
        clearAuthInfo();
        DerivWSAccountsService.clearStoredAccounts();
        localStorage.removeItem('deriv_api_token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('deriv_pat_mode');
        localStorage.removeItem('deriv_v3_ws_url');
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
