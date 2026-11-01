import React, { useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { loadXmlIntoBotBuilder } from '@/utils/ai-bot-xml-builder';
import {
    buildRiskManagerAIBotXml,
    RISK_MANAGER_AI_BOTS,
    RiskManagerAIBotCard,
} from './ai-bot-presets';
import './ai-bots.scss';

const RobotIcon: React.FC = () => (
    <svg
        className='rm-ai-bots__robot-icon'
        width='20'
        height='20'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
        strokeLinecap='round'
        strokeLinejoin='round'
        aria-hidden='true'
    >
        <path d='M12 8V4H8' />
        <rect width='16' height='12' x='4' y='8' rx='2' />
        <path d='M2 14h2' />
        <path d='M20 14h2' />
        <path d='M15 13v2' />
        <path d='M9 13v2' />
    </svg>
);

const AIBots = observer(() => {
    const { dashboard, load_modal, run_panel } = useStore();
    const [loadingId, setLoadingId] = useState<string | null>(null);

    const handleLoadAIBot = async (bot: RiskManagerAIBotCard) => {
        if (loadingId) return;
        setLoadingId(bot.id);
        try {
            const xml = buildRiskManagerAIBotXml(bot.id);
            await loadXmlIntoBotBuilder({
                xml,
                name: bot.title,
                dashboard,
                load_modal,
                runNow: false,
                run_panel,
            });
        } finally {
            setLoadingId(null);
        }
    };

    return (
        <div className='rm-ai-bots' data-testid='rm-ai-bots-page'>
            <div className='rm-ai-bots__grid'>
                {RISK_MANAGER_AI_BOTS.map(bot => {
                    const isLoading = loadingId === bot.id;
                    return (
                        <article
                            key={bot.id}
                            className={`rm-ai-bots__card rm-ai-bots__card--${bot.accent}`}
                            data-testid={`ai-bot-card-${bot.number}`}
                        >
                            <div className='rm-ai-bots__card-body'>
                                <div className='rm-ai-bots__card-head'>
                                    <div className='rm-ai-bots__title-wrap'>
                                        <RobotIcon />
                                        <h3 className='rm-ai-bots__title'>{bot.title}</h3>
                                    </div>
                                    <span className='rm-ai-bots__number'>{bot.number}</span>
                                </div>
                                <p className='rm-ai-bots__desc'>{bot.description}</p>
                            </div>

                            <button
                                type='button'
                                className='rm-ai-bots__load-btn'
                                disabled={isLoading}
                                onClick={() => void handleLoadAIBot(bot)}
                            >
                                <span>{isLoading ? 'Loading AI Bot…' : 'Load AI Bot'}</span>
                                <span className='rm-ai-bots__arrow' aria-hidden='true'>
                                    →
                                </span>
                            </button>
                        </article>
                    );
                })}
            </div>
        </div>
    );
});

export default AIBots;
