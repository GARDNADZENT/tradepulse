import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Scanner } from '@/components/makoti-widget/scanner';
import { MarketKiller } from '@/components/makoti-widget/market-killer';
import { OverUnderKiller } from '@/components/makoti-widget/over-under-killer';
import { HighLow } from '@/components/makoti-widget/high-low';
import { UnderUnderMarket } from '@/components/makoti-widget/under-under-market';
import { DiffersAuto } from '@/components/makoti-widget/differs-auto';
import { ALL_SYMBOLS } from '@/components/makoti-widget/makoti-ws';
import './auto-trades.scss';
import '@/components/makoti-widget/makoti-widget.scss';

type Tab = 'scanner' | 'market_killer' | 'over_under' | 'high_low' | 'under_under_market' | 'differs_auto';
const TRADING_TABS: Tab[] = ['market_killer', 'over_under', 'high_low', 'under_under_market', 'differs_auto'];

const TAB_OPTIONS: { value: Tab; label: string }[] = [
    { value: 'scanner', label: 'Scanner' },
    { value: 'market_killer', label: 'Market Killer' },
    { value: 'over_under', label: 'O/U Killer' },
    { value: 'high_low', label: 'HIGH/LOW' },
    { value: 'under_under_market', label: 'UNDER/UNDER MARKET' },
    { value: 'differs_auto', label: 'DIFFERS AUTO' },
];

function isLoggedIn(): boolean {
    try {
        const activeLoginId = localStorage.getItem('active_loginid');
        if (activeLoginId) return true;
        const clientAccounts = JSON.parse(localStorage.getItem('client.accounts') ?? '{}');
        return Object.keys(clientAccounts).length > 0;
    } catch {
        return false;
    }
}

const AutoTrades: React.FC = () => {
    const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('mw_tab') as Tab) || 'scanner');
    const [loggedIn, setLoggedIn] = useState(isLoggedIn());
    const [wsReady, setWsReady] = useState(false);
    const [tabOpen, setTabOpen] = useState(false);
    const tabDropRef = useRef<HTMLDivElement>(null);
    const subscribedRef = useRef(false);

    useEffect(() => {
        const check = () => setLoggedIn(isLoggedIn());
        const interval = setInterval(check, 1000);
        window.addEventListener('storage', check);
        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', check);
        };
    }, []);

    useEffect(() => {
        const check = () => {
            const ready = window._newSystemWS?.readyState === WebSocket.OPEN;
            setWsReady(ready);
        };
        check();
        const i = setInterval(check, 1000);
        window.addEventListener('storage', check);
        return () => {
            clearInterval(i);
            window.removeEventListener('storage', check);
        };
    }, []);

    useEffect(() => {
        if (TRADING_TABS.includes(tab) && window._newSystemWS?.readyState === WebSocket.OPEN && !subscribedRef.current) {
            subscribedRef.current = true;
            ALL_SYMBOLS.forEach(sym => {
                window._newSystemWS.send(
                    JSON.stringify({ ticks_history: sym, style: 'ticks', count: 1, end: 'latest', subscribe: 1 })
                );
            });
        }
        if (tab === 'scanner') {
            subscribedRef.current = false;
        }
    }, [tab]);

    useEffect(() => {
        if (!tabOpen) return;
        const handler = (e: MouseEvent) => {
            if (tabDropRef.current && !tabDropRef.current.contains(e.target as Node)) {
                setTabOpen(false);
            }
        };
        document.addEventListener('pointerdown', handler);
        return () => document.removeEventListener('pointerdown', handler);
    }, [tabOpen]);

    useEffect(() => {
        localStorage.setItem('mw_tab', tab);
    }, [tab]);

    const switchToTab = useCallback((t: Tab) => {
        setTab(t);
        localStorage.setItem('mw_tab', t);
    }, []);

    useEffect(() => {
        window.DBot = window.DBot || {};
        window.DBot.__switchToTab = switchToTab;
        return () => {
            if (window.DBot) delete window.DBot.__switchToTab;
        };
    }, [switchToTab]);

    if (!loggedIn) return null;

    return (
        <div className='auto-trades'>
            <div className='auto-trades__header'>
                <h1 className='auto-trades__title'>Auto Trades</h1>
                <p className='auto-trades__subtitle'>Automated trading workspace</p>
                <div className={`auto-trades__status ${wsReady ? 'auto-trades__status--connected' : 'auto-trades__status--disconnected'}`}>
                    {wsReady ? '● Connected — tick data streaming' : '○ Connecting to Deriv API…'}
                </div>
            </div>

            <div className='auto-trades__tabs'>
                {TAB_OPTIONS.map(opt => (
                    <button
                        key={opt.value}
                        className={`auto-trades__tab ${tab === opt.value ? 'auto-trades__tab--active' : ''}`}
                        onClick={() => { setTab(opt.value); setTabOpen(false); }}
                    >
                        {opt.label}
                    </button>
                ))}
            </div>

            <div className='auto-trades__body'>
                {tab !== 'scanner' && (
                    <div className={`auto-trades__preconnect ${wsReady ? 'auto-trades__preconnect--ok' : ''}`}>
                        {wsReady
                            ? '● Connected — tick data streaming'
                            : '○ Connecting to Deriv API…'}
                    </div>
                )}
                {tab === 'scanner' && <Scanner />}
                {tab === 'market_killer' && <MarketKiller />}
                {tab === 'over_under' && <OverUnderKiller />}
                {tab === 'high_low' && <HighLow />}
                {tab === 'under_under_market' && <UnderUnderMarket />}
                {tab === 'differs_auto' && <DiffersAuto />}
            </div>
        </div>
    );
};

export default AutoTrades;
