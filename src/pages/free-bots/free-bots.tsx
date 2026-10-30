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
    category: Exclude<BotCategory, 'all'>[];
    strategy: string;
    description: string;
}

const SPECIAL_BOTS_CATALOG: SpecialBotEntry[] = [
    {
        id: 'best-of-3',
        name: 'Best of 3',
        file: 'special-bots/Best of 3.xml',
        category: ['special'],
        strategy: 'Multi-Tick Confirmation',
        description: '3-confirmation entry strategy designed for steady trend and parity precision on synthetic indices.',
    },
    {
        id: 'massive-profits-duke',
        name: 'Massive Profits By Mr Duke',
        file: 'special-bots/Massive Profits By Mr Duke.xml',
        category: ['special'],
        strategy: 'Compound Recovery',
        description: 'High-consistency compounding bot with adaptive stake sizing and disciplined stop-loss protection.',
    },
    {
        id: 'risk-manager-ai',
        name: 'Risk Manager AI Bot',
        file: 'special-bots/Risk Manager AI Bot.xml',
        category: ['special', 'turbo-ai'],
        strategy: 'AI Digit & Risk Engine',
        description: 'Flagship Risk Manager automated bot combining tick-pattern filtering with strict capital preservation.',
    },
    {
        id: '2026-turbo-duke',
        name: '2026 Turbo by Mr. Duke',
        file: 'special-bots/2026 Turbo by Mr. Duke.xml',
        category: ['special', 'turbo-ai'],
        strategy: 'High-Speed 1-Tick',
        description: 'Ultra-fast 1-tick execution bot engineered for rapid scalping cycles on 1s Volatility indices.',
    },
    {
        id: 'rise-and-fall',
        name: 'Rise and Fall',
        file: 'special-bots/Rise and Fall.xml',
        category: ['special'],
        strategy: 'Momentum Rise/Fall',
        description: 'Directional momentum Rise/Fall bot tracking consecutive tick slopes before triggering entries.',
    },
    {
        id: 'over-after-loss-even',
        name: 'Over After Loss Even',
        file: 'special-bots/Over After Loss Even.xml',
        category: ['special'],
        strategy: 'Hybrid Parity + Over',
        description: 'Trades high-probability digit setups and dynamically pivots recovery entries after a loss.',
    },
    {
        id: 'ou-2pred-vh',
        name: 'OverUnder with 2 Predictions, Virtual Hook $ Entry',
        file: 'special-bots/OverUnder with 2 Predictions, Virtual Hook $ Entry.xml',
        category: ['special', 'virtual-hook'],
        strategy: 'Dual-Barrier Virtual Hook',
        description: 'Dual-prediction Over/Under bot with Virtual Hook entry filtering to wait out cold streaks first.',
    },
    {
        id: 'ou-vh-entry',
        name: 'OverUnder with Virtual Hook $ Entry',
        file: 'special-bots/OverUnder with Virtual Hook $ Entry.xml',
        category: ['special', 'virtual-hook'],
        strategy: 'Virtual Hook Entry',
        description: 'Monitors virtual digit outcomes and deploys real-stake Over/Under entries on confirmed setups.',
    },
    {
        id: 'ou-simple-vh',
        name: 'Over and Under Simple with Virtual Hook',
        file: 'special-bots/Over and Under Simple with Virtual Hook.xml',
        category: ['special', 'virtual-hook'],
        strategy: 'Clean Virtual Hook',
        description: 'Streamlined Over & Under strategy paired with Virtual Hook protection for low-drawdown sessions.',
    },
    {
        id: 'ou-simple',
        name: 'Over and Under Simple Bot',
        file: 'special-bots/Over and Under Simple Bot.xml',
        category: ['special'],
        strategy: 'Over/Under Core',
        description: 'Clean, fast Over/Under digit bot ideal for short target-profit sessions on Volatility indices.',
    },
    {
        id: 'wealth-generator',
        name: 'Wealth Generator Bot',
        file: 'special-bots/Wealth Generator Bot.xml',
        category: ['special'],
        strategy: 'Systematic Growth',
        description: 'Disciplined session compounding bot built for consistent daily target milestones.',
    },
    {
        id: 'over-under-virtual-hook-pro',
        name: 'Over/Under Virtual Hook Pro',
        file: 'Over_Under_Virtual_Hook_Pro.xml',
        category: ['special', 'virtual-hook'],
        strategy: 'Virtual Hook + Split Recovery',
        description:
            'Starts in live Virtual simulation mode, streams per-tick digits to Journal, and enters real execution after consecutive virtual wins.',
    },
    {
        id: 'auto-switch-duke',
        name: 'Auto Switch by Mr Duke',
        file: 'special-bots/Auto Switch by Mr Duke.xml',
        category: ['special', 'turbo-ai'],
        strategy: 'Dynamic Digit Switcher',
        description: 'Automatically rotates predictions and recovery barriers as digit distribution shifts.',
    },
    {
        id: 'simba-ai-v1',
        name: 'Simba AI v1',
        file: 'special-bots/Simba AI v1.xml',
        category: ['special', 'turbo-ai'],
        strategy: 'AI Statistical Scanner',
        description: 'Multi-condition AI digit analyzer with automated barrier selection and recovery.',
    },
    {
        id: 'over-2-profit',
        name: 'Over 2 Profit Bot',
        file: 'OVER 2 PROFIT BOT.xml',
        category: ['turbo-ai'],
        strategy: 'Over 2 High Win-Rate',
        description: 'High win-rate Over 2 profit bot with intelligent entry logic and risk management.',
    },
    {
        id: 'over-2-recovery-4',
        name: 'Over 2 Recovery Over 4',
        file: 'OVER 2 RECOVERY OVER 4.xml',
        category: ['turbo-ai'],
        strategy: 'Split-Barrier Recovery',
        description: 'Trades Over 2 for high accuracy and switches to Over 4 payout recovery after a loss.',
    },
    {
        id: 'mr-duke-speed',
        name: 'Mr Duke Speed Bot',
        file: 'Mr Duke Speed Bot.1.xml',
        category: ['turbo-ai'],
        strategy: 'Rapid Execution',
        description: 'High-speed trading bot optimized for rapid execution in active Volatility markets.',
    },
    {
        id: 'tp-even-odd',
        name: 'TradersPulse Even/Odd Profit Bot',
        file: 'tradepulse_even_odd profit bot.xml',
        category: ['turbo-ai'],
        strategy: 'Parity Equilibrium',
        description: 'Digit-based trading bot specializing in Even/Odd parity bursts and controlled recovery.',
    },
];

