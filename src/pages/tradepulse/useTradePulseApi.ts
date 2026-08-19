// @ts-nocheck
import { useCallback } from 'react';
import { useTradePulse } from './TradePulseContext';

export const useTradePulseApi = () => {
    const { currentAccount } = useTradePulse();

    const api = useCallback(async (path: string, options?: RequestInit) => {
        const res = await fetch(path, options);
        if (res.status === 401) {
            // handle logout
            throw new Error('Unauthorized');
        }
        if (!res.ok) throw new Error(`API error ${res.status}`);
        return res.json();
    }, []);

    const getStatistics = useCallback(async () => {
        if (!currentAccount) return null;
        return api(`/api/statistics?account_id=${encodeURIComponent(currentAccount)}`);
    }, [currentAccount, api]);

    const getBalance = useCallback(async () => {
        if (!currentAccount) return null;
        return api(`/api/balance?account_id=${encodeURIComponent(currentAccount)}`);
    }, [currentAccount, api]);

    const getJourney = useCallback(async () => {
        return api('/api/journey');
    }, [api]);

    const createJourney = useCallback(async (journey: any) => {
        return api('/api/journey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(journey),
        });
    }, [api]);

    const deleteJourney = useCallback(async () => {
        return api('/api/journey', { method: 'DELETE' });
    }, [api]);

    const mockLogin = useCallback(async () => {
        return api('/api/mock-login', { method: 'POST' });
    }, [api]);

    const externalTokenLogin = useCallback(async (token: string) => {
        return api('/api/auth/external-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: token }),
        });
    }, [api]);

    return {
        getStatistics,
        getBalance,
        getJourney,
        createJourney,
        deleteJourney,
        mockLogin,
        externalTokenLogin,
    };
};
