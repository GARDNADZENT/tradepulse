// @ts-nocheck
import React, { useState } from 'react';
import { useTradePulse } from './TradePulseContext';

const Sidebar = () => {
    const { isLoggedIn } = useTradePulse();
    const [isOpen, setIsOpen] = useState(false);

    const getActiveHash = () => {
        const hash = window.location.hash.replace('#', '');
        return ['dashboard', 'schedule', 'journey', 'performance', 'account'].includes(hash) ? hash : 'dashboard';
    };

    const [activeHash, setActiveHash] = useState(getActiveHash());

    React.useEffect(() => {
        const onHashChange = () => setActiveHash(getActiveHash());
        window.addEventListener('hashchange', onHashChange);
        return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

    const handleNavClick = () => {
        if (window.innerWidth < 1024) {
            setIsOpen(false);
        }
    };

    const linkClass = (hash: string) =>
        `tradepulse__sidebar-link${activeHash === hash ? ' tradepulse__sidebar-link--active' : ''}`;

    return (
        <>
            <div
                className={`tradepulse__sidebar-overlay ${isOpen ? 'tradepulse__sidebar-overlay--visible' : ''}`}
                onClick={() => setIsOpen(false)}
            />
            <aside className={`tradepulse__sidebar ${isOpen ? 'tradepulse__sidebar--open' : ''}`}>
                <div className='tradepulse__sidebar-header'>
                    <div className='tradepulse__sidebar-logo'>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                        </svg>
                    </div>
                    <div className='tradepulse__sidebar-brand'>
                        <div className='tradepulse__sidebar-brand-name'>TradersPulse</div>
                        <div className='tradepulse__sidebar-brand-tag'>Capital-First Analytics</div>
                    </div>
                </div>

                <nav className='tradepulse__sidebar-nav'>
                    {isLoggedIn && (
                        <>
                            <div className='tradepulse__sidebar-section'>Overview</div>
                            <a href='#dashboard' className={linkClass('dashboard')} onClick={handleNavClick}>
                                <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="3" width="7" height="7"></rect>
                                    <rect x="14" y="3" width="7" height="7"></rect>
                                    <rect x="14" y="14" width="7" height="7"></rect>
                                    <rect x="3" y="14" width="7" height="7"></rect>
                                </svg>
                                Dashboard
                            </a>
                            <a href='#schedule' className={linkClass('schedule')} onClick={handleNavClick}>
                                <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                    <line x1="16" y1="2" x2="16" y2="6"></line>
                                    <line x1="8" y1="2" x2="8" y2="6"></line>
                                    <line x1="3" y1="10" x2="21" y2="10"></line>
                                </svg>
                                Master Schedule
                            </a>
                            <a href='#journey' className={linkClass('journey')} onClick={handleNavClick}>
                                <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                                </svg>
                                My Journey
                            </a>
                            <a href='#performance' className={linkClass('performance')} onClick={handleNavClick}>
                                <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="20" x2="18" y2="10"></line>
                                    <line x1="12" y1="20" x2="12" y2="4"></line>
                                    <line x1="6" y1="20" x2="6" y2="14"></line>
                                </svg>
                                Performance
                            </a>
                            <a href='#account' className={linkClass('account')} onClick={handleNavClick}>
                                <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                                    <path d="M3 12v5a2 2 0 0 0 2 2h16v-5"></path>
                                    <path d="M18 12a2 2 0 0 1 0 4"></path>
                                </svg>
                                Account
                            </a>

                            <div className='tradepulse__sidebar-section'>Platform</div>
                            <a href='https://tradepulse.sytes.net/' target='_blank' rel='noopener noreferrer' className='tradepulse__sidebar-link tradepulse__sidebar-link--accent'>
                                <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                                </svg>
                                Trading Hub
                            </a>
                        </>
                    )}

                    <div className='tradepulse__sidebar-section'>Social</div>
                    <a href='https://wa.me/message/B2KVSWHA6VF4O1' target='_blank' rel='noopener' className='tradepulse__sidebar-link'>
                        <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                        </svg>
                        WhatsApp
                    </a>
                    <a href='https://t.me/gadnadolo' target='_blank' rel='noopener' className='tradepulse__sidebar-link'>
                        <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                        Telegram
                    </a>
                    <a href='https://tiktok.com/@yourhandle' target='_blank' rel='noopener' className='tradepulse__sidebar-link'>
                        <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 12a4 4 0 1 0 4 4V2"></path>
                        </svg>
                        TikTok
                    </a>
                    <a href='https://tradepulse.sytes.net/' target='_blank' rel='noopener' className='tradepulse__sidebar-link'>
                        <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="2" y1="12" x2="22" y2="12"></line>
                            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                        </svg>
                        Website
                    </a>
                    <a href='https://www.youtube.com/@gardnadzenttechnologies4239' target='_blank' rel='noopener' className='tradepulse__sidebar-link'>
                        <svg className='tradepulse__sidebar-icon' viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="23 7 16 12 23 17 23 7"></polygon>
                            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>
                        </svg>
                        YouTube
                    </a>
                </nav>
            </aside>
        </>
    );
};

export default Sidebar;
