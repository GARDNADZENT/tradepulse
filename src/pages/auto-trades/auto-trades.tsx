import React, { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { Scanner } from '@/components/makoti-widget/scanner';
import { MarketKiller } from '@/components/makoti-widget/market-killer';
import { OverUnderKiller } from '@/components/makoti-widget/over-under-killer';
import { HighLow } from '@/components/makoti-widget/high-low';
import { UnderUnderMarket } from '@/components/makoti-widget/under-under-market';
import { DiffersAuto } from '@/components/makoti-widget/differs-auto';
import { ALL_SYMBOLS } from '@/components/makoti-widget/makoti-ws';
import './auto-trades.scss';

type Tab = 'scanner' | 'market_killer' | 'over_under' | 'high_low' | 'under_under_market' | 'differs_auto';
const TRADING_TABS: Tab[] = ['market_killer', 'over_under', 'high_low', 'under_under_market', 'differs_auto'];

const TAB_OPTIONS: { value: Tab; label: string }[] = [
    { value: 'scanner', label: 'Scanner' },
    { value: 'market_killer', label: 'Market Killer' },
    { value: 'over_under', label: 'O/U Killer' },
    { value: 'high_low', label: 'High / Low' },
    { value: 'under_under_market', label: 'Under / Under' },
    { value: 'differs_auto', label: 'Differs Auto' },
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

const AutoTrades: React.FC = observer(() => {
    const store = useStore();
    const client = store?.client;

    const [tab, setTab] = useState<Tab>(() => (localStorage.getItem('mw_tab') as Tab) || 'scanner');
    const [loggedIn, setLoggedIn] = useState(isLoggedIn());
    const [wsReady, setWsReady] = useState(false);
    const [tabOpen, setTabOpen] = useState(false);
    const tabDropRef = useRef<HTMLDivElement>(null);
    const subscribedRef = useRef(false);

    const loginid = client?.loginid || localStorage.getItem('active_loginid') || '';
    const currency = client?.currency || 'USD';
    const rawBalance = client?.balance ? parseFloat(String(client.balance)) : 0;
    const isVirtual = Boolean(client?.is_virtual ?? loginid.startsWith('VR'));

    useEffect(() => {
        const check = () => setLoggedIn(isLoggedIn() || Boolean(client?.is_logged_in));
        check();
        const interval = setInterval(check, 1000);
        window.addEventListener('storage', check);
        return () => {
            clearInterval(interval);
            window.removeEventListener('storage', check);
        };
    }, [client?.is_logged_in]);

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

    if (!loggedIn && !loginid) return null;

    const formattedBalance = `${currency} ${Number(rawBalance || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

    return (
        <div className='auto-trades'>
            {/* Clean Frosted-White Top Pill Bar — No Inner Logo or Redundant Title */}
            <header className='auto-trades__topbar'>
                <div className='auto-trades__topbar-inner'>
                    <nav className='auto-trades__pills' aria-label='Auto Trades strategies'>
                        {TAB_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                type='button'
                                className={`auto-trades__pill${tab === opt.value ? ' auto-trades__pill--active' : ''}`}
                                onClick={() => {
                                    setTab(opt.value);
                                    setTabOpen(false);
                                }}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </nav>

                    <div className='auto-trades__topbar-right'>
                        <div className={`auto-trades__live-pill${wsReady ? ' auto-trades__live-pill--on' : ''}`}>
                            <span className='auto-trades__live-dot' />
                            <span>{wsReady ? 'Live • Streaming' : 'Connecting…'}</span>
                        </div>

                        {loginid && (
                            <div className='auto-trades__acct-chip'>
                                <span className={`auto-trades__acct-type ${!isVirtual ? 'auto-trades__acct-type--real' : 'auto-trades__acct-type--demo'}`}>
                                    {!isVirtual ? 'REAL' : 'DEMO'}
                                </span>
                                <span className='auto-trades__acct-sep'>•</span>
                                <span className='auto-trades__acct-id'>{loginid}</span>
                                <span className='auto-trades__acct-sep auto-trades__acct-sep--accent'>•</span>
                                <span className='auto-trades__acct-bal'>{formattedBalance}</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            <main className='auto-trades__main'>
                {tab === 'scanner' && <Scanner />}
                {tab === 'market_killer' && <MarketKiller />}
                {tab === 'over_under' && <OverUnderKiller />}
                {tab === 'high_low' && <HighLow />}
                {tab === 'under_under_market' && <UnderUnderMarket />}
                {tab === 'differs_auto' && <DiffersAuto />}
            </main>
        </div>
    );
});

export default AutoTrades;
