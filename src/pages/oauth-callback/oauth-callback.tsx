// @ts-nocheck
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { handleOAuthCallback, cleanupUrl } from '@/external/deriv-core';
import { setAuthData, setAccountList } from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { statusService } from '@/services/supabase/status.service';

const OAuthCallback = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            const redirectUri = process.env.NEXT_PUBLIC_DERIV_REDIRECT_URI;
            const clientId = process.env.NEXT_PUBLIC_DERIV_APP_ID;

            try {
                const authInfo = await handleOAuthCallback(window.location.href, {
                    clientId,
                    redirectUri,
                    scopes: 'trade',
                });

                const { DerivWSAccountsService } = await import('@/services/derivws-accounts.service');
                const accounts = await DerivWSAccountsService.fetchAccountsList(authInfo.access_token);

                if (accounts && accounts.length > 0) {
                    DerivWSAccountsService.storeAccounts(accounts);
                    const firstAccount = accounts[0];
                    localStorage.setItem('active_loginid', firstAccount.account_id);
                    const isDemo =
                        firstAccount.account_id.startsWith('VRT') || firstAccount.account_id.startsWith('VRTC');
                    localStorage.setItem('account_type', isDemo ? 'demo' : 'real');

                    const mappedAccounts = accounts.map(acc => ({
                        loginid: acc.account_id,
                        balance: parseFloat(acc.balance) || 0,
                        currency: acc.currency || 'USD',
                        is_virtual: acc.account_type === 'demo' ? 1 : 0,
                    }));
                    setAccountList(mappedAccounts);
                    setAuthData({
                        loginid: firstAccount.account_id,
                        balance: parseFloat(firstAccount.balance) || 0,
                        currency: firstAccount.currency || 'USD',
                        is_virtual: isDemo ? 1 : 0,
                        account_list: mappedAccounts,
                    });

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
            } catch (error) {
                console.error('OAuth callback error:', error);
            } finally {
                cleanupUrl(redirectUri);
                navigate('/', { replace: true });
            }
        };

        handleCallback();
    }, [navigate]);

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            fontSize: '1.4rem',
            color: 'var(--text-less-prominent)',
        }}>
            Completing authentication...
        </div>
    );
};

export default OAuthCallback;
