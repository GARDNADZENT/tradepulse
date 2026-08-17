// @ts-nocheck — TradePulse hook with known type gaps
import { useMemo } from 'react';
import { useStore } from '@/hooks/useStore';
import useTradePulseFetch from './useTradePulseFetch';
import type { PerformanceStats, DailyPnL } from '@/pages/tradepulse/types';

const useTradePulseData = () => {
    const store = useStore();
    const { client, transactions } = store;
    const fetched = useTradePulseFetch();

    const isLoggedIn = client?.is_logged_in ?? false;
    const loginid = client?.loginid ?? '';
    const balance = client?.balance ? parseFloat(client.balance) : fetched.balance;
    const currency = client?.currency ?? fetched.currency ?? 'USD';
    const isVirtual = client?.is_virtual ?? false;
    const accountType = isVirtual ? 'Demo' : 'Real';

    const storeContracts = useMemo(() => {
        const trxs = transactions?.transactions ?? [];
        return trxs
            .filter(trx => trx.type === 'contract' && typeof trx.data === 'object')
            .map(trx => trx.data as any);
    }, [transactions?.transactions]);

    const allContracts = useMemo(() => {
        if (storeContracts.length > 0) return storeContracts;
        return fetched.rawContracts;
    }, [storeContracts, fetched.rawContracts]);

    const todayContracts = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        return allContracts.filter(c => {
            const t = c.closeTime || c.purchaseTime || (c.date_start ? new Date(c.date_start).getTime() / 1000 : null);
            if (!t) return false;
            return new Date(Number(t) * 1000).toISOString().slice(0, 10) === today;
        });
    }, [allContracts]);

    const computeStats = (contracts: any[]): PerformanceStats => {
        const total = contracts.length;
        const wins = contracts.filter(c => c.isWin).length;
        const losses = contracts.filter(c => c.isLoss).length;
        const net = contracts.reduce((s, c) => s + Number(c.profit || 0), 0);
        const winRate = total > 0 ? (wins / total) * 100 : 0;
        
        const winningContracts = contracts.filter(c => c.isWin);
        const losingContracts = contracts.filter(c => c.isLoss);
        const avgProfit = winningContracts.length > 0 ? winningContracts.reduce((s, c) => s + Number(c.profit), 0) / winningContracts.length : 0;
        const avgLoss = losingContracts.length > 0 ? losingContracts.reduce((s, c) => s + Number(c.profit), 0) / losingContracts.length : 0;
        const largestWin = winningContracts.length > 0 ? Math.max(...winningContracts.map(c => Number(c.profit || 0))) : 0;
        const largestLoss = losingContracts.length > 0 ? Math.min(...losingContracts.map(c => Number(c.profit || 0))) : 0;

        const byDay: Record<string, number> = {};
        contracts.forEach(c => {
            const t = c.closeTime || c.purchaseTime || (c.date_start ? new Date(c.date_start).getTime() / 1000 : null);
            if (!t) return;
            const day = new Date(Number(t) * 1000).toISOString().slice(0, 10);
            byDay[day] = (byDay[day] || 0) + Number(c.profit || 0);
        });
        const dayEntries = Object.entries(byDay);
        const bestDay = dayEntries.length ? dayEntries.reduce((a, b) => b[1] > a[1] ? b : a) : null;
        const worstDay = dayEntries.length ? dayEntries.reduce((a, b) => b[1] < a[1] ? b : a) : null;

        const byType: Record<string, number> = {};
        contracts.forEach(c => {
            const type = c.contractType || 'Unknown';
            byType[type] = (byType[type] || 0) + 1;
        });
        const mostTradedEntry = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
        const mostTraded = mostTradedEntry ? mostTradedEntry[1] : 0;
        const mostTradedContract = mostTradedEntry ? mostTradedEntry[0] : null;

        const byMarket: Record<string, number> = {};
        contracts.forEach(c => {
            const symbol = c.symbol || 'Unknown';
            byMarket[symbol] = (byMarket[symbol] || 0) + 1;
        });
        const mostTradedMarketEntry = Object.entries(byMarket).sort((a, b) => b[1] - a[1])[0];
        const mostTradedMarket = mostTradedMarketEntry ? mostTradedMarketEntry[0] : null;

        let winStreak = 0, lossStreak = 0;
        const sorted = [...contracts].sort((a, b) =>
            (Number(b.closeTime || b.purchaseTime || (b.date_start ? new Date(b.date_start).getTime() / 1000 : 0)) || 0) -
            (Number(a.closeTime || a.purchaseTime || (a.date_start ? new Date(a.date_start).getTime() / 1000 : 0)) || 0)
        );
        let curWin = 0, curLoss = 0;
        for (const c of sorted) {
            const p = Number(c.profit) || 0;
            if (p > 0) { curWin++; curLoss = 0; }
            else if (p < 0) { curLoss++; curWin = 0; }
            else { curWin = 0; curLoss = 0; }
            if (curWin > winStreak) winStreak = curWin;
            if (curLoss > lossStreak) lossStreak = curLoss;
        }

        return {
            total_profit: net,
            win_rate: winRate,
            total_trades: total,
            winning_trades: wins,
            losing_trades: losses,
            avg_win: avgProfit,
            avg_loss: avgLoss,
            profit_factor: 0,
            current_streak: winStreak > 0 ? winStreak : -lossStreak,
            largest_win: largestWin,
            largest_loss: largestLoss,
            win_streak: winStreak,
            loss_streak: lossStreak,
            best_day: bestDay ? { date: bestDay[0], profit: bestDay[1] } : null,
            worst_day: worstDay ? { date: worstDay[0], profit: worstDay[1] } : null,
            most_traded: mostTraded,
            most_traded_market: mostTradedMarket,
            most_traded_contract: mostTradedContract,
        };
    };

    const todayStats = useMemo(() => computeStats(todayContracts), [todayContracts]);
    const overallStats = useMemo(() => computeStats(allContracts), [allContracts]);

    const contractPerformance = useMemo(() => {
        const groups: Record<string, any> = {};
        todayContracts.forEach((c: any) => {
            const type = c.contractType || 'Unknown';
            if (!groups[type]) {
                groups[type] = { type, trades: 0, wins: 0, losses: 0, net: 0, totalStake: 0, totalReturn: 0 };
            }
            groups[type].trades++;
            const profit = Number(c.profit || 0);
            if (profit > 0) groups[type].wins++;
            else if (profit < 0) groups[type].losses++;
            groups[type].net += profit;
            groups[type].totalStake += Number(c.stake || 0);
            groups[type].totalReturn += Number(c.payout || 0);
        });

        return Object.values(groups).sort((a: any, b: any) => b.trades - a.trades);
    }, [todayContracts]);

    const dailyPnL = useMemo<DailyPnL[]>(() => {
        const map = new Map<string, { profit: number; trades: number }>();
        allContracts.forEach(c => {
            const t = c.closeTime || c.purchaseTime || (c.date_start ? new Date(c.date_start).getTime() / 1000 : null);
            if (!t) return;
            const date = new Date(Number(t) * 1000).toISOString().slice(0, 10);
            const entry = map.get(date) ?? { profit: 0, trades: 0 };
            entry.profit += Number(c.profit) || 0;
            entry.trades += 1;
            map.set(date, entry);
        });

        return Array.from(map.entries())
            .map(([date, values]) => ({ date, ...values }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [allContracts]);

    return {
        isLoggedIn,
        loginid,
        balance,
        currency,
        accountType,
        isVirtual,
        todayStats,
        overallStats,
        contractPerformance,
        dailyPnL,
        loading: fetched.loading,
        error: fetched.error,
        rawContracts: allContracts,
    };
};

export default useTradePulseData;
