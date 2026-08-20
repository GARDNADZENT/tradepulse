// @ts-nocheck
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useStore } from '@/hooks/useStore';
import { loadJourney, normalizeJourneyDays } from './utils/calculations';

interface Account {
    loginid: string;
    balance: number;
    currency: string;
    is_virtual: boolean;
    landing_company_shortcode?: string;
    account_type?: string;
    status?: string;
    group?: string;
}

interface ScheduleRow {
    day: number;
    date: string;
    start: number;
    end: number;
    profit: number;
    rate: number;
    actual: number | null;
    diff: number | null;
    status: 'pending' | 'complete' | 'behind' | 'missed';
}

interface Schedule {
    initial: number;
    days: number;
    rate: number;
    startDate: string;
    rows: ScheduleRow[];
}

interface Journey {
    id?: string;
    initial_balance: number;
    daily_target_pct: number;
    cycle_length_days: number;
    start_date: string;
    days?: any[];
    created_at?: string;
    updated_at?: string;
}

interface Contract {
    id: string;
    contractId: string;
    type: string;
    stake: number;
    payout: number;
    profit: number;
    purchaseTime: number | null;
    closeTime: number | null;
    contractType: string | null;
    symbol: string | null;
    isWin: boolean;
    isLoss: boolean;
    account_loginid: string;
    source: string;
    date_start?: string;
}

interface Statistics {
    balance: any;
    today: any;
    overall: any;
    contractPerformance: any[];
    contracts: Contract[];
}

interface TradePulseState {
    isLoggedIn: boolean;
    token: string | null;
    accounts: Account[];
    currentAccount: string | null;
    schedule: Schedule | null;
    todayDay: number;
    contracts: Contract[];
    summary: any;
    journey: Journey | null;
    statistics: Statistics | null;
    portfolio: any;
    profitTable: any;
    journeyLoading: boolean;
    journeyError: string | null;
    journeyModalOpen: boolean;
}

interface TradePulseContextValue extends TradePulseState {
    setState: (updates: Partial<TradePulseState>) => void;
    refreshAll: () => Promise<void>;
    refreshBalance: () => Promise<void>;
    refreshJourney: () => Promise<void>;
    logout: () => Promise<void>;
    switchAccount: (loginid: string) => void;
    getSelected: () => Account | null;
}

const TradePulseContext = createContext<TradePulseContextValue | null>(null);

export const useTradePulse = () => {
    const ctx = useContext(TradePulseContext);
    if (!ctx) throw new Error('useTradePulse must be used within TradePulseProvider');
    return ctx;
};

export const TradePulseProvider = ({ children }: { children: ReactNode }) => {
    const store = useStore();
    const storeClient = store.client;
    const initialLoginid = storeClient?.loginid ?? null;
    const initialAccounts = storeClient?.accounts ?? [];

    const [state, setState] = useState<TradePulseState>({
        isLoggedIn: false,
        token: null,
        accounts: initialAccounts.length > 0 ? initialAccounts : [],
        currentAccount: initialLoginid,
        schedule: null,
        todayDay: 0,
        contracts: [],
        summary: {},
        journey: null,
        statistics: null,
        portfolio: null,
        profitTable: null,
        journeyLoading: false,
        journeyError: null,
        journeyModalOpen: false,
    });

    useEffect(() => {
        if (initialLoginid && !state.currentAccount) {
            setState(prev => ({ ...prev, currentAccount: initialLoginid }));
        }
    }, [initialLoginid, state.currentAccount]);

    const setPartial = useCallback((updates: Partial<TradePulseState>) => {
        setState(prev => ({ ...prev, ...updates }));
    }, []);

    const getSelected = useCallback(() => {
        return state.accounts.find(a => a.loginid === state.currentAccount) || null;
    }, [state.accounts, state.currentAccount]);

    const refreshJourney = useCallback(async (loginid?: string) => {
        const accountLoginid = loginid || state.currentAccount;
        if (!accountLoginid) return;
        setState(prev => ({ ...prev, journeyLoading: true, journeyError: null }));
        try {
            const result = await loadJourney(accountLoginid);
            setState(prev => ({
                ...prev,
                journey: result.journey,
                schedule: result.schedule,
                journeyLoading: false,
            }));
        } catch (e) {
            console.error('Load journey failed:', e);
            setState(prev => ({
                ...prev,
                journey: null,
                schedule: null,
                journeyLoading: false,
                journeyError: e instanceof Error ? e.message : 'Failed to load journey',
            }));
        }
    }, [state.currentAccount]);

    const refreshAll = useCallback(async () => {
        if (!state.currentAccount) return;
        try {
            const res = await fetch(`/api/statistics?account_id=${encodeURIComponent(state.currentAccount)}`);
            if (!res.ok) throw new Error(`API error ${res.status}`);
            const data = await res.json();

            setState(prev => {
                const accounts = [...prev.accounts];
                const selectedIndex = accounts.findIndex(a => a.loginid === prev.currentAccount);
                if (selectedIndex !== -1 && data.balance) {
                    accounts[selectedIndex] = {
                        ...accounts[selectedIndex],
                        balance: Number(data.balance.balance),
                        currency: data.balance.currency || accounts[selectedIndex].currency,
                    };
                }
                return {
                    ...prev,
                    statistics: data,
                    contracts: (data.contracts || []).filter((t: any) => t.contract_type && Number(t.is_sold) === 1),
                    accounts,
                };
            });
        } catch (e) {
            console.error('Statistics fetch failed:', e);
        }
    }, [state.currentAccount]);

    const refreshBalance = useCallback(async () => {
        if (!state.currentAccount) return;
        try {
            const res = await fetch(`/api/balance?account_id=${encodeURIComponent(state.currentAccount)}`);
            if (!res.ok) throw new Error(`API error ${res.status}`);
            const data = await res.json();
            setState(prev => {
                const accounts = [...prev.accounts];
                const selectedIndex = accounts.findIndex(a => a.loginid === prev.currentAccount);
                if (selectedIndex !== -1) {
                    accounts[selectedIndex] = {
                        ...accounts[selectedIndex],
                        balance: Number(data.balance),
                        currency: data.currency || accounts[selectedIndex].currency,
                    };
                }
                return { ...prev, accounts };
            });
        } catch (e) {
            console.error('Balance fetch failed', e);
        }
    }, [state.currentAccount]);

    const logout = useCallback(async () => {
        setState({
            isLoggedIn: false,
            token: null,
            accounts: [],
            currentAccount: null,
            schedule: null,
            todayDay: 0,
            contracts: [],
            summary: {},
            journey: null,
            statistics: null,
            portfolio: null,
            profitTable: null,
            journeyLoading: false,
            journeyError: null,
            journeyModalOpen: false,
        });
        try {
            await fetch('/api/logout', { method: 'POST' });
        } catch (e) {
            // ignore
        }
    }, []);

    const switchAccount = useCallback((loginid: string) => {
        setState(prev => ({
            ...prev,
            currentAccount: loginid,
            contracts: [],
            statistics: null,
            portfolio: null,
            profitTable: null,
            journey: null,
            schedule: null,
        }));
        refreshAll();
        refreshJourney(loginid);
    }, [refreshAll, refreshJourney]);

    return (
        <TradePulseContext.Provider value={{
            ...state,
            setState: setPartial,
            refreshAll,
            refreshBalance,
            refreshJourney,
            logout,
            switchAccount,
            getSelected,
        }}>
            {children}
        </TradePulseContext.Provider>
    );
};
