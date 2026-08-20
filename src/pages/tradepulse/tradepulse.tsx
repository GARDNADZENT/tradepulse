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
    const [connection, setConnection] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
    const [showResetModal, setShowResetModal] = useState(false);
    const [isResetting, setIsResetting] = useState(false);

    const { isLoggedIn, currentAccount, refreshJourney } = useTradePulse();

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

    const handleReset = async () => {
        setIsResetting(true);
        try {
            const res = await fetch('/api/journey', { method: 'DELETE' });
            if (!res.ok) throw new Error(`Reset failed: ${res.status}`);
            await refreshJourney();
            window.location.hash = 'journey';
        } catch (e) {
            console.error('Reset failed:', e);
        } finally {
            setIsResetting(false);
            setShowResetModal(false);
        }
    };

    const connectionClass = connection === 'connected'
        ? 'tradepulse__connection-indicator tradepulse__connection-indicator--connected'
        : connection === 'error'
            ? 'tradepulse__connection-indicator tradepulse__connection-indicator--error'
            : 'tradepulse__connection-indicator';

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

                    <div className='tradepulse__header-actions'>
                        <button className='tradepulse__reset-btn' onClick={() => setShowResetModal(true)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12"></path>
                                <path d="M3 5v7h7"></path>
                            </svg>
                            {localize('Reset System')}
                        </button>
                        <div className={connectionClass}>
                            <span className='tradepulse__connection-dot'></span>
                            <span>{connection === 'connected' ? localize('Live') : connection === 'error' ? localize('Error') : localize('Disconnected')}</span>
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

            {/* Reset Confirmation Modal */}
            {showResetModal && (
                <div className='tradepulse__modal-overlay' onClick={() => setShowResetModal(false)}>
                    <div className='tradepulse__modal'>
                        <h3 className='tradepulse__modal-title'>{localize('Reset TradePulse System')}</h3>
                        <p className='tradepulse__modal-text'>
                            {localize('This will reset your TradePulse journey, schedule, and planning data. This action cannot be undone. Your actual Deriv trading account and balance will not be affected.')}
                        </p>
                        <div className='tradepulse__modal-actions'>
                            <button className='tradepulse__btn tradepulse__btn--secondary' onClick={() => setShowResetModal(false)} disabled={isResetting}>
                                {localize('Cancel')}
                            </button>
                            <button className='tradepulse__btn tradepulse__btn--danger' onClick={handleReset} disabled={isResetting}>
                                {isResetting ? localize('Resetting...') : localize('Reset System')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
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
