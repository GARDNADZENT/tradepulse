// @ts-nocheck
import React, { useState, useEffect } from 'react';
import { TradePulseProvider } from './TradePulseContext';
import Sidebar from './Sidebar';
import Header from './Header';
import Footer from './Footer';
import Dashboard from './components/Dashboard';
import MasterSchedule from './components/MasterSchedule';
import MyJourney from './components/MyJourney';
import Performance from './components/Performance';
import AccountInfo from './components/AccountInfo';
import './tradepulse.scss';

const VIEW_TITLES: Record<string, string> = {
    dashboard: 'Welcome back — capital preserved.',
    schedule: 'Master Schedule — live',
    journey: 'My Journey — your locked trading plan.',
    performance: "Today's Performance",
    account: 'Account — lifetime performance.',
};

const TradePulseApp = () => {
    const [hash, setHash] = useState(() => window.location.hash.replace('#', '') || 'dashboard');
    const [sidebarOpen, setSidebarOpen] = useState(false);

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
            case 'dashboard': return <Dashboard />;
            case 'schedule': return <MasterSchedule />;
            case 'journey': return <MyJourney />;
            case 'performance': return <Performance />;
            case 'account': return <AccountInfo />;
            default: return <Dashboard />;
        }
    };

    return (
        <div className='tradepulse' style={{ display: 'flex', minHeight: '100vh' }}>
            <Sidebar />
            {sidebarOpen && (
                <div
                    className='tradepulse__sidebar-overlay tradepulse__sidebar-overlay--visible'
                    onClick={() => setSidebarOpen(false)}
                />
            )}
            <div className='tradepulse__main'>
                <Header
                    title={VIEW_TITLES[hash] || 'Dashboard'}
                    onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
                />
                <main className='tradepulse__content'>
                    {renderView()}
                </main>
                <Footer />
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
