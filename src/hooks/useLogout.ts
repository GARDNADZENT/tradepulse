import { useCallback } from 'react';
import { clearAuthInfo } from '@/external/deriv-core';
import { api_base } from '@/external/bot-skeleton/services/api/api-base';
import {
    setAccountList,
    setAuthData,
    setIsAuthorized,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';
import { useStore } from '@/hooks/useStore';
import { ErrorLogger } from '@/utils/error-logger';
import { statusService } from '@/services/supabase/status.service';

const purgeAllAuthStorage = () => {
    clearAuthInfo();
    sessionStorage.removeItem('deriv_accounts');
    localStorage.removeItem('active_loginid');
    localStorage.removeItem('authToken');
    localStorage.removeItem('deriv_api_token');
    localStorage.removeItem('deriv_pat_mode');
    localStorage.removeItem('deriv_v3_ws_url');
    localStorage.removeItem('accountsList');
    localStorage.removeItem('clientAccounts');
    localStorage.removeItem('client.accounts');
    localStorage.removeItem('account_type');
    Object.keys(localStorage).forEach(k => {
        if (k.startsWith('token_')) localStorage.removeItem(k);
    });
    if (api_base) {
        api_base.is_authorized = false;
        api_base.account_info = {};
    }
    setIsAuthorized(false);
    setAccountList([]);
    setAuthData(null);
    window.dispatchEvent(new Event('storage'));
};

export const useLogout = () => {
    const { client } = useStore() ?? {};

    return useCallback(async () => {
        try {
            await client?.logout();
            purgeAllAuthStorage();
            await statusService.saveStatus('disconnected', { reason: 'user_logout' });
        } catch (error) {
            ErrorLogger.error('Logout', 'Logout failed', error);
            try {
                purgeAllAuthStorage();
                client?.setIsLoggedIn?.(false);
                client?.setLoginId?.('');
                client?.setBalance?.('0');
                await statusService.saveStatus('disconnected', { reason: 'logout_clear_storage' });
            } catch (storageError) {
                ErrorLogger.error('Logout', 'Failed to clear auth storage', storageError);
                try {
                    sessionStorage.clear();
                    localStorage.clear();
                } catch (finalError) {
                    ErrorLogger.error('Logout', 'Failed to clear all storage', finalError);
                }
            }
        }
    }, [client]);
};
