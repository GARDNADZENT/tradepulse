import React, { useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import './quick-action-strip.scss';

export const QuickActionStrip: React.FC = observer(() => {
    const { dashboard, load_modal } = useStore();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const openBotsTab = (filter?: string) => {
        if (filter) {
            try {
                sessionStorage.setItem('tp_special_bots_filter', filter);
                window.dispatchEvent(new CustomEvent('tp-special-bots-filter', { detail: filter }));
            } catch {}
        }
        dashboard.setActiveTab(DBOT_TABS.TRADING_BOTS);
    };

    const handleDeviceXmlChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try {
            const xml = await file.text();
            const botName = file.name.replace(/\.xml$/i, '');
            const tempId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            dashboard.setActiveTab(DBOT_TABS.BOT_BUILDER);
            await new Promise(resolve => setTimeout(resolve, 80));
            await load_modal.loadStrategyToBuilder(
                { id: tempId, xml, name: botName, save_type: 'local' },
                true
            );
        } catch (err) {
            console.error('[QuickActionStrip] XML import failed:', err);
        }
    };

    return (
        <div className='tp-quick-strip'>
            <input
                ref={fileInputRef}
                type='file'
                accept='.xml,text/xml,application/xml'
                style={{ display: 'none' }}
                onChange={handleDeviceXmlChange}
            />

            <button type='button' className='tp-quick-strip__card' onClick={() => openBotsTab('all')}>
                <span className='tp-quick-strip__icon' aria-hidden='true'>
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none'>
                        <rect x='3' y='3' width='8' height='8' rx='2' fill='#ffffff' />
                        <rect x='13' y='3' width='8' height='8' rx='2' fill='#93c5fd' />
                        <rect x='3' y='13' width='8' height='8' rx='2' fill='#93c5fd' />
                        <rect x='13' y='13' width='8' height='8' rx='2' fill='#ffffff' />
                    </svg>
                </span>
                <span className='tp-quick-strip__body'>
                    <span className='tp-quick-strip__title'>Load Bot</span>
                    <span className='tp-quick-strip__cta'>OPEN BOTS →</span>
                </span>
            </button>

            <button
                type='button'
                className='tp-quick-strip__card'
                onClick={() => fileInputRef.current?.click()}
            >
                <span className='tp-quick-strip__icon' aria-hidden='true'>
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none'>
                        <path
                            d='M12 16V4m0 0l-4 4m4-4l4 4M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2'
                            stroke='#ffffff'
                            strokeWidth='2.2'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        />
                    </svg>
                </span>
                <span className='tp-quick-strip__body'>
                    <span className='tp-quick-strip__title'>Load Bot From Device</span>
                    <span className='tp-quick-strip__cta'>IMPORT XML →</span>
                </span>
            </button>

            <button type='button' className='tp-quick-strip__card' onClick={() => openBotsTab('special')}>
                <span className='tp-quick-strip__icon' aria-hidden='true'>
                    <svg width='22' height='22' viewBox='0 0 24 24' fill='none'>
                        <path
                            d='M12 3l2.6 5.3 5.9.85-4.25 4.14 1 5.86L12 16.4l-5.25 2.75 1-5.86L3.5 9.15l5.9-.85L12 3z'
                            fill='#ffffff'
                        />
                    </svg>
                </span>
                <span className='tp-quick-strip__body'>
                    <span className='tp-quick-strip__title'>Special Bots (13 Virtual Hook &amp; AI Bots)</span>
                    <span className='tp-quick-strip__cta'>OPEN SPECIALS →</span>
                </span>
            </button>
        </div>
    );
});

export default QuickActionStrip;
