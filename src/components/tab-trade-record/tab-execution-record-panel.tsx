import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import {
    TabJournalEntry,
    TabRecordNamespace,
    TabTransactionRecord,
    useTabTradeRecord,
} from './tab-trade-store';
import './tab-execution-record-panel.scss';

export type RecordTabKey = 'summary' | 'transactions' | 'journal';

interface TabExecutionRecordPanelProps {
    namespace: TabRecordNamespace;
    title: string;
    previewTitle: string;
    resetLabel: string;
    emptyHint: string;
    variant: 'dtrader' | 'analysis';
    activeTab?: RecordTabKey;
    onActiveTabChange?: (tab: RecordTabKey) => void;
    isOpen?: boolean;
    onToggleOpen?: (open: boolean) => void;
    currencyFallback?: string;
}

function formatClock(ts: number): string {
    try {
        const d = new Date(ts);
        return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return '';
    }
}

function formatMoney(val: number, signed = false): string {
    const n = Number(val || 0);
    if (!Number.isFinite(n)) return '0.00';
    if (signed && n !== 0) {
        return `${n > 0 ? '+' : '-'}${Math.abs(n).toFixed(2)}`;
    }
    return n.toFixed(2);
}

export const TabExecutionRecordPanel: React.FC<TabExecutionRecordPanelProps> = ({
    namespace,
    title,
    previewTitle,
    resetLabel,
    emptyHint,
    variant,
    activeTab: controlledTab,
    onActiveTabChange,
    isOpen = true,
    onToggleOpen,
    currencyFallback = 'USD',
}) => {
    const { journal, transactions, stats, reset, exportCsv, recoverOpenContracts } = useTabTradeRecord(namespace);
    const [internalTab, setInternalTab] = useState<RecordTabKey>('journal');
    const [journalFilter, setJournalFilter] = useState<'all' | 'trades' | 'outcomes'>('all');
    const [expandedContractId, setExpandedContractId] = useState<number | null>(null);

    const activeTab = controlledTab ?? internalTab;
    const setActiveTab = (tab: RecordTabKey) => {
        setInternalTab(tab);
        onActiveTabChange?.(tab);
    };

    useEffect(() => {
        void recoverOpenContracts();
    }, [recoverOpenContracts]);

    const activeCurrency = stats.currency || currencyFallback || 'USD';
    const previewRows = transactions.slice(0, 4);
    const latestTx = transactions[0] || null;
    const isResetDisabled = journal.length === 0 && transactions.length === 0;

    const filteredJournal: TabJournalEntry[] = journal.filter(item => {
        if (journalFilter === 'trades') return item.type === 'purchase';
        if (journalFilter === 'outcomes') return item.type === 'profit' || item.type === 'loss';
        return true;
    });

    if (!isOpen) {
        return (
            <aside className={classNames('tp-rec-rail', `tp-rec-rail--${variant}`)}>
                <button
                    type='button'
                    className='tp-rec-rail__expand'
                    onClick={() => onToggleOpen?.(true)}
                    title={`Open ${title}`}
                >
                    <span>‹</span>
                    <strong>{title}</strong>
                    {transactions.length > 0 && <em>{transactions.length}</em>}
                </button>
            </aside>
        );
    }

    return (
        <aside className={classNames('tp-rec-panel', `tp-rec-panel--${variant}`)}>
            <div className='tp-rec-panel__header'>
                <div className='tp-rec-panel__header-title'>
                    <span className='tp-rec-panel__dot' />
                    <strong>{title}</strong>
                </div>
                <div className='tp-rec-panel__header-actions'>
                    {transactions.length > 0 && (
                        <button
                            type='button'
                            className='tp-rec-panel__icon-btn'
                            onClick={exportCsv}
                            title='Download CSV transactions record'
                        >
                            CSV ↓
                        </button>
                    )}
                    {onToggleOpen && (
                        <button
                            type='button'
                            className='tp-rec-panel__icon-btn'
                            onClick={() => onToggleOpen(false)}
                            title={`Collapse ${title}`}
                        >
                            ›
                        </button>
                    )}
                </div>
            </div>

            {variant === 'analysis' ? (
                <div className='tp-rec-panel__stack-tabs' role='tablist'>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={activeTab === 'summary'}
                        className={classNames('tp-rec-panel__stack-tab', {
                            'is-active': activeTab === 'summary',
                        })}
                        onClick={() => setActiveTab('summary')}
                    >
                        <span>Summary</span>
                        <i>›</i>
                    </button>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={activeTab === 'transactions'}
                        className={classNames('tp-rec-panel__stack-tab', {
                            'is-active': activeTab === 'transactions',
                        })}
                        onClick={() => setActiveTab('transactions')}
                    >
                        <span>
                            Transactions {transactions.length > 0 ? `(${transactions.length})` : ''}
                        </span>
                        <i>›</i>
                    </button>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={activeTab === 'journal'}
                        className={classNames('tp-rec-panel__stack-tab', {
                            'is-active': activeTab === 'journal',
                        })}
                        onClick={() => setActiveTab('journal')}
                    >
                        <span>Journal</span>
                        <i>›</i>
                    </button>
                </div>
            ) : (
                <div className='tp-rec-panel__bar-tabs' role='tablist'>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={activeTab === 'summary'}
                        className={classNames('tp-rec-panel__bar-tab', {
                            'is-active': activeTab === 'summary',
                        })}
                        onClick={() => setActiveTab('summary')}
                    >
                        Summary
                    </button>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={activeTab === 'transactions'}
                        className={classNames('tp-rec-panel__bar-tab', {
                            'is-active': activeTab === 'transactions',
                        })}
                        onClick={() => setActiveTab('transactions')}
                    >
                        <span>Transactions</span>
                        {transactions.length > 0 && <em>{transactions.length}</em>}
                    </button>
                    <button
                        type='button'
                        role='tab'
                        aria-selected={activeTab === 'journal'}
                        className={classNames('tp-rec-panel__bar-tab', {
                            'is-active': activeTab === 'journal',
                        })}
                        onClick={() => setActiveTab('journal')}
                    >
                        Journal
                    </button>
                </div>
            )}

            <div className='tp-rec-panel__body'>
                {activeTab === 'journal' && (
                    <div className='tp-rec-journal'>
                        <div className='tp-rec-journal__toolbar'>
                            <div className='tp-rec-journal__filters'>
                                <button
                                    type='button'
                                    className={journalFilter === 'all' ? 'is-active' : ''}
                                    onClick={() => setJournalFilter('all')}
                                >
                                    All ({journal.length})
                                </button>
                                <button
                                    type='button'
                                    className={journalFilter === 'trades' ? 'is-active' : ''}
                                    onClick={() => setJournalFilter('trades')}
                                >
                                    Bought
                                </button>
                                <button
                                    type='button'
                                    className={journalFilter === 'outcomes' ? 'is-active' : ''}
                                    onClick={() => setJournalFilter('outcomes')}
                                >
                                    P/L
                                </button>
                            </div>
                        </div>

                        <div className='tp-rec-journal__stream'>
                            {filteredJournal.length === 0 ? (
                                <div className='tp-rec-empty'>
                                    <strong>No Journal Entries Yet</strong>
                                    <p>{emptyHint}</p>
                                </div>
                            ) : (
                                filteredJournal.map(entry => {
                                    const pairedTx =
                                        entry.type === 'purchase' && entry.contractId
                                            ? transactions.find(t => t.contractId === entry.contractId)
                                            : undefined;
                                    return (
                                        <div
                                            key={entry.id}
                                            className={classNames('tp-rec-journal__item', `is-${entry.type}`)}
                                        >
                                            <div className='tp-rec-journal__item-top'>
                                                <span className='tp-rec-journal__badge'>
                                                    {entry.type === 'purchase'
                                                        ? '✓'
                                                        : entry.type === 'profit'
                                                          ? '▲'
                                                          : entry.type === 'loss'
                                                            ? '▼'
                                                            : '•'}
                                                </span>
                                                <div className='tp-rec-journal__msg'>{entry.message}</div>
                                                {entry.type === 'purchase' && pairedTx?.isCompleted && (
                                                    <span
                                                        className={classNames('tp-rec-journal__inline-pl', {
                                                            'is-pos': pairedTx.profit > 0,
                                                            'is-neg': pairedTx.profit < 0,
                                                        })}
                                                    >
                                                        {formatMoney(pairedTx.profit, true)} {pairedTx.currency}
                                                    </span>
                                                )}
                                                {(entry.type === 'profit' || entry.type === 'loss') &&
                                                    entry.amount !== undefined && (
                                                        <span
                                                            className={classNames('tp-rec-journal__inline-pl', {
                                                                'is-pos': entry.amount >= 0,
                                                                'is-neg': entry.amount < 0,
                                                            })}
                                                        >
                                                            {formatMoney(entry.amount, true)}{' '}
                                                            {entry.currency || activeCurrency}
                                                        </span>
                                                    )}
                                            </div>
                                            <div className='tp-rec-journal__meta'>
                                                <span>{formatClock(entry.timestamp)}</span>
                                                {entry.transactionId ? (
                                                    <span>ID: {entry.transactionId}</span>
                                                ) : entry.contractId ? (
                                                    <span>#{entry.contractId}</span>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {previewRows.length > 0 && (
                            <div className='tp-rec-preview'>
                                <div className='tp-rec-preview__head'>
                                    <strong>{previewTitle}</strong>
                                    <button type='button' onClick={() => setActiveTab('transactions')}>
                                        View All ({transactions.length}) ›
                                    </button>
                                </div>
                                <div className='tp-rec-preview__cols'>
                                    <span>Type</span>
                                    <span>Entry/Exit</span>
                                    <span>Buy price</span>
                                    <span>Profit/Loss</span>
                                </div>
                                <div className='tp-rec-preview__rows'>
                                    {previewRows.map(tx => (
                                        <button
                                            key={tx.contractId}
                                            type='button'
                                            className='tp-rec-preview__row'
                                            onClick={() => {
                                                setExpandedContractId(tx.contractId);
                                                setActiveTab('transactions');
                                            }}
                                            title={tx.longcode}
                                        >
                                            <span className='tp-rec-preview__type'>
                                                <b>{tx.shortLabel}</b>
                                                <small>{tx.symbol}</small>
                                            </span>
                                            <span className='tp-rec-preview__spots'>
                                                <span>{tx.entrySpot ?? '—'}</span>
                                                <small>{tx.exitSpot ?? (tx.isCompleted ? '—' : '…')}</small>
                                            </span>
                                            <span className='tp-rec-preview__buy'>
                                                {tx.buyPrice.toFixed(2)} <small>{tx.currency}</small>
                                            </span>
                                            <span
                                                className={classNames('tp-rec-preview__pl', {
                                                    'is-pos': tx.isCompleted && tx.profit > 0,
                                                    'is-neg': tx.isCompleted && tx.profit < 0,
                                                    'is-open': !tx.isCompleted,
                                                })}
                                            >
                                                {!tx.isCompleted
                                                    ? 'OPEN'
                                                    : `${formatMoney(tx.profit, true)} ${tx.currency}`}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'transactions' && (
                    <div className='tp-rec-tx'>
                        <div className='tp-rec-tx__head'>
                            <span>Type / Market</span>
                            <span>Entry / Exit</span>
                            <span>Buy</span>
                            <span>Profit/Loss</span>
                        </div>
                        <div className='tp-rec-tx__list'>
                            {transactions.length === 0 ? (
                                <div className='tp-rec-empty'>
                                    <strong>No Transactions Recorded</strong>
                                    <p>{emptyHint}</p>
                                </div>
                            ) : (
                                transactions.map((tx: TabTransactionRecord) => {
                                    const isExpanded = expandedContractId === tx.contractId;
                                    return (
                                        <div key={tx.contractId} className='tp-rec-tx__card'>
                                            <button
                                                type='button'
                                                className='tp-rec-tx__row'
                                                onClick={() =>
                                                    setExpandedContractId(isExpanded ? null : tx.contractId)
                                                }
                                            >
                                                <span className='tp-rec-preview__type'>
                                                    <b>{tx.shortLabel}</b>
                                                    <small>
                                                        {tx.symbol} · {formatClock(tx.timestamp)}
                                                    </small>
                                                </span>
                                                <span className='tp-rec-preview__spots'>
                                                    <span>{tx.entrySpot ?? '—'}</span>
                                                    <small>{tx.exitSpot ?? (tx.isCompleted ? '—' : '…')}</small>
                                                </span>
                                                <span className='tp-rec-preview__buy'>
                                                    {tx.buyPrice.toFixed(2)} <small>{tx.currency}</small>
                                                </span>
                                                <span
                                                    className={classNames('tp-rec-preview__pl', {
                                                        'is-pos': tx.isCompleted && tx.profit > 0,
                                                        'is-neg': tx.isCompleted && tx.profit < 0,
                                                        'is-open': !tx.isCompleted,
                                                    })}
                                                >
                                                    {!tx.isCompleted
                                                        ? 'OPEN'
                                                        : `${formatMoney(tx.profit, true)} ${tx.currency}`}
                                                </span>
                                            </button>
                                            {isExpanded && (
                                                <div className='tp-rec-tx__details'>
                                                    <p>{tx.longcode}</p>
                                                    <div className='tp-rec-tx__detail-grid'>
                                                        <div>
                                                            <small>Contract ID</small>
                                                            <b>#{tx.contractId}</b>
                                                        </div>
                                                        <div>
                                                            <small>Buy Reference</small>
                                                            <b>{tx.buyTransactionId}</b>
                                                        </div>
                                                        <div>
                                                            <small>Sell Reference</small>
                                                            <b>{tx.sellTransactionId ?? '—'}</b>
                                                        </div>
                                                        <div>
                                                            <small>Payout Limit</small>
                                                            <b>
                                                                {tx.payout.toFixed(2)} {tx.currency}
                                                            </b>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'summary' && (
                    <div className='tp-rec-summary'>
                        {latestTx ? (
                            <div className='tp-rec-summary__latest'>
                                <div className='tp-rec-summary__latest-head'>
                                    <div>
                                        <small>{latestTx.displayName}</small>
                                        <strong>
                                            {latestTx.shortLabel} · #{latestTx.contractId}
                                        </strong>
                                    </div>
                                    <span
                                        className={classNames('tp-rec-summary__status', {
                                            'is-open': !latestTx.isCompleted,
                                            'is-pos': latestTx.isCompleted && latestTx.profit > 0,
                                            'is-neg': latestTx.isCompleted && latestTx.profit < 0,
                                        })}
                                    >
                                        {!latestTx.isCompleted ? 'OPEN' : latestTx.status.toUpperCase()}
                                    </span>
                                </div>
                                <p className='tp-rec-summary__longcode'>{latestTx.longcode}</p>
                                <div className='tp-rec-summary__contract-grid'>
                                    <div>
                                        <small>Entry Spot</small>
                                        <b>{latestTx.entrySpot ?? '—'}</b>
                                    </div>
                                    <div>
                                        <small>Exit Spot</small>
                                        <b>{latestTx.exitSpot ?? (latestTx.isCompleted ? '—' : '…')}</b>
                                    </div>
                                    <div>
                                        <small>Buy Price</small>
                                        <b>
                                            {latestTx.buyPrice.toFixed(2)} {latestTx.currency}
                                        </b>
                                    </div>
                                    <div>
                                        <small>Profit / Loss</small>
                                        <b
                                            className={classNames({
                                                'is-pos': latestTx.profit > 0,
                                                'is-neg': latestTx.profit < 0,
                                            })}
                                        >
                                            {formatMoney(latestTx.profit, true)} {latestTx.currency}
                                        </b>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className='tp-rec-empty'>
                                <strong>No Active Contract Summary</strong>
                                <p>{emptyHint}</p>
                            </div>
                        )}

                        <div className='tp-rec-summary__tiles'>
                            <div>
                                <small>Total Stake</small>
                                <b>
                                    {formatMoney(stats.totalStake)} {activeCurrency}
                                </b>
                            </div>
                            <div>
                                <small>Total Payout</small>
                                <b>
                                    {formatMoney(stats.totalPayout)} {activeCurrency}
                                </b>
                            </div>
                            <div>
                                <small>No. of Runs</small>
                                <b>{stats.runs}</b>
                            </div>
                            <div>
                                <small>Contracts Won</small>
                                <b className='is-pos'>{stats.won}</b>
                            </div>
                            <div>
                                <small>Contracts Lost</small>
                                <b className='is-neg'>{stats.lost}</b>
                            </div>
                            <div>
                                <small>Total P/L</small>
                                <b
                                    className={classNames({
                                        'is-pos': stats.totalProfit > 0,
                                        'is-neg': stats.totalProfit < 0,
                                    })}
                                >
                                    {formatMoney(stats.totalProfit, true)} {activeCurrency}
                                </b>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {variant === 'analysis' && (
                <div className='tp-rec-panel__analysis-footer'>
                    <div className='tp-rec-panel__analysis-footer-top'>
                        <button
                            type='button'
                            className='tp-rec-panel__reset-btn'
                            disabled={isResetDisabled}
                            onClick={reset}
                        >
                            ↻ {resetLabel}
                        </button>
                        <div className='tp-rec-panel__mini-pill'>
                            <small>Stake</small>
                            <b>{formatMoney(stats.totalStake)}</b>
                        </div>
                        <div className='tp-rec-panel__mini-pill'>
                            <small>Payout</small>
                            <b>{formatMoney(stats.totalPayout)}</b>
                        </div>
                    </div>
                    <div className='tp-rec-panel__analysis-footer-stats'>
                        <div>
                            <small>Runs</small>
                            <b>{stats.runs}</b>
                        </div>
                        <div>
                            <small>Won</small>
                            <b className={stats.won > 0 ? 'is-pos' : ''}>{stats.won}</b>
                        </div>
                        <div>
                            <small>Lost</small>
                            <b className={stats.lost > 0 ? 'is-neg' : ''}>{stats.lost}</b>
                        </div>
                        <div>
                            <small>P/L ({activeCurrency})</small>
                            <b
                                className={classNames({
                                    'is-pos': stats.totalProfit > 0,
                                    'is-neg': stats.totalProfit < 0,
                                })}
                            >
                                {formatMoney(stats.totalProfit, true)}
                            </b>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
};

interface TabSessionDockBarProps {
    namespace: TabRecordNamespace;
    resetLabel: string;
    activeTab: RecordTabKey;
    isOpen: boolean;
    onSelectTab: (tab: RecordTabKey) => void;
    currencyFallback?: string;
}

export const TabSessionDockBar: React.FC<TabSessionDockBarProps> = ({
    namespace,
    resetLabel,
    activeTab,
    isOpen,
    onSelectTab,
    currencyFallback = 'USD',
}) => {
    const { journal, transactions, stats, reset } = useTabTradeRecord(namespace);
    const activeCurrency = stats.currency || currencyFallback || 'USD';
    const isResetDisabled = journal.length === 0 && transactions.length === 0;

    return (
        <footer className='tp-tab-dock'>
            <div className='tp-tab-dock__left'>
                <button
                    type='button'
                    className='tp-tab-dock__reset'
                    disabled={isResetDisabled}
                    onClick={reset}
                >
                    ↻ {resetLabel}
                </button>
                <button
                    type='button'
                    className={classNames('tp-tab-dock__tab-pill', {
                        'is-active': isOpen && activeTab === 'journal',
                    })}
                    onClick={() => onSelectTab('journal')}
                >
                    Journal
                    {journal.length > 0 && <em>{journal.length}</em>}
                </button>
                <button
                    type='button'
                    className={classNames('tp-tab-dock__tab-pill', {
                        'is-active': isOpen && activeTab === 'transactions',
                    })}
                    onClick={() => onSelectTab('transactions')}
                >
                    Transactions
                    {transactions.length > 0 && <em>{transactions.length}</em>}
                </button>
                <button
                    type='button'
                    className={classNames('tp-tab-dock__tab-pill', {
                        'is-active': isOpen && activeTab === 'summary',
                    })}
                    onClick={() => onSelectTab('summary')}
                >
                    Summary
                </button>
            </div>

            <div className='tp-tab-dock__stats'>
                <div>
                    <small>Stake</small>
                    <b>{formatMoney(stats.totalStake)}</b>
                </div>
                <div>
                    <small>Payout</small>
                    <b>{formatMoney(stats.totalPayout)}</b>
                </div>
                <div>
                    <small>Runs</small>
                    <b>{stats.runs}</b>
                </div>
                <div>
                    <small>Won</small>
                    <b className={stats.won > 0 ? 'is-pos' : ''}>{stats.won}</b>
                </div>
                <div>
                    <small>Lost</small>
                    <b className={stats.lost > 0 ? 'is-neg' : ''}>{stats.lost}</b>
                </div>
                <div>
                    <small>P/L ({activeCurrency})</small>
                    <b
                        className={classNames({
                            'is-pos': stats.totalProfit > 0,
                            'is-neg': stats.totalProfit < 0,
                        })}
                    >
                        {formatMoney(stats.totalProfit, true)}
                    </b>
                </div>
            </div>
        </footer>
    );
};
