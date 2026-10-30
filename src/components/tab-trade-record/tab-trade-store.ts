import { useSyncExternalStore } from 'react';
import { api_base } from '@/external/bot-skeleton';
import chart_api from '@/external/bot-skeleton/services/api/chart-api';

export type TabRecordNamespace = 'dtrader' | 'analysis' | 'ai_bots';

export interface TabJournalEntry {
    id: string;
    timestamp: number;
    type: 'purchase' | 'profit' | 'loss' | 'info' | 'error';
    message: string;
    amount?: number;
    currency?: string;
    contractId?: number;
    transactionId?: number;
}

export interface TabTransactionRecord {
    contractId: number;
    buyTransactionId: number;
    sellTransactionId?: number;
    timestamp: number;
    symbol: string;
    displayName: string;
    contractType: string;
    shortLabel: string;
    longcode: string;
    barrier?: string | number;
    duration?: number;
    buyPrice: number;
    bidPrice: number;
    payout: number;
    profit: number;
    currency: string;
    entrySpot?: string | number;
    exitSpot?: string | number;
    status: 'open' | 'won' | 'lost' | 'sold' | 'expired';
    isCompleted: boolean;
}

export interface TabSessionStats {
    totalStake: number;
    totalPayout: number;
    runs: number;
    won: number;
    lost: number;
    totalProfit: number;
    currency: string;
}

export interface TabTradeSnapshot {
    journal: TabJournalEntry[];
    transactions: TabTransactionRecord[];
    stats: TabSessionStats;
}

const MAX_JOURNAL_ITEMS = 200;
const MAX_TRANSACTION_ITEMS = 150;
const TERMINAL_SET = new Set(['won', 'lost', 'sold', 'expired']);

export function formatTabContractShortLabel(contractType: string, barrier?: string | number): string {
    const ct = String(contractType || '').toUpperCase();
    const b = barrier !== undefined && barrier !== null && barrier !== '' ? ` ${barrier}` : '';
    switch (ct) {
        case 'DIGITOVER':
            return `Over${b}`;
        case 'DIGITUNDER':
            return `Under${b}`;
        case 'DIGITEVEN':
            return 'Even';
        case 'DIGITODD':
            return 'Odd';
        case 'DIGITMATCH':
            return `Match${b}`;
        case 'DIGITDIFF':
            return `Diff${b}`;
        case 'CALL':
            return 'Rise';
        case 'PUT':
            return 'Fall';
        case 'CALLE':
            return `Higher${b}`;
        case 'PUTE':
            return `Lower${b}`;
        case 'ONETOUCH':
            return `Touch${b}`;
        case 'NOTOUCH':
            return `No Touch${b}`;
        default:
            return ct || 'Trade';
    }
}

function computeStats(transactions: TabTransactionRecord[]): TabSessionStats {
    let totalStake = 0;
    let totalPayout = 0;
    let won = 0;
    let lost = 0;
    let totalProfit = 0;
    let currency = 'USD';

    for (const tx of transactions) {
        if (tx.currency) currency = tx.currency;
        totalStake += Number(tx.buyPrice || 0);
        if (tx.isCompleted) {
            const pl = Number(tx.profit || 0);
            totalProfit += pl;
            if (pl > 0) {
                won += 1;
                totalPayout += Number(tx.buyPrice || 0) + pl;
            } else if (pl < 0) {
                lost += 1;
            }
        }
    }

    return {
        totalStake,
        totalPayout,
        runs: transactions.length,
        won,
        lost,
        totalProfit,
        currency,
    };
}

class IsolatedTabTradeStore {
    private namespace: TabRecordNamespace;
    private journalKey: string;
    private txKey: string;
    private listeners = new Set<() => void>();
    private snapshot: TabTradeSnapshot;
    private recoveringIds = new Set<number>();

    constructor(namespace: TabRecordNamespace) {
        this.namespace = namespace;
        this.journalKey = `tp_record_${namespace}_journal_v1`;
        this.txKey = `tp_record_${namespace}_tx_v1`;
        const journal = this.readStorage<TabJournalEntry[]>(this.journalKey, []);
        const transactions = this.readStorage<TabTransactionRecord[]>(this.txKey, []);
        this.snapshot = {
            journal,
            transactions,
            stats: computeStats(transactions),
        };
    }

