// @ts-nocheck
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateOAuthURL, getAppId } from '@/components/shared';
import {
    cleanupUrl,
    clearAuthInfo,
    handleOAuthCallback,
    storeAuthInfo,
} from '@/external/deriv-core';
import {
    setAccountList,
    setAuthData,
    setIsAuthorized,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { verifyAuthorizedRelayReturnOrigin } from '@/services/site-config/site-runtime-config';
import { statusService } from '@/services/supabase/status.service';
import { isDemoAccount } from '@/utils/account-helpers';

const RELAY_RETURN_STORAGE_KEY = 'tp_oauth_relay_return_to';

const encodeRelayPayload = (value: unknown): string => {
    const json = JSON.stringify(value);
    return window
        .btoa(unescape(encodeURIComponent(json)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
};

const decodeRelayPayload = (encoded: string): any => {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (padded.length % 4)) % 4;
    const base64 = padded + '='.repeat(padLen);
    const json = decodeURIComponent(escape(window.atob(base64)));
    return JSON.parse(json);
};

const hydrateAccountsFromAccessToken = async (accessToken: string) => {
    const { DerivWSAccountsService } = await import('@/services/derivws-accounts.service');
    const accounts = await DerivWSAccountsService.fetchAccountsList(accessToken);

    if (accounts && accounts.length > 0) {
        DerivWSAccountsService.storeAccounts(accounts);
        const firstAccount = accounts[0];
        localStorage.setItem('active_loginid', firstAccount.account_id);
        const isDemo =
            firstAccount.account_type === 'demo' || isDemoAccount(firstAccount.account_id);
        localStorage.setItem('account_type', isDemo ? 'demo' : 'real');

        const mappedAccounts = accounts.map(acc => ({
            loginid: acc.account_id,
            balance: parseFloat(acc.balance) || 0,
            currency: acc.currency || 'USD',
            is_virtual: acc.account_type === 'demo' || isDemoAccount(acc.account_id) ? 1 : 0,
        }));
        setAccountList(mappedAccounts);
        setAuthData({
            loginid: firstAccount.account_id,
            balance: parseFloat(firstAccount.balance) || 0,
            currency: firstAccount.currency || 'USD',
            is_virtual: isDemo ? 1 : 0,
            account_list: mappedAccounts,
        });
        setIsAuthorized(true);

        const { api_base } = await import('@/external/bot-skeleton');
        await api_base.init(true);

        statusService.saveStatus('connected', {
            loginid: firstAccount.account_id,
            account_type: isDemo ? 'demo' : 'real',
            currency: firstAccount.currency || 'USD',
            balance: parseFloat(firstAccount.balance) || 0,
        });
    } else {
        console.error('No accounts returned after authentication');
    }
};

const OAuthCallback = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            const searchParams = new URLSearchParams(window.location.search);

            // =================================================================
            // MODE 1: Relay Start on Registered Callback Hub (?tp_relay_start=1)
            // =================================================================
            if (searchParams.get('tp_relay_start') === '1') {
                const requestedReturnTo = searchParams.get('return_to') || '';
                const verifiedOrigin = await verifyAuthorizedRelayReturnOrigin(requestedReturnTo);
                if (!verifiedOrigin) {
                    console.error('[OAuthRelay] Rejected unauthorized return_to origin:', requestedReturnTo);
                    navigate('/', { replace: true });
                    return;
                }

                sessionStorage.setItem(RELAY_RETURN_STORAGE_KEY, verifiedOrigin);
                const authUrl = await generateOAuthURL();
                if (authUrl) {
                    window.location.replace(authUrl);
                    return;
                }
                navigate('/', { replace: true });
                return;
            }

            // =================================================================
            // MODE 3: Relay Arrival on Tenant Site (#tp_relay_auth=...)
            // =================================================================
            if (window.location.hash.includes('tp_relay_auth=')) {
                const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
                const encoded = hashParams.get('tp_relay_auth') || '';
                // Immediately scrub token fragment from browser URL/history
                window.history.replaceState(null, '', '/callback');

                try {
                    const relayedAuth = decodeRelayPayload(encoded);
                    if (relayedAuth && relayedAuth.access_token) {
                        storeAuthInfo(relayedAuth);
                        await hydrateAccountsFromAccessToken(relayedAuth.access_token);
                    }
                } catch (err) {
                    console.error('[OAuthRelay] Failed to hydrate relayed session:', err);
                } finally {
                    navigate('/', { replace: true });
                }
                return;
            }

            // =================================================================
            // MODE 2: Standard Deriv OAuth Code Exchange (?code=...&state=...)
            // =================================================================
            const rawRedirect = process.env.NEXT_PUBLIC_DERIV_REDIRECT_URI;
            const redirectUri =
                rawRedirect && rawRedirect.trim() !== '🔒' ? rawRedirect.trim() : window.location.origin;
            const clientId = getAppId();

            try {
                const authInfo = await handleOAuthCallback(window.location.href, {
                    clientId,
                    redirectUri,
                    scopes: 'trade',
                });

                // If initiated by a verified tenant site via Central OAuth Relay,
                // hand the exchanged session back to that tenant origin immediately.
                const relayReturnOrigin = sessionStorage.getItem(RELAY_RETURN_STORAGE_KEY);
                if (relayReturnOrigin) {
                    sessionStorage.removeItem(RELAY_RETURN_STORAGE_KEY);
                    clearAuthInfo();
                    const fragment = encodeRelayPayload(authInfo);
                    window.location.replace(`${relayReturnOrigin}/callback#tp_relay_auth=${fragment}`);
                    return;
                }

                await hydrateAccountsFromAccessToken(authInfo.access_token);
            } catch (error) {
                console.error('OAuth callback error:', error);
                sessionStorage.removeItem(RELAY_RETURN_STORAGE_KEY);
            } finally {
                cleanupUrl(redirectUri);
                navigate('/', { replace: true });
            }
        };

        handleCallback();
    }, [navigate]);

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minHeight: '100vh',
                fontSize: '1.4rem',
                color: 'var(--text-less-prominent)',
            }}
        >
            Completing authentication...
        </div>
    );
};

export default OAuthCallback;
