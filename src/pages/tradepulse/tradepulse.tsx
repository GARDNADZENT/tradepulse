// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { TradePulseProvider } from './TradePulseContext';
import Dashboard from './components/Dashboard';
import MasterSchedule from './components/MasterSchedule';
import MyJourney from './components/MyJourney';
import Performance from './components/Performance';
import AccountInfo from './components/AccountInfo';
import { localize } from '@deriv-com/translations';
import './tradepulse.scss';

const TradePulseApp = () => {
    const [hash, setHash] = useState(() => window.location.hash.replace('#', '') || 'dashboard');

    useEffect(() => {
        const onHashChange = () => {
            const h = window.location.hash.replace('#', '') || 'dashboard';
            setHash(h);
        };
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    const renderView = () => {
        switch (hash) {
            case 'schedule': return <MasterSchedule />;
            case 'journey': return <MyJourney />;
            case 'performance': return <Performance />;
            case 'account': return <AccountInfo />;
            default: return <Dashboard />;
        }
    };

    return (
        <div className='tradepulse'>
            <div className='tradepulse__subnav'>
                <a href='#journey' className={`tradepulse__subnav-link${hash === 'journey' ? ' tradepulse__subnav-link--active' : ''}`}>{localize('My Journey')}</a>
                <a href='#schedule' className={`tradepulse__subnav-link${hash === 'schedule' ? ' tradepulse__subnav-link--active' : ''}`}>{localize('Master Schedule')}</a>
                <a href='#performance' className={`tradepulse__subnav-link${hash === 'performance' ? ' tradepulse__subnav-link--active' : ''}`}>{localize('Performance')}</a>
                <a href='#account' className={`tradepulse__subnav-link${hash === 'account' ? ' tradepulse__subnav-link--active' : ''}`}>{localize('Account')}</a>
            </div>
            <div className='tradepulse__content'>
                {renderView()}
            </div>
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
