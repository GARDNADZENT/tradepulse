import React, { useState, useMemo } from 'react';
import FreeBots from './free-bots';
import HybridBots from '../hybrid-bots';
import RiskCalculator from './risk-calculator';
import Strategies from './strategies';
import { Localize } from '@deriv-com/translations';
import { LabelPairedPuzzlePieceTwoCaptionBoldIcon } from '@deriv/quill-icons/LabelPaired';
import './trading-bots.scss';

type TradingBotSubTab = 'free-bots' | 'speedbots' | 'calculator' | 'strategies';

const TradingBots: React.FC = () => {
    const [active_tool, setActiveTool] = useState<TradingBotSubTab>('free-bots');

    const handleCardClick = (tool: TradingBotSubTab) => {
        setActiveTool(tool);
    };

    const content = useMemo(() => {
        switch (active_tool) {
            case 'free-bots':
                return <FreeBots />;
            case 'speedbots':
                return <HybridBots />;
            case 'calculator':
                return <RiskCalculator />;
            case 'strategies':
                return <Strategies />;
            default:
                return null;
        }
    }, [active_tool]);

    return (
        <div className='trading-bots'>
            <div className='trading-bots__cards-container'>
                <button
                    type='button'
                    className={`trading-bots__card ${active_tool === 'free-bots' ? 'trading-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('free-bots')}
                >
                    <div className='trading-bots__card-content'>
                        <LabelPairedPuzzlePieceTwoCaptionBoldIcon height='16px' width='16px' />
                        <span className='trading-bots__card-label'>
                            <Localize i18n_default_text='Free Bots' />
                        </span>
                    </div>
                </button>
                <button
                    type='button'
                    className={`trading-bots__card ${active_tool === 'speedbots' ? 'trading-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('speedbots')}
                >
                    <div className='trading-bots__card-content'>
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round'>
                            <polygon points='13 2 3 14 12 14 11 22 21 10 12 10 13 2' />
                        </svg>
                        <span className='trading-bots__card-label'>
                            <Localize i18n_default_text='SpeedBots' />
                        </span>
                    </div>
                </button>
                <button
                    type='button'
                    className={`trading-bots__card ${active_tool === 'calculator' ? 'trading-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('calculator')}
                >
                    <div className='trading-bots__card-content'>
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round'>
                            <rect x='4' y='2' width='16' height='20' rx='2' />
                            <line x1='8' y1='6' x2='16' y2='6' />
                            <line x1='8' y1='11' x2='8.01' y2='11' />
                            <line x1='12' y1='11' x2='12.01' y2='11' />
                            <line x1='16' y1='11' x2='16.01' y2='11' />
                            <line x1='8' y1='15' x2='8.01' y2='15' />
                            <line x1='12' y1='15' x2='12.01' y2='15' />
                            <line x1='16' y1='15' x2='16.01' y2='15' />
                        </svg>
                        <span className='trading-bots__card-label'>
                            <Localize i18n_default_text='Risk Calculator' />
                        </span>
                    </div>
                </button>
                <button
                    type='button'
                    className={`trading-bots__card ${active_tool === 'strategies' ? 'trading-bots__card--active' : ''}`}
                    onClick={() => handleCardClick('strategies')}
                >
                    <div className='trading-bots__card-content'>
                        <svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2.2' strokeLinecap='round' strokeLinejoin='round'>
                            <polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
                        </svg>
                        <span className='trading-bots__card-label'>
                            <Localize i18n_default_text='Strategies' />
                        </span>
                    </div>
                </button>
            </div>
            <div className='trading-bots__content'>{content}</div>
        </div>
    );
};

export default TradingBots;
