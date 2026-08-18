// @ts-nocheck — TradePulse fetch hook with known type gaps
import { useEffect, useMemo, useState } from 'react';
import { sendViaNewSystemWithPromise } from '@/auth/NewDerivAuth';
import { useStore } from '@/hooks/useStore';
import type { PerformanceStats, DailyPnL } from '@/pages/tradepulse/types';

const useTradePulseFetch = () => {
    const store = useStore();
    const { client } = store || {};
    const loginid = client?.loginid ?? '';
    const isLoggedIn = client?.is_logged_in ?? false;

    const [rawContracts, setRawContracts] = useState<any[]>([]);
    const [liveBalance, setLiveBalance] = useState<number>(0);
    const [currency, setCurrency] = useState<string>('USD');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!isLoggedIn || !loginid) return;

        let cancelled = false;
        let balanceInterval: ReturnType<typeof setInterval> | null = null;

        const waitForSocket = () => {
            return new Promise<void>((resolve) => {
                const check = () => {
                    if (window._newSystemWS?.readyState === WebSocket.OPEN) {
                        resolve();
                    } else {
                        setTimeout(check, 500);
                    }
                };
                check();
            });
        };

        const fetchData = async () => {
            try {
                await waitForSocket();
                if (cancelled) return;

                setLoading(true);
                setError(null);

                const [profitTableRes, balanceRes] = await Promise.all([
                    sendViaNewSystemWithPromise({ profit_table: 1, description: 1, limit: 500 }).catch((err) => {
                        console.warn('[TradePulse] profit_table fetch failed:', err);
                        return null;
                    }),
                    sendViaNewSystemWithPromise({ balance: 1 }).catch((err) => {
                        console.warn('[TradePulse] balance fetch failed:', err);
                        return null;
                    }),
                ]);

                if (cancelled) return;

                if (balanceRes?.balance) {
                    setLiveBalance(Number(balanceRes.balance.balance) || 0);
                    setCurrency(balanceRes.balance.currency || 'USD');
                }

                if (profitTableRes?.profit_table?.transactions) {
                    const items = profitTableRes.profit_table.transactions;
                    const contracts = items.map((item: any) => {
                        const buyPrice = Number(item.buy_price) || 0;
                        const sellPrice = Number(item.sell_price) || 0;
                        const payout = Number(item.payout) || 0;
                        const profit = sellPrice - buyPrice;
                        const isWin = profit > 0;
                        const isLoss = profit < 0;

                        return {
                            id: item.transaction_id,
                            contractId: item.contract_id,
                            type: 'sell',
                            stake: buyPrice,
                            payout,
                            profit,
                            purchaseTime: item.purchase_time ? Number(item.purchase_time) : null,
                            closeTime: item.sell_time ? Number(item.sell_time) : (item.purchase_time ? Number(item.purchase_time) : null),
                            contractType: item.contract_type || null,
                            symbol: item.underlying_symbol || null,
                            isWin,
                            isLoss,
                            account_loginid: loginid,
                            source: 'profit_table',
                            date_start: item.purchase_time ? new Date(Number(item.purchase_time) * 1000).toISOString() : null,
                        };
                    });
                    setRawContracts(contracts);
                }
            } catch (err) {
                if (!cancelled) setError(err.message || 'Failed to fetch data');
            } finally {
                if (!cancelled) setLoading(false);
            }

            // Refresh balance every 5 seconds like the old project
            balanceInterval = setInterval(async () => {
                if (cancelled) return;
                try {
                    const balanceRes = await sendViaNewSystemWithPromise({ balance: 1 }).catch(() => null);
                    if (balanceRes?.balance && !cancelled) {
                        setLiveBalance(Number(balanceRes.balance.balance) || 0);
                        setCurrency(balanceRes.balance.currency || 'USD');
                    }
                } catch (err) {
                    // silent
                }
            }, 5000);
        };

        fetchData();

        return () => {
            cancelled = true;
            if (balanceInterval) clearInterval(balanceInterval);
        };
    }, [isLoggedIn, loginid]);

    const stats = useMemo<PerformanceStats>(() => {
        const total = rawContracts.length;
        const wins = rawContracts.filter(c => c.isWin).length;
        const losses = rawContracts.filter(c => c.isLoss).length;
        const net = rawContracts.reduce((s, c) => s + Number(c.profit || 0), 0);
        const winRate = total > 0 ? (wins / total) * 100 : null;
        const avgWin = wins > 0 ? rawContracts.filter(c => c.isWin).reduce((s, c) => s + Number(c.profit), 0) / wins : null;
        const avgLoss = losses > 0 ? rawContracts.filter(c => c.isLoss).reduce((s, c) => s + Number(c.profit), 0) / losses : null;
        const totalStake = rawContracts.reduce((s, c) => s + Number(c.stake || 0), 0);
        const totalPayout = rawContracts.reduce((s, c) => s + Number(c.payout || 0), 0);
        const profitFactor = totalStake > 0 ? Math.abs(totalPayout / totalStake) : null;

        const byDay: Record<string, number> = {};
        rawContracts.forEach(c => {
            try {
                const t = c.closeTime || c.purchaseTime || (c.date_start ? new Date(c.date_start).getTime() / 1000 : null);
                if (!t) return;
                const day = new Date(Number(t) * 1000).toISOString().slice(0, 10);
                byDay[day] = (byDay[day] || 0) + Number(c.profit || 0);
            } catch {
                // skip contracts with invalid dates
            }
        });
        const dayEntries = Object.entries(byDay);
        const bestDay = dayEntries.length ? dayEntries.reduce((a, b) => b[1] > a[1] ? b : a) : null;
        const worstDay = dayEntries.length ? dayEntries.reduce((a, b) => b[1] < a[1] ? b : a) : null;

        let winStreak = 0, lossStreak = 0;
        const sorted = [...rawContracts].sort((a, b) => {
            try {
                const ta = Number(a.closeTime || a.purchaseTime || (a.date_start ? new Date(a.date_start).getTime() / 1000 : 0)) || 0;
                const tb = Number(b.closeTime || b.purchaseTime || (b.date_start ? new Date(b.date_start).getTime() / 1000 : 0)) || 0;
                return tb - ta;
            } catch {
                return 0;
            }
        });
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
            avg_win: avgWin,
            avg_loss: avgLoss,
            profit_factor: profitFactor,
            current_streak: winStreak > 0 ? winStreak : -lossStreak,
            best_day: bestDay ? { date: bestDay[0], profit: bestDay[1] } : null,
            worst_day: worstDay ? { date: worstDay[0], profit: worstDay[1] } : null,
        };
    }, [rawContracts]);

    const dailyPnL = useMemo<DailyPnL[]>(() => {
        const map = new Map<string, { profit: number; trades: number }>();
        rawContracts.forEach(c => {
            try {
                const t = c.closeTime || c.purchaseTime || (c.date_start ? new Date(c.date_start).getTime() / 1000 : null);
                if (!t) return;
                const date = new Date(Number(t) * 1000).toISOString().slice(0, 10);
                const entry = map.get(date) ?? { profit: 0, trades: 0 };
                entry.profit += Number(c.profit) || 0;
                entry.trades += 1;
                map.set(date, entry);
            } catch {
                // skip contracts with invalid dates
            }
        });

        return Array.from(map.entries())
            .map(([date, values]) => ({ date, ...values }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [rawContracts]);

    console.log('[useTradePulseFetch] returning', {
        rawContractsLength: rawContracts.length,
        liveBalance,
        currency,
        loading,
        error,
    });

    return {
        isLoggedIn,
        loginid,
        balance: liveBalance,
        currency,
        accountType: client?.is_virtual ? 'Demo' : 'Real',
        isVirtual: client?.is_virtual ?? false,
        stats,
        dailyPnL,
        loading,
        error,
        rawContracts,
    };
};

export default useTradePulseFetch;
