// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { TradePulseProvider, useTradePulse } from './TradePulseContext';
import MyJourney from './components/MyJourney';
import MasterSchedule from './components/MasterSchedule';
import Performance from './components/Performance';
import AccountInfo from './components/AccountInfo';
import { localize } from '@deriv-com/translations';
import './tradepulse.scss';

const TradePulseApp = () => {
    const [activeTab, setActiveTab] = useState('journey');

    const { isLoggedIn, currentAccount } = useTradePulse();

    useEffect(() => {
        const onHashChange = () => {
            const hash = window.location.hash.replace('#', '');
            if (['journey', 'schedule', 'performance', 'account'].includes(hash)) {
                setActiveTab(hash);
            }
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    const renderView = () => {
        switch (activeTab) {
            case 'schedule': return <MasterSchedule />;
            case 'performance': return <Performance />;
            case 'account': return <AccountInfo />;
            case 'journey':
            default: return <MyJourney />;
        }
    };

    return (
        <div className='tradepulse'>
            {/* TradePulse Header */}
            <header className='tradepulse__header'>
                <div className='tradepulse__header-inner'>
                    <div className='tradepulse__logo'>
                        <div className='tradepulse__logo-icon'>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                        </div>
                        <div className='tradepulse__logo-text'>
                            <div className='tradepulse__logo-name'>TradePulse</div>
                            <div className='tradepulse__logo-tag'>Plan. Track. Perform.</div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Sub Navigation */}
            <nav className='tradepulse__subnav'>
                <button className={`tradepulse__subnav-btn${activeTab === 'journey' ? ' tradepulse__subnav-btn--active' : ''}`} onClick={() => { setActiveTab('journey'); window.location.hash = 'journey'; }}>
                    {localize('My Journey')}
                </button>
                <button className={`tradepulse__subnav-btn${activeTab === 'schedule' ? ' tradepulse__subnav-btn--active' : ''}`} onClick={() => { setActiveTab('schedule'); window.location.hash = 'schedule'; }}>
                    {localize('Master Schedule')}
                </button>
                <button className={`tradepulse__subnav-btn${activeTab === 'performance' ? ' tradepulse__subnav-btn--active' : ''}`} onClick={() => { setActiveTab('performance'); window.location.hash = 'performance'; }}>
                    {localize('Performance')}
                </button>
                <button className={`tradepulse__subnav-btn${activeTab === 'account' ? ' tradepulse__subnav-btn--active' : ''}`} onClick={() => { setActiveTab('account'); window.location.hash = 'account'; }}>
                    {localize('Account')}
                </button>
            </nav>

            {/* Main Content */}
            <main className='tradepulse__main'>
                {renderView()}
            </main>
        </div>
    );
};

const TradePulse = () => {
    return (
        <TradePulseProvider>
            <TradePulseApp />
        </TradePulseProvider>
    );
};

export default TradePulse;
