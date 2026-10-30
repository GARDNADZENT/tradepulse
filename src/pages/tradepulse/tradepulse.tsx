// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { useApiBase } from '@/hooks/useApiBase';
import { TradePulseProvider } from './TradePulseContext';
import useTradePulseData from './hooks/useTradePulseData';
import MyJourney from './components/MyJourney';
import MasterSchedule from './components/MasterSchedule';
import Performance from './components/Performance';
import AccountInfo from './components/AccountInfo';
import { localize } from '@deriv-com/translations';
import './tradepulse.scss';

const TradePulseApp = observer(() => {
    const [activeTab, setActiveTab] = useState('journey');
    const store = useStore();
    const { connectionStatus } = useApiBase();
    const { balance, currency, isVirtual } = useTradePulseData();

    const loginid = store?.client?.loginid || '';
    const isConnected = connectionStatus === 'opened' || connectionStatus === 'OPENED' || Boolean(loginid);

    useEffect(() => {
        const syncFromHash = () => {
            const hash = window.location.hash.replace('#', '');
            if (['journey', 'schedule', 'performance', 'account'].includes(hash)) {
                setActiveTab(hash);
            }
        };
        syncFromHash();
        window.addEventListener('hashchange', syncFromHash);
        return () => window.removeEventListener('hashchange', syncFromHash);
    }, []);

    const handleTabSelect = (tab: string) => {
        setActiveTab(tab);
        window.location.hash = tab;
    };

    const renderView = () => {
        switch (activeTab) {
            case 'schedule':
                return <MasterSchedule />;
            case 'performance':
                return <Performance />;
            case 'account':
                return <AccountInfo />;
            case 'journey':
            default:
                return <MyJourney />;
        }
    };

    const formattedBalance = `${currency || 'USD'} ${Number(balance || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

    return (
        <div className='tradepulse'>
            {/* Clean Top Pill Navigation Bar — No Logo, Brand Name, or Tagline */}
            <header className='tradepulse__topbar'>
                <div className='tradepulse__topbar-inner'>
                    <nav className='tradepulse__pills' aria-label='Workspace navigation'>
                        <button
                            type='button'
                            className={`tradepulse__pill${activeTab === 'journey' ? ' tradepulse__pill--active' : ''}`}
                            onClick={() => handleTabSelect('journey')}
                        >
                            {localize('My Journey')}
                        </button>
                        <button
                            type='button'
                            className={`tradepulse__pill${activeTab === 'schedule' ? ' tradepulse__pill--active' : ''}`}
                            onClick={() => handleTabSelect('schedule')}
                        >
                            {localize('Master Schedule')}
                        </button>
                        <button
                            type='button'
                            className={`tradepulse__pill${activeTab === 'performance' ? ' tradepulse__pill--active' : ''}`}
                            onClick={() => handleTabSelect('performance')}
                        >
                            {localize('Performance')}
                        </button>
                        <button
                            type='button'
                            className={`tradepulse__pill${activeTab === 'account' ? ' tradepulse__pill--active' : ''}`}
                            onClick={() => handleTabSelect('account')}
                        >
                            {localize('Account')}
                        </button>
                    </nav>

                    <div className='tradepulse__topbar-right'>
                        <div className={`tradepulse__live-pill${isConnected ? ' tradepulse__live-pill--on' : ''}`}>
                            <span className='tradepulse__live-pill-dot' />
                            <span>{isConnected ? localize('Live') : localize('Offline')}</span>
                        </div>

                        {loginid && (
                            <div className='tradepulse__acct-chip'>
                                <span className={`tradepulse__acct-type ${!isVirtual ? 'tradepulse__acct-type--real' : 'tradepulse__acct-type--demo'}`}>
                                    {!isVirtual ? 'REAL' : 'DEMO'}
                                </span>
                                <span className='tradepulse__acct-sep'>•</span>
                                <span className='tradepulse__acct-id mono'>{loginid}</span>
                                <span className='tradepulse__acct-sep tradepulse__acct-sep--accent'>•</span>
                                <span className='tradepulse__acct-bal mono'>{formattedBalance}</span>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className='tradepulse__main'>
                {renderView()}
            </main>
        </div>
    );
});

const TradePulse = () => {
    return (
        <TradePulseProvider>
            <TradePulseApp />
        </TradePulseProvider>
    );
};

export default TradePulse;
