import React, { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { fetchXmlWithCache, prefetchAllXmlInBackground } from '@/utils/freebots-cache';
import './free-bots.scss';

type BotCategory = 'all' | 'special' | 'virtual-hook' | 'turbo-ai';

interface SpecialBotEntry {
    id: string;
    name: string;
    file: string;
    avatar: string;
    badge: string;
    category: Exclude<BotCategory, 'all'>[];
    strategy: string;
    description: string;
    features: string[];
}

const SPECIAL_BOTS_CATALOG: SpecialBotEntry[] = [
    {
        id: 'over-under-virtual-hook-pro',
        name: 'Over/Under Virtual Hook Pro',
        file: 'Over_Under_Virtual_Hook_Pro.xml',
        avatar: 'VH',
        badge: '🔥 VIRTUAL HOOK PRO',
        category: ['special', 'virtual-hook'],
        strategy: 'Virtual Hook + Split Recovery',
        description:
            'Starts in live Virtual simulation mode, streams per-tick digits to Journal, and enters real execution after consecutive virtual wins.',
        features: ['Virtual Hook Engine', 'Live Digit Journal', 'Prediction Shift 8→6'],
    },
    {
        id: 'best-of-3',
        name: 'Best of 3',
        file: 'special-bots/Best of 3.xml',
        avatar: 'BO',
        badge: '☆ SPECIAL BOT',
        category: ['special'],
        strategy: 'Multi-Tick Confirmation',
        description: '3-confirmation entry strategy designed for steady trend and parity precision on synthetic indices.',
        features: ['Best of 3 Logic', 'Smart Recovery', 'TP/SL Guard'],
    },
    {
        id: 'massive-profits-duke',
        name: 'Massive Profits By Mr Duke',
        file: 'special-bots/Massive Profits By Mr Duke.xml',
        avatar: 'MP',
        badge: '☆ SPECIAL BOT',
        category: ['special'],
        strategy: 'Compound Recovery',
        description: 'High-consistency compounding bot with adaptive stake sizing and disciplined stop-loss protection.',
        features: ['Adaptive Stake', 'Profit Lock', 'Auto Compound'],
    },
    {
        id: 'risk-manager-ai',
        name: 'Risk Manager AI Bot',
        file: 'special-bots/Risk Manager AI Bot.xml',
        avatar: 'AI',
        badge: '☆ SPECIAL BOT',
        category: ['special', 'turbo-ai'],
        strategy: 'AI Digit & Risk Engine',
        description: 'Flagship Risk Manager automated bot combining tick-pattern filtering with strict capital preservation.',
        features: ['AI Tick Filter', 'Drawdown Cap', 'Auto TP/SL'],
    },
    {
        id: '2026-turbo-duke',
        name: '2026 Turbo by Mr. Duke',
        file: 'special-bots/2026 Turbo by Mr. Duke.xml',
        avatar: '⚡',
        badge: '☆ SPECIAL BOT',
        category: ['special', 'turbo-ai'],
        strategy: 'High-Speed 1-Tick',
        description: 'Ultra-fast 1-tick execution bot engineered for rapid scalping cycles on 1s Volatility indices.',
        features: ['1-Tick Speed', 'Fast Execution', 'Quick Target'],
    },
    {
        id: 'rise-and-fall',
        name: 'Rise and Fall',
        file: 'special-bots/Rise and Fall.xml',
        avatar: 'RF',
        badge: '☆ SPECIAL BOT',
        category: ['special'],
        strategy: 'Momentum Rise/Fall',
        description: 'Directional momentum Rise/Fall bot tracking consecutive tick slopes before triggering entries.',
        features: ['Trend Filter', 'Rise/Fall', 'Controlled Martingale'],
    },
    {
        id: 'over-after-loss-even',
        name: 'Over After Loss Even',
        file: 'special-bots/Over After Loss Even.xml',
        avatar: 'OA',
        badge: '☆ SPECIAL BOT',
        category: ['special'],
        strategy: 'Hybrid Parity + Over',
        description: 'Trades high-probability digit setups and dynamically pivots recovery entries after a loss.',
        features: ['Loss Pivot', 'Parity + Over', 'Smart Recovery'],
    },
    {
        id: 'ou-2pred-vh',
        name: 'OverUnder with 2 Predictions, Virtual Hook $ Entry',
        file: 'special-bots/OverUnder with 2 Predictions, Virtual Hook $ Entry.xml',
        avatar: 'OW',
        badge: '☆ VIRTUAL HOOK',
        category: ['special', 'virtual-hook'],
        strategy: 'Dual-Barrier Virtual Hook',
        description: 'Dual-prediction Over/Under bot with Virtual Hook entry filtering to wait out cold streaks first.',
        features: ['Virtual Hook', '2 Predictions', '$ Entry Trigger'],
    },
    {
        id: 'ou-vh-entry',
        name: 'OverUnder with Virtual Hook $ Entry',
        file: 'special-bots/OverUnder with Virtual Hook $ Entry.xml',
        avatar: 'VH',
        badge: '☆ VIRTUAL HOOK',
        category: ['special', 'virtual-hook'],
        strategy: 'Virtual Hook Entry',
        description: 'Monitors virtual digit outcomes and deploys real-stake Over/Under entries on confirmed setups.',
        features: ['Virtual Hook', 'Over/Under', 'Capital Shield'],
    },
    {
        id: 'ou-simple-vh',
        name: 'Over and Under Simple with Virtual Hook',
        file: 'special-bots/Over and Under Simple with Virtual Hook.xml',
        avatar: 'VH',
        badge: '☆ VIRTUAL HOOK',
        category: ['special', 'virtual-hook'],
        strategy: 'Clean Virtual Hook',
        description: 'Streamlined Over & Under strategy paired with Virtual Hook protection for low-drawdown sessions.',
        features: ['Virtual Hook', 'Simple Rules', 'Low Drawdown'],
    },
    {
        id: 'ou-simple',
        name: 'Over and Under Simple Bot',
        file: 'special-bots/Over and Under Simple Bot.xml',
        avatar: 'OU',
        badge: '☆ SPECIAL BOT',
        category: ['special'],
        strategy: 'Over/Under Core',
        description: 'Clean, fast Over/Under digit bot ideal for short target-profit sessions on Volatility indices.',
        features: ['Clean Entry', 'Over/Under', 'Session Target'],
    },
    {
        id: 'wealth-generator',
        name: 'Wealth Generator Bot',
        file: 'special-bots/Wealth Generator Bot.xml',
        avatar: 'WG',
        badge: '☆ SPECIAL BOT',
        category: ['special'],
        strategy: 'Systematic Growth',
        description: 'Disciplined session compounding bot built for consistent daily target milestones.',
        features: ['Daily Target', 'Risk Guard', 'Auto Stop'],
    },
    {
        id: 'auto-switch-duke',
        name: 'Auto Switch by Mr Duke',
        file: 'special-bots/Auto Switch by Mr Duke.xml',
        avatar: 'AS',
        badge: '☆ SPECIAL BOT',
        category: ['special', 'turbo-ai'],
        strategy: 'Dynamic Digit Switcher',
        description: 'Automatically rotates predictions and recovery barriers as digit distribution shifts.',
        features: ['Auto Switch', 'Dynamic Barrier', 'Fast Cycle'],
    },
    {
        id: 'simba-ai-v1',
        name: 'Simba AI v1',
        file: 'special-bots/Simba AI v1.xml',
        avatar: 'SB',
        badge: '☆ SPECIAL BOT',
        category: ['special', 'turbo-ai'],
        strategy: 'AI Statistical Scanner',
        description: 'Multi-condition AI digit analyzer with automated barrier selection and recovery.',
        features: ['AI Scanner', 'Smart Martingale', 'Volatility 1s'],
    },
    {
        id: 'over-2-profit',
        name: 'Over 2 Profit Bot',
        file: 'OVER 2 PROFIT BOT.xml',
        avatar: 'O2',
        badge: 'TRADERSPULSE',
        category: ['turbo-ai'],
        strategy: 'Over 2 High Win-Rate',
        description: 'High win-rate Over 2 profit bot with intelligent entry logic and risk management.',
        features: ['Over 2 Barrier', 'High Win Rate', 'Risk Managed'],
    },
    {
        id: 'over-2-recovery-4',
        name: 'Over 2 Recovery Over 4',
        file: 'OVER 2 RECOVERY OVER 4.xml',
        avatar: 'R4',
        badge: 'TRADERSPULSE',
        category: ['turbo-ai'],
        strategy: 'Split-Barrier Recovery',
        description: 'Trades Over 2 for high accuracy and switches to Over 4 payout recovery after a loss.',
        features: ['Over 2 → Over 4', 'Gentle Recovery', 'Profit Lock'],
    },
    {
        id: 'mr-duke-speed',
        name: 'Mr Duke Speed Bot',
        file: 'Mr Duke Speed Bot.1.xml',
        avatar: 'SP',
        badge: 'TRADERSPULSE',
        category: ['turbo-ai'],
        strategy: 'Rapid Execution',
        description: 'High-speed trading bot optimized for rapid execution in active Volatility markets.',
        features: ['Speed Mode', '1-Tick Cycles', 'Auto TP'],
    },
    {
        id: 'tp-even-odd',
        name: 'TradersPulse Even/Odd Profit Bot',
        file: 'tradepulse_even_odd profit bot.xml',
        avatar: 'EO',
        badge: 'TRADERSPULSE',
        category: ['turbo-ai'],
        strategy: 'Parity Equilibrium',
        description: 'Digit-based trading bot specializing in Even/Odd parity bursts and controlled recovery.',
        features: ['Even / Odd', 'Streak Filter', 'Profit Target'],
    },
];

const FreeBots = observer(() => {
    const { dashboard, load_modal } = useStore();
    const { setActiveTab } = dashboard;

    const [activeCategory, setActiveCategory] = useState<BotCategory>(() => {
        try {
            const saved = sessionStorage.getItem('tp_special_bots_filter') as BotCategory | null;
            if (saved && ['all', 'special', 'virtual-hook', 'turbo-ai'].includes(saved)) {
                sessionStorage.removeItem('tp_special_bots_filter');
                return saved;
            }
        } catch {}
        return 'all';
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [loadingBotId, setLoadingBotId] = useState<string | null>(null);
    const [loadError, setLoadError] = useState<string | null>(null);
    const xmlInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        prefetchAllXmlInBackground(SPECIAL_BOTS_CATALOG.map(b => b.file));

        const onFilterEvent = (e: Event) => {
            const detail = (e as CustomEvent<string>).detail as BotCategory;
            if (detail && ['all', 'special', 'virtual-hook', 'turbo-ai'].includes(detail)) {
                setActiveCategory(detail);
            }
        };
        window.addEventListener('tp-special-bots-filter', onFilterEvent);
        return () => window.removeEventListener('tp-special-bots-filter', onFilterEvent);
    }, []);

    const filteredBots = useMemo(() => {
        return SPECIAL_BOTS_CATALOG.filter(bot => {
            const matchesCategory = activeCategory === 'all' || bot.category.includes(activeCategory);
            const q = searchQuery.trim().toLowerCase();
            const matchesSearch =
                !q ||
                bot.name.toLowerCase().includes(q) ||
                bot.strategy.toLowerCase().includes(q) ||
                bot.description.toLowerCase().includes(q);
            return matchesCategory && matchesSearch;
        });
    }, [activeCategory, searchQuery]);

    const loadXmlIntoVisibleBuilder = async (id: string, name: string, xml: string, saveType: 'pending' | 'local') => {
        setActiveTab(DBOT_TABS.BOT_BUILDER);

        for (let attempt = 0; attempt < 20; attempt++) {
            if ((window as any).Blockly?.derivWorkspace) break;
            await new Promise(resolve => setTimeout(resolve, 60));
        }

        await new Promise(resolve => setTimeout(resolve, 60));
        await load_modal.loadStrategyToBuilder({ id, xml, name, save_type: saveType }, true);

        const ws = (window as any).Blockly?.derivWorkspace;
        if (ws) {
            try {
                ws.getAllBlocks?.().forEach((b: any) => b.setErrorHighlighted?.(false));
                (window as any).Blockly?.svgResize?.(ws);
            } catch {}
        }
    };

    const handleLoadBot = async (bot: SpecialBotEntry) => {
        setLoadingBotId(bot.id);
        setLoadError(null);
        try {
            const xml = await fetchXmlWithCache(bot.file);
            if (!xml) {
                setLoadError(`Unable to load "${bot.name}". Please try again.`);
                return;
            }
            const tempId = `specialbot_${bot.id}_${Date.now()}`;
            await loadXmlIntoVisibleBuilder(tempId, bot.name, xml, 'pending');
        } catch (err) {
            console.error('[SpecialBots] Error loading bot:', err);
            setLoadError(`Failed to load "${bot.name}" into Bot Builder.`);
        } finally {
            setLoadingBotId(null);
        }
    };

    const handleImportDeviceXml = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setLoadError(null);
        try {
            const xml = await file.text();
            const botName = file.name.replace(/\.xml$/i, '');
            const tempId = `local_${Date.now()}`;
            await loadXmlIntoVisibleBuilder(tempId, botName, xml, 'local');
        } catch {
            setLoadError('Failed to import XML file from device.');
        }
    };

    return (
        <div className='free-bots'>
            <div className='free-bots__container'>
                <input
                    ref={xmlInputRef}
                    type='file'
                    accept='.xml,text/xml,application/xml'
                    style={{ display: 'none' }}
                    onChange={handleImportDeviceXml}
                />

                <div className='free-bots__toolbar'>
                    <div className='free-bots__filters'>
                        <button
                            type='button'
                            className={`free-bots__filter-pill${activeCategory === 'all' ? ' free-bots__filter-pill--active' : ''}`}
                            onClick={() => setActiveCategory('all')}
                        >
                            All Bots ({SPECIAL_BOTS_CATALOG.length})
                        </button>
                        <button
                            type='button'
                            className={`free-bots__filter-pill${activeCategory === 'special' ? ' free-bots__filter-pill--active' : ''}`}
                            onClick={() => setActiveCategory('special')}
                        >
                            ☆ Special Bots ({SPECIAL_BOTS_CATALOG.filter(b => b.category.includes('special')).length})
                        </button>
                        <button
                            type='button'
                            className={`free-bots__filter-pill${activeCategory === 'virtual-hook' ? ' free-bots__filter-pill--active' : ''}`}
                            onClick={() => setActiveCategory('virtual-hook')}
                        >
                            Virtual Hook ({SPECIAL_BOTS_CATALOG.filter(b => b.category.includes('virtual-hook')).length})
                        </button>
                        <button
                            type='button'
                            className={`free-bots__filter-pill${activeCategory === 'turbo-ai' ? ' free-bots__filter-pill--active' : ''}`}
                            onClick={() => setActiveCategory('turbo-ai')}
                        >
                            Turbo &amp; AI ({SPECIAL_BOTS_CATALOG.filter(b => b.category.includes('turbo-ai')).length})
                        </button>
                    </div>

                    <div className='free-bots__toolbar-right'>
                        <input
                            type='search'
                            className='free-bots__search'
                            placeholder='Search bots…'
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        <button
                            type='button'
                            className='free-bots__import-btn'
                            onClick={() => xmlInputRef.current?.click()}
                        >
                            Import XML ↑
                        </button>
                    </div>
                </div>

                {loadError && <div className='free-bots__error-banner'>{loadError}</div>}

                {filteredBots.length === 0 ? (
                    <div className='free-bots__empty'>No bots match your current search filter.</div>
                ) : (
                    <div className='free-bots__grid'>
                        {filteredBots.map(bot => {
                            const isLoadingThis = loadingBotId === bot.id;
                            const isVirtualHook = bot.category.includes('virtual-hook');
                            return (
                                <article
                                    key={bot.id}
                                    className={`free-bot-card${isVirtualHook ? ' free-bot-card--vh' : ''}`}
                                >
                                    <div className='free-bot-card__top'>
                                        <span className='free-bot-card__avatar'>{bot.avatar}</span>
                                        <span
                                            className={`free-bot-card__ribbon${isVirtualHook ? ' free-bot-card__ribbon--vh' : ''}`}
                                        >
                                            {bot.badge}
                                        </span>
                                    </div>

                                    <h3 className='free-bot-card__title'>{bot.name}</h3>
                                    <span className='free-bot-card__strategy'>{bot.strategy}</span>
                                    <p className='free-bot-card__description'>{bot.description}</p>

                                    <div className='free-bot-card__features'>
                                        {bot.features.map(feat => (
                                            <span key={feat} className='free-bot-card__feature-tag'>
                                                {feat}
                                            </span>
                                        ))}
                                    </div>

                                    <button
                                        type='button'
                                        className='free-bot-card__load-btn'
                                        disabled={isLoadingThis}
                                        onClick={() => handleLoadBot(bot)}
                                    >
                                        {isLoadingThis ? 'LOADING…' : 'LOAD BOT →'}
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
});

export default FreeBots;
