import { useCallback } from 'react';
import { clearAuthInfo } from '@/external/deriv-core';
import { useStore } from '@/hooks/useStore';
import { ErrorLogger } from '@/utils/error-logger';
import { statusService } from '@/services/supabase/status.service';

/**
 * Custom hook to handle logout functionality
 * Clears all session and local storage to reset the session
 * @returns {Function} handleLogout - Function to trigger the logout process
 */
export const useLogout = () => {
    const { client } = useStore() ?? {};

    return useCallback(async () => {
        try {
            await client?.logout();
            await statusService.saveStatus('disconnected', { reason: 'user_logout' });
        } catch (error) {
            ErrorLogger.error('Logout', 'Logout failed', error);
            try {
                clearAuthInfo();
                localStorage.removeItem('active_loginid');
                localStorage.removeItem('authToken');
                localStorage.removeItem('accountsList');
                localStorage.removeItem('clientAccounts');
                localStorage.removeItem('account_type');
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