    private readStorage<T>(key: string, fallback: T): T {
        if (typeof window === 'undefined') return fallback;
        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return fallback;
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as unknown as T) : fallback;
        } catch {
            return fallback;
        }
    }

    private persist() {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(this.journalKey, JSON.stringify(this.snapshot.journal));
            window.localStorage.setItem(this.txKey, JSON.stringify(this.snapshot.transactions));
        } catch {
            // ignore storage quota errors
        }
    }

    private emit() {
        this.snapshot = {
            journal: this.snapshot.journal,
            transactions: this.snapshot.transactions,
            stats: computeStats(this.snapshot.transactions),
        };
        this.persist();
        this.listeners.forEach(fn => fn());
    }

    getSnapshot = (): TabTradeSnapshot => this.snapshot;

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };

    appendJournal = (entry: Omit<TabJournalEntry, 'id' | 'timestamp'> & { timestamp?: number }) => {
        const nextEntry: TabJournalEntry = {
            id: `${this.namespace}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            timestamp: entry.timestamp ?? Date.now(),
            type: entry.type,
            message: entry.message,
            amount: entry.amount,
            currency: entry.currency,
            contractId: entry.contractId,
            transactionId: entry.transactionId,
        };
        this.snapshot = {
            ...this.snapshot,
            journal: [nextEntry, ...this.snapshot.journal].slice(0, MAX_JOURNAL_ITEMS),
        };
        this.emit();
    };

    upsertTransaction = (tx: TabTransactionRecord) => {
        const existingIdx = this.snapshot.transactions.findIndex(
            item => item.contractId === tx.contractId || item.buyTransactionId === tx.buyTransactionId
        );
        let nextTxList: TabTransactionRecord[];
        if (existingIdx >= 0) {
            nextTxList = this.snapshot.transactions.map((item, idx) =>
                idx === existingIdx ? { ...item, ...tx } : item
            );
        } else {
            nextTxList = [tx, ...this.snapshot.transactions].slice(0, MAX_TRANSACTION_ITEMS);
        }
        this.snapshot = {
            ...this.snapshot,
            transactions: nextTxList,
        };
        this.emit();
    };

    reset = () => {
        this.snapshot = {
            journal: [],
            transactions: [],
            stats: computeStats([]),
        };
        this.emit();
    };

    recoverOpenContracts = async () => {
        const openOnes = this.snapshot.transactions.filter(tx => !tx.isCompleted && tx.contractId);
        if (!openOnes.length) return;
        const transport: any = api_base?.api?.send ? api_base.api : chart_api?.api;
        if (!transport?.send) return;

        for (const openTx of openOnes) {
            if (this.recoveringIds.has(openTx.contractId)) continue;
            this.recoveringIds.add(openTx.contractId);
            try {
                const res = await transport.send({
                    proposal_open_contract: 1,
                    contract_id: openTx.contractId,
                });
                const poc = res?.proposal_open_contract;
                if (!poc) continue;
                const statusStr = String(poc.status || (poc.is_sold ? 'sold' : 'open')) as TabTransactionRecord['status'];
                const isDone = TERMINAL_SET.has(statusStr) || Boolean(poc.is_sold) || Boolean(poc.is_expired);
                const finalProfit = Number(poc.profit ?? openTx.profit ?? 0);

                this.upsertTransaction({
                    ...openTx,
                    buyPrice: Number(poc.buy_price ?? openTx.buyPrice),
                    bidPrice: Number(poc.bid_price ?? openTx.bidPrice),
                    payout: Number(poc.payout ?? openTx.payout),
                    profit: finalProfit,
                    entrySpot:
                        poc.entry_spot_display_value ??
                        poc.entry_tick_display_value ??
                        poc.entry_spot ??
                        openTx.entrySpot,
                    exitSpot:
                        poc.exit_spot_display_value ??
                        poc.exit_tick_display_value ??
                        poc.exit_spot ??
                        openTx.exitSpot,
                    sellTransactionId: poc.transaction_ids?.sell ?? openTx.sellTransactionId,
                    status: isDone ? (finalProfit > 0 ? 'won' : finalProfit < 0 ? 'lost' : statusStr) : 'open',
                    isCompleted: isDone,
                });

                if (isDone) {
                    const alreadyLogged = this.snapshot.journal.some(
                        j => j.contractId === openTx.contractId && (j.type === 'profit' || j.type === 'loss')
                    );
                    if (!alreadyLogged) {
                        this.appendJournal({
                            type: finalProfit >= 0 ? 'profit' : 'loss',
                            message:
                                finalProfit >= 0
                                    ? `Contract won (${openTx.shortLabel} · ${openTx.symbol})`
                                    : `Contract lost (${openTx.shortLabel} · ${openTx.symbol})`,
                            amount: finalProfit,
                            currency: poc.currency || openTx.currency,
                            contractId: openTx.contractId,
                        });
                    }
                }
            } catch {
                // ignore transient network errors
            } finally {
                this.recoveringIds.delete(openTx.contractId);
            }
        }
    };

    exportCsv = () => {
        if (typeof window === 'undefined' || !this.snapshot.transactions.length) return;
        const headers = [
            'Timestamp',
            'Market',
            'Type',
            'Contract ID',
            'Buy Tx ID',
            'Sell Tx ID',
            'Entry Spot',
            'Exit Spot',
            'Buy Price',
            'Profit/Loss',
            'Currency',
            'Status',
            'Description',
        ];
        const escapeCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const lines = [
            headers.join(','),
            ...this.snapshot.transactions.map(tx =>
                [
                    new Date(tx.timestamp).toISOString(),
                    tx.symbol,
                    tx.shortLabel,
                    tx.contractId,
                    tx.buyTransactionId,
                    tx.sellTransactionId ?? '',
                    tx.entrySpot ?? '',
                    tx.exitSpot ?? '',
                    tx.buyPrice.toFixed(2),
                    tx.profit.toFixed(2),
                    tx.currency,
                    tx.status.toUpperCase(),
                    tx.longcode,
                ]
                    .map(escapeCell)
                    .join(',')
            ),
        ];
        const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `traderspulse-${this.namespace}-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };
}

const STORES: Partial<Record<TabRecordNamespace, IsolatedTabTradeStore>> = {};

export function getTabTradeStore(namespace: TabRecordNamespace): IsolatedTabTradeStore {
    if (!STORES[namespace]) {
        STORES[namespace] = new IsolatedTabTradeStore(namespace);
    }
    return STORES[namespace]!;
}

export function useTabTradeRecord(namespace: TabRecordNamespace) {
    const store = getTabTradeStore(namespace);
    const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
    return {
        ...snapshot,
        reset: store.reset,
        exportCsv: store.exportCsv,
        recoverOpenContracts: store.recoverOpenContracts,
        appendJournal: store.appendJournal,
    };
}
