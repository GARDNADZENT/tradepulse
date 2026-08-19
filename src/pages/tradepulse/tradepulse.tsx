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
    const [hash, setHash] = useState(() => window.location.hash.replace('#', '') || 'journey');
    const [connection, setConnection] = useState<'connected' | 'disconnected' | 'error'>('disconnected');

    useEffect(() => {
        const onHashChange = () => {
            const h = window.location.hash.replace('#', '') || 'journey';
            setHash(h);
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    const renderView = () => {
        switch (hash) {
            case 'schedule': return <MasterSchedule />;
            case 'performance': return <Performance />;
            case 'account': return <AccountInfo />;
            case 'journey':
            default: return <MyJourney />;
        }
    };

    const connectionClass = connection === 'connected'
        ? 'tradepulse__connection tradepulse__connection--connected'
        : connection === 'error'
            ? 'tradepulse__connection tradepulse__connection--error'
            : 'tradepulse__connection';

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

                    <nav className='tradepulse__subnav'>
                        <a href='#journey' className={`tradepulse__subnav-link${hash === 'journey' ? ' tradepulse__subnav-link--active' : ''}`}>
                            <svg className='tradepulse__subnav-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                            </svg>
                            <span>{localize('My Journey')}</span>
                        </a>
                        <a href='#schedule' className={`tradepulse__subnav-link${hash === 'schedule' ? ' tradepulse__subnav-link--active' : ''}`}>
                            <svg className='tradepulse__subnav-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            <span>{localize('Master Schedule')}</span>
                        </a>
                        <a href='#performance' className={`tradepulse__subnav-link${hash === 'performance' ? ' tradepulse__subnav-link--active' : ''}`}>
                            <svg className='tradepulse__subnav-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="20" x2="18" y2="10"></line>
                                <line x1="12" y1="20" x2="12" y2="4"></line>
                                <line x1="6" y1="20" x2="6" y2="14"></line>
                            </svg>
                            <span>{localize('Performance')}</span>
                        </a>
                        <a href='#account' className={`tradepulse__subnav-link${hash === 'account' ? ' tradepulse__subnav-link--active' : ''}`}>
                            <svg className='tradepulse__subnav-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                                <path d="M3 12v5a2 2 0 0 0 2 2h16v-5"></path>
                                <path d="M18 12a2 2 0 0 1 0 4"></path>
                            </svg>
                            <span>{localize('Account')}</span>
                        </a>
                    </nav>

                    <div className={connectionClass}>
                        <span className='tradepulse__connection-dot'></span>
                        <span>{connection === 'connected' ? localize('Live') : connection === 'error' ? localize('Error') : localize('Disconnected')}</span>
                    </div>
                </div>
            </header>

            <main className='tradepulse__content'>
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