const CANDLES: Array<{ x: number; wTop: number; wBot: number; bTop: number; bH: number; bull: boolean }> = [
    { x: 20, wTop: 72, wBot: 96, bTop: 78, bH: 12, bull: true },
    { x: 35, wTop: 65, wBot: 92, bTop: 71, bH: 15, bull: false },
    { x: 50, wTop: 55, wBot: 86, bTop: 62, bH: 16, bull: true },
    { x: 65, wTop: 54, wBot: 84, bTop: 60, bH: 16, bull: false },
    { x: 80, wTop: 48, wBot: 80, bTop: 54, bH: 18, bull: true },
    { x: 180, wTop: 40, wBot: 70, bTop: 46, bH: 16, bull: true },
    { x: 195, wTop: 44, wBot: 74, bTop: 50, bH: 15, bull: false },
    { x: 210, wTop: 32, wBot: 62, bTop: 38, bH: 15, bull: false },
    { x: 225, wTop: 36, wBot: 66, bTop: 42, bH: 15, bull: false },
    { x: 240, wTop: 20, wBot: 52, bTop: 26, bH: 17, bull: true },
];

const BotCardArtwork: React.FC<{ number: number }> = ({ number }) => {
    const auraId = `tp-bot-aura-${number}`;
    const numGradId = `tp-bot-num-${number}`;
    const isDoubleDigit = number >= 10;

    return (
        <div className='free-bot-card__artwork' aria-hidden='true'>
            <svg viewBox='0 0 260 112' className='free-bot-card__svg' preserveAspectRatio='xMidYMid meet'>
                <defs>
                    <radialGradient id={auraId} cx='50%' cy='56%' r='46%'>
                        <stop offset='0%' stopColor='#0f52ba' stopOpacity='0.52' />
                        <stop offset='58%' stopColor='#082a6b' stopOpacity='0.22' />
                        <stop offset='100%' stopColor='#040b1a' stopOpacity='0' />
                    </radialGradient>
                    <linearGradient id={numGradId} x1='0%' y1='0%' x2='0%' y2='100%'>
                        <stop offset='0%' stopColor='#2575fc' />
                        <stop offset='55%' stopColor='#0e47b8' />
                        <stop offset='100%' stopColor='#08276e' />
                    </linearGradient>
                </defs>

                <ellipse cx='130' cy='62' rx='82' ry='48' fill={`url(#${auraId})`} />

                {CANDLES.map(c => {
                    const color = c.bull ? '#1d6bf3' : '#d93438';
                    return (
                        <g key={c.x}>
                            <line
                                x1={c.x}
                                y1={c.wTop}
                                x2={c.x}
                                y2={c.wBot}
                                stroke={color}
                                strokeWidth='1.35'
                                strokeLinecap='round'
                                opacity='0.92'
                            />
                            <rect
                                x={c.x - 4}
                                y={c.bTop}
                                width='8'
                                height={c.bH}
                                rx='1.5'
                                fill={color}
                                opacity='0.95'
                            />
                        </g>
                    );
                })}

                <ellipse
                    cx='130'
                    cy='91'
                    rx={isDoubleDigit ? '31' : '25'}
                    ry='7.2'
                    fill='rgba(14, 71, 184, 0.2)'
                    stroke='#2b8aff'
                    strokeWidth='1.75'
                />
                <ellipse
                    cx='130'
                    cy='91'
                    rx={isDoubleDigit ? '21' : '16.5'}
                    ry='4.1'
                    fill='none'
                    stroke='rgba(125, 211, 252, 0.42)'
                    strokeWidth='1'
                />

                <text
                    x='130'
                    y='80'
                    textAnchor='middle'
                    fill={`url(#${numGradId})`}
                    stroke='#47a8ff'
                    strokeWidth='2.2'
                    paintOrder='stroke fill'
                    fontFamily="'Inter', system-ui, -apple-system, sans-serif"
                    fontWeight='900'
                    fontSize={isDoubleDigit ? '54' : '64'}
                    letterSpacing={isDoubleDigit ? '-2' : '0'}
                    style={{ filter: 'drop-shadow(0 0 12px rgba(0, 114, 255, 0.65))' }}
                >
                    {number}
                </text>
            </svg>
        </div>
    );
};

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
            console.error('[FreeBots] Error loading bot:', err);
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
                            Digits &amp; Core ({SPECIAL_BOTS_CATALOG.filter(b => b.category.includes('special')).length})
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
                    <div className='free-bots__panel'>
                        <div className='free-bots__grid'>
                            {filteredBots.map((bot, idx) => {
                                const botNumber = idx + 1;
                                const isLoadingThis = loadingBotId === bot.id;

                                return (
                                    <article key={bot.id} className='free-bot-card'>
                                        <BotCardArtwork number={botNumber} />

                                        <h3 className='free-bot-card__title' title={bot.description}>
                                            {bot.name}
                                        </h3>

                                        <button
                                            type='button'
                                            className='free-bot-card__load-btn'
                                            disabled={isLoadingThis}
                                            onClick={() => handleLoadBot(bot)}
                                        >
                                            <span className='free-bot-card__load-icon' aria-hidden='true'>
                                                <svg width='14' height='14' viewBox='0 0 16 16' fill='none'>
                                                    <path
                                                        d='M8 2.2v7.6m0 0L5.2 7m2.8 2.8L10.8 7M3 13h10'
                                                        stroke='currentColor'
                                                        strokeWidth='1.75'
                                                        strokeLinecap='round'
                                                        strokeLinejoin='round'
                                                    />
                                                </svg>
                                            </span>
                                            <span className='free-bot-card__load-label'>
                                                {isLoadingThis ? 'LOADING…' : 'LOAD BOT'}
                                            </span>
                                            <span className='free-bot-card__load-chevron' aria-hidden='true'>
                                                <svg width='13' height='13' viewBox='0 0 16 16' fill='none'>
                                                    <path
                                                        d='M6 3.5L10.5 8 6 12.5'
                                                        stroke='currentColor'
                                                        strokeWidth='1.9'
                                                        strokeLinecap='round'
                                                        strokeLinejoin='round'
                                                    />
                                                </svg>
                                            </span>
                                        </button>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
});

export default FreeBots;
