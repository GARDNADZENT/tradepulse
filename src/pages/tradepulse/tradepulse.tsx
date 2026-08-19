// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { TradePulseProvider } from './TradePulseContext';
import MyJourney from './components/MyJourney';
import MasterSchedule from './components/MasterSchedule';
import Performance from './components/Performance';
import AccountInfo from './components/AccountInfo';
import { localize } from '@deriv-com/translations';
import './tradepulse.scss';

const TradePulseApp = () => {
    const [activeTab, setActiveTab] = useState('journey');

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
            <header className='tradepulse__header'>
                <div className='tradepulse__header-inner'>
                    <div className='tradepulse__logo'>
                        <div className='tradepulse__logo-icon'>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                            </svg>
                        </div>
                        <div className='tradepulse__logo-text'>
                            <div className='tradepulse__logo-name'>TradersPulse</div>
                            <div className='tradepulse__logo-tag'>Capital-First Analytics</div>
                        </div>
                    </div>

                    <div className='tradepulse__spacer'></div>

                    <nav className='tradepulse__desktop-tabs'>
                        <button className={`tradepulse__tab-btn${activeTab === 'journey' ? ' tradepulse__tab-btn--active' : ''}`} onClick={() => { setActiveTab('journey'); window.location.hash = 'journey'; }}>
                            <svg className='tradepulse__tab-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                            </svg>
                            {localize('My Journey')}
                        </button>
                        <button className={`tradepulse__tab-btn${activeTab === 'schedule' ? ' tradepulse__tab-btn--active' : ''}`} onClick={() => { setActiveTab('schedule'); window.location.hash = 'schedule'; }}>
                            <svg className='tradepulse__tab-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            {localize('Master Schedule')}
                        </button>
                        <button className={`tradepulse__tab-btn${activeTab === 'performance' ? ' tradepulse__tab-btn--active' : ''}`} onClick={() => { setActiveTab('performance'); window.location.hash = 'performance'; }}>
                            <svg className='tradepulse__tab-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                            {localize('Performance')}
                        </button>
                        <button className={`tradepulse__tab-btn${activeTab === 'account' ? ' tradepulse__tab-btn--active' : ''}`} onClick={() => { setActiveTab('account'); window.location.hash = 'account'; }}>
                            <svg className='tradepulse__tab-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                                <path d="M3 12v5a2 2 0 0 0 2 2h16v-5"></path>
                                <path d="M18 12a2 2 0 0 1 0 4"></path>
                            </svg>
                            {localize('Account')}
                        </button>
                    </nav>
                </div>
            </header>

            {/* Mobile bottom nav */}
            <nav className='tradepulse__bottom-nav'>
                <button className={`tradepulse__bottom-nav-btn${activeTab === 'journey' ? ' tradepulse__bottom-nav-btn--active' : ''}`} onClick={() => { setActiveTab('journey'); window.location.hash = 'journey'; }}>
                    <svg className='tradepulse__bottom-nav-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                    </svg>
                    {localize('Journey')}
                </button>
                <button className={`tradepulse__bottom-nav-btn${activeTab === 'schedule' ? ' tradepulse__bottom-nav-btn--active' : ''}`} onClick={() => { setActiveTab('schedule'); window.location.hash = 'schedule'; }}>
                    <svg className='tradepulse__bottom-nav-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    {localize('Schedule')}
                </button>
                <button className={`tradepulse__bottom-nav-btn${activeTab === 'performance' ? ' tradepulse__bottom-nav-btn--active' : ''}`} onClick={() => { setActiveTab('performance'); window.location.hash = 'performance'; }}>
                    <svg className='tradepulse__bottom-nav-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="20" x2="18" y2="10"></line>
                        <line x1="12" y1="20" x2="12" y2="4"></line>
                        <line x1="6" y1="20" x2="6" y2="14"></line>
                    </svg>
                    {localize('Performance')}
                </button>
                <button className={`tradepulse__bottom-nav-btn${activeTab === 'account' ? ' tradepulse__bottom-nav-btn--active' : ''}`} onClick={() => { setActiveTab('account'); window.location.hash = 'account'; }}>
                    <svg className='tradepulse__bottom-nav-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                        <path d="M3 12v5a2 2 0 0 0 2 2h16v-5"></path>
                        <path d="M18 12a2 2 0 0 1 0 4"></path>
                    </svg>
                    {localize('Account')}
                </button>
            </nav>

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
