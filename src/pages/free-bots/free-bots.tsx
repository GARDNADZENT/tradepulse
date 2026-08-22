import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import Button from '@/components/shared_ui/button';
import Text from '@/components/shared_ui/text';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { localize } from '@deriv-com/translations';
import { getBotsManifest, prefetchAllXmlInBackground, fetchXmlWithCache } from '@/utils/freebots-cache';
import './free-bots.scss';

interface BotData {
    name: string;
    description: string;
    difficulty: string;
    strategy: string;
    features: string[];
    xml: string;
    badge_text?: string;
    badge_class?: string;
}

const DEFAULT_FEATURES = ['Automated Trading', 'Risk Management', 'Profit Optimization'];

const FreeBots = observer(() => {
    const { dashboard, load_modal, app } = useStore();
    const { active_tab, setActiveTab } = dashboard;
    const [availableBots, setAvailableBots] = useState<BotData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Bot descriptions mapping
    const getBotDescription = (botName: string): string => {
        const descriptions: { [key: string]: string } = {
            'OVER 2 PROFIT BOT':
                'Advanced Over 2 profit bot with intelligent entry logic and risk management for consistent returns.',
            'MR DUKE SPEED BOT':
                'High-speed trading bot optimized for rapid execution and quick profit targeting in volatile markets.',
            'OVER 2 RECOVERY OVER 4':
                'Recovery-focused bot that switches to Over 4 after a loss, maximizing win rate with intelligent martingale recovery.',
            'TRADEPULSE EVEN ODD PROFIT BOT':
                'Digit-based trading bot specializing in even/odd predictions with profit optimization and recovery strategy.',
        };

        // Try exact match first
        if (descriptions[botName]) {
            return descriptions[botName];
        }

        // Try partial matches
        for (const key in descriptions) {
            if (botName.includes(key) || key.includes(botName)) {
                return descriptions[key];
            }
        }

        return `Advanced trading bot: ${botName}. Features automated trading, risk management, and profit optimization.`;
    };

    // Show selected bots from public/xml (explicit curated list)
    const getXmlFiles = () => {
        return [
            'OVER 2 PROFIT BOT.xml',
            'Mr Duke Speed Bot.1.xml',
            'OVER 2 RECOVERY OVER 4.xml',
            'tradepulse_even_odd profit bot.xml',
        ];
    };

    // Wait for workspace to be available
    const waitForWorkspace = (maxAttempts = 3, delay = 50) => {
        return new Promise((resolve, reject) => {
            let attempts = 0;

            const checkWorkspace = () => {
                attempts++;
                if (window.Blockly?.derivWorkspace) {
                    console.log('Workspace is ready!');
                    resolve(window.Blockly.derivWorkspace);
                } else if (attempts >= maxAttempts) {
                    reject(new Error('Workspace not available after maximum attempts'));
                } else {
                    console.log(`Waiting for workspace... attempt ${attempts}/${maxAttempts}`);
                    setTimeout(checkWorkspace, delay);
                }
            };

            checkWorkspace();
        });
    };

    // Load bot into builder
    const loadBotIntoBuilder = async (bot: BotData) => {
        if (bot.xml) {
            const tempId = `freebot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            await load_modal.loadStrategyToBuilder(
                { id: tempId, xml: bot.xml, name: bot.name, save_type: 'pending' },
                true
            );
            setActiveTab(DBOT_TABS.BOT_BUILDER);
        }
    };

    // Load bots with instant UI and progressive loading (no blocking spinner)
    useEffect(() => {
        const loadBots = async () => {
            // Always load when component is mounted (now used as sub-component)

            setError(null);

            // 0) Immediately render skeleton cards from a small fallback list
            const fallback = getXmlFiles().map(file => ({ name: file.replace('.xml', ''), file }));
            const initialSkeleton: BotData[] = fallback.map(item => {
                const botName = (item.name || item.file.replace('.xml', '')).replace(/[_-]/g, ' ');
                return {
                    name: botName,
                    description: getBotDescription(botName),
                    difficulty: 'Intermediate',
                    strategy: 'Multi-Strategy',
                    features: DEFAULT_FEATURES,
                    xml: '',
                };
            });
            setAvailableBots(initialSkeleton);
            setIsLoading(false); // hide "Loading free bots..." right away

            try {
                // Force use of explicit list only; ignore remote manifest
                const manifest = getXmlFiles().map(file => ({ name: file.replace('.xml', ''), file }));

                // Update skeletons to our explicit list
                const skeletonBots: BotData[] = manifest.map(item => {
                    const botName = (item.name || item.file.replace('.xml', '')).replace(/[_-]/g, ' ');
                    return {
                        name: botName,
                        description: getBotDescription(botName),
                        difficulty: 'Intermediate',
                        strategy: 'Multi-Strategy',
                        features: DEFAULT_FEATURES,
                        xml: '',
                        badge_text: 'PREMIUM',
                        badge_class: 'premium',
                    };
                });
                setAvailableBots(skeletonBots);

                // 3) Load XMLs progressively in background
                const loadedBots: BotData[] = [];
                for (let i = 0; i < manifest.length; i++) {
                    const item = manifest[i];
                    try {
                        const xml = await fetchXmlWithCache(item.file);
                        if (xml) {
                            const botName = (item.name || item.file.replace('.xml', '')).replace(/[_-]/g, ' ');
                            loadedBots.push({
                                name: botName,
                                description: getBotDescription(botName),
                                difficulty: 'Intermediate',
                                strategy: 'Multi-Strategy',
                                features: DEFAULT_FEATURES,
                                xml,
                                badge_text: 'PREMIUM',
                                badge_class: 'premium',
                            });
                            setAvailableBots([...loadedBots, ...skeletonBots.slice(loadedBots.length)]);
                        }
                    } catch (err) {
                        console.warn(`Failed to load ${item.file}:`, err);
                    }
                }
            } catch (error) {
                console.error('Error loading bots:', error);
                setError('Failed to load bots. Please try again.');
            }
        };

        loadBots();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className='free-bots'>
            <div className='free-bots__container'>
                {isLoading ? (
                    <div className='free-bots__loading'>
                        <Text size='s' color='general'>
                            {localize('Loading free bots...')}
                        </Text>
                    </div>
                ) : error ? (
                    <div className='free-bots__error'>
                        <Text size='s' color='general'>
                            {error}
                        </Text>
                        <div style={{ marginTop: '20px' }}>
                            <Button onClick={() => window.location.reload()}>{localize('Retry')}</Button>
                        </div>
                    </div>
                ) : availableBots.length === 0 ? (
                    <div className='free-bots__empty'>
                        <Text size='s' color='general'>
                            {localize('No bots available at the moment.')}
                        </Text>
                    </div>
                ) : (
                    <div className='free-bots__grid'>
                        {availableBots.map((bot, index) => (
                                <div
                                    key={index}
                                    className={`free-bot-card ${bot.badge_class ? `free-bot-card--${bot.badge_class}` : ''}`}
                                    data-badge={bot.badge_text || 'PREMIUM'}
                                >
                                <div className='free-bot-card__header'>
                                    <Text size='s' weight='bold' className='free-bot-card__title'>
                                        {bot.name}
                                    </Text>

                                    {/* Star Rating */}
                                    <div className='free-bot-card__rating'>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                        <span className='star'>★</span>
                                    </div>

                                    {/* Bot Description */}
                                    <Text size='xs' className='free-bot-card__description'>
                                        {bot.description}
                                    </Text>
                                </div>

                                <div className='free-bot-card__badges'>
                                    <span className={`free-bot-card__badge free-bot-card__badge--${bot.difficulty.toLowerCase()}`}>
                                        {bot.difficulty}
                                    </span>
                                    <span className='free-bot-card__badge free-bot-card__badge--strategy'>
                                        {bot.strategy}
                                    </span>
                                </div>

                                <div className='free-bot-card__features'>
                                    {bot.features.map((f, i) => (
                                        <span key={i} className='free-bot-card__feature-tag'>{f}</span>
                                    ))}
                                </div>

                                <Button
                                    className='free-bot-card__load-btn'
                                    onClick={() => loadBotIntoBuilder(bot)}
                                    primary
                                    has_effect
                                    type='button'
                                    disabled={!bot.xml}
                                >
                                    {bot.xml ? 'LOAD PREMIUM BOT' : 'LOADING...'}
                                </Button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});

export default FreeBots;
