import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { api_base } from '@/external/bot-skeleton';
import { useStore } from '@/hooks/useStore';
import { derivBus } from '@/lib/deriv/tick-bus';
import {
    AIBotContractKind,
    compileAIBotToXml,
    executeLiveDerivTrade,
    loadXmlIntoBotBuilder,
} from '@/utils/ai-bot-xml-builder';
import './ai-bots.scss';

interface DigitStat {
    digit: number;
    count: number;
    pct: number;
    color: string;
}

type CardTradeFamily = 'EVEN_ODD' | 'OVER_UNDER' | 'DIFF_MATCH' | 'RISE_FALL';

interface MarketCard {
    symbol: string;
    display_name: string;
    current_quote: string;
    digits: DigitStat[];
    last_digits: number[];
    even_pct: number;
    odd_pct: number;
    over_pct: number;
    under_pct: number;
    rise_pct: number;
    fall_pct: number;
    coldest_digit: number;
    hottest_digit: number;
    primary_payout: string;
    secondary_payout: string;
    strong_count: number;
    moderate_count: number;
}

const CONTINUOUS_MARKETS = [
    { symbol: '1HZ10V', display_name: 'Volatility 10 (1s) Index' },
    { symbol: '1HZ25V', display_name: 'Volatility 25 (1s) Index' },
    { symbol: '1HZ50V', display_name: 'Volatility 50 (1s) Index' },
    { symbol: '1HZ75V', display_name: 'Volatility 75 (1s) Index' },
    { symbol: '1HZ100V', display_name: 'Volatility 100 (1s) Index' },
    { symbol: 'R_10', display_name: 'Volatility 10 Index' },
    { symbol: 'R_25', display_name: 'Volatility 25 Index' },
    { symbol: 'R_50', display_name: 'Volatility 50 Index' },
    { symbol: 'R_75', display_name: 'Volatility 75 Index' },
    { symbol: 'R_100', display_name: 'Volatility 100 Index' },
];

const TICK_OPTIONS = [30, 60, 100, 120, 240, 500, 1000];
const SQUARES_COUNT = 10;

const DIGIT_COLORS = {
    most: '#10b981',
    second: '#38bdf8',
    least: '#ef4444',
    second_least: '#f59e0b',
    neutral: '#64748b',
};

function getLastDigit(quote: number, pip = 2): number {
    const fixed = Math.abs(quote).toFixed(Math.max(0, pip));
    return Number(fixed.charAt(fixed.length - 1)) || 0;
}

function computeCardStats(symbol: string, rawTicks: { t: number; price: number }[], windowSize: number) {
    const pip = derivBus.getPipSize(symbol);
    const slice = rawTicks.slice(-windowSize);
    const total = slice.length || 1;
    const counts = new Array(10).fill(0);
    let even = 0;
    let over4 = 0;
    let rises = 0;

    slice.forEach((tk, idx) => {
        const d = getLastDigit(tk.price, pip);
        counts[d]++;
        if (d % 2 === 0) even++;
        if (d > 4) over4++;
        if (idx > 0 && tk.price > slice[idx - 1].price) rises++;
    });

    const indexed = counts.map((count, digit) => ({
        digit,
        count,
        pct: Math.round((count / total) * 1000) / 10,
    }));

    const sorted = [...indexed].sort((a, b) => b.count - a.count);
    const colorMap: Record<number, string> = {};
    if (slice.length > 0) {
        colorMap[sorted[0].digit] = DIGIT_COLORS.most;
        if (sorted.length > 1) colorMap[sorted[1].digit] = DIGIT_COLORS.second;
        colorMap[sorted[sorted.length - 1].digit] = DIGIT_COLORS.least;
        if (sorted.length > 2) colorMap[sorted[sorted.length - 2].digit] = DIGIT_COLORS.second_least;
    }

    const digits: DigitStat[] = indexed.map(item => ({
        ...item,
        color: colorMap[item.digit] || DIGIT_COLORS.neutral,
    }));

    let strong = 0;
    let moderate = 0;
    digits.forEach(d => {
        if (d.pct >= 13) strong++;
        else if (d.pct >= 11) moderate++;
    });

    const even_pct = slice.length ? Math.round((even / total) * 1000) / 10 : 50;
    const odd_pct = Math.round((100 - even_pct) * 10) / 10;
    const over_pct = slice.length ? Math.round((over4 / total) * 1000) / 10 : 50;
    const under_pct = Math.round((100 - over_pct) * 10) / 10;
    const moveDenom = Math.max(1, slice.length - 1);
    const rise_pct = slice.length > 1 ? Math.round((rises / moveDenom) * 1000) / 10 : 50;
    const fall_pct = Math.round((100 - rise_pct) * 10) / 10;

    return {
        current_quote: slice.length ? slice[slice.length - 1].price.toFixed(pip) : '—',
        digits,
        last_digits: slice.slice(-SQUARES_COUNT).map(t => getLastDigit(t.price, pip)),
        even_pct,
        odd_pct,
        over_pct,
        under_pct,
        rise_pct,
        fall_pct,
        hottest_digit: sorted[0]?.digit ?? 0,
        coldest_digit: sorted[sorted.length - 1]?.digit ?? 9,
        strong_count: strong,
        moderate_count: moderate,
    };
}

const AIBots = observer(() => {
    const { client, dashboard, load_modal, run_panel, journal, transactions, summary_card } = useStore();
    const currency = client?.currency || 'USD';

    const [activeTicks, setActiveTicks] = useState(120);
    const [tradeFamily, setTradeFamily] = useState<Record<string, CardTradeFamily>>({});
    const [stakes, setStakes] = useState<Record<string, string>>({});
    const [durations, setDurations] = useState<Record<string, string>>({});
    const [barriers, setBarriers] = useState<Record<string, string>>({});
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [statusBanner, setStatusBanner] = useState<string | null>(null);

    const [cards, setCards] = useState<MarketCard[]>(() =>
        CONTINUOUS_MARKETS.map(m => ({
            symbol: m.symbol,
            display_name: m.display_name,
            current_quote: '—',
            digits: Array.from({ length: 10 }, (_, i) => ({
                digit: i,
                count: 0,
                pct: 0,
                color: DIGIT_COLORS.neutral,
            })),
            last_digits: [],
            even_pct: 50,
            odd_pct: 50,
            over_pct: 50,
            under_pct: 50,
            rise_pct: 50,
            fall_pct: 50,
            hottest_digit: 0,
            coldest_digit: 9,
            primary_payout: `${currency} 1.95`,
            secondary_payout: `${currency} 1.95`,
            strong_count: 0,
            moderate_count: 0,
        }))
    );

    useEffect(() => {
        const symbols = CONTINUOUS_MARKETS.map(m => m.symbol);

        const refreshSymbol = (sym: string) => {
            const buf = derivBus.getTicks(sym);
            if (!buf.length) return;
            const computed = computeCardStats(sym, buf, activeTicks);
            setCards(prev => prev.map(c => (c.symbol === sym ? { ...c, ...computed } : c)));
        };

        const unsubHist = derivBus.onHistory(sym => refreshSymbol(sym));
        const unsubTick = derivBus.onTick(sym => refreshSymbol(sym));
        symbols.forEach(s => refreshSymbol(s));
        const release = derivBus.subscribe(symbols);

        return () => {
            unsubHist();
            unsubTick();
            release();
        };
    }, [activeTicks]);

    useEffect(() => {
        if (!api_base?.api) return;
        let cancelled = false;
        const fetchLivePayouts = async () => {
            for (const m of CONTINUOUS_MARKETS.slice(0, 5)) {
                if (cancelled) return;
                try {
                    let r = await (api_base.api as any).send({
                        proposal: 1,
                        amount: 1,
                        basis: 'stake',
                        contract_type: 'DIGITEVEN',
                        currency,
                        duration: 1,
                        duration_unit: 't',
                        underlying_symbol: m.symbol,
                    });
                    if (r?.error?.code === 'InputValidationFailed') {
                        r = await (api_base.api as any).send({
                            proposal: 1,
                            amount: 1,
                            basis: 'stake',
                            contract_type: 'DIGITEVEN',
                            currency,
                            duration: 1,
                            duration_unit: 't',
                            symbol: m.symbol,
                        });
                    }
                    const pay = r?.proposal?.payout;
                    if (pay && !cancelled) {
                        setCards(prev =>
                            prev.map(c =>
                                c.symbol === m.symbol
                                    ? {
                                          ...c,
                                          primary_payout: `${currency} ${Number(pay).toFixed(2)}`,
                                          secondary_payout: `${currency} ${Number(pay).toFixed(2)}`,
                                      }
                                    : c
                            )
                        );
                    }
                } catch {}
            }
        };
        void fetchLivePayouts();
        return () => {
            cancelled = true;
        };
    }, [currency]);

    const getCardFamily = (sym: string): CardTradeFamily => tradeFamily[sym] || 'EVEN_ODD';
    const getCardStake = (sym: string): number => Math.max(0.35, Number(stakes[sym] ?? '1') || 1);
    const getCardDuration = (sym: string): number => Math.max(1, Math.min(10, Math.round(Number(durations[sym] ?? '1') || 1)));
    const getCardBarrier = (sym: string, fallback = 4): number =>
        Math.max(0, Math.min(9, Math.round(Number(barriers[sym] ?? String(fallback)) || fallback)));

    const handleQuickTrade = async (card: MarketCard, side: 'PRIMARY' | 'SECONDARY') => {
        const fam = getCardFamily(card.symbol);
        let contractType: AIBotContractKind = 'DIGITEVEN';
        let barrier: number | undefined;

        if (fam === 'EVEN_ODD') {
            contractType = side === 'PRIMARY' ? 'DIGITEVEN' : 'DIGITODD';
        } else if (fam === 'OVER_UNDER') {
            contractType = side === 'PRIMARY' ? 'DIGITOVER' : 'DIGITUNDER';
            barrier = getCardBarrier(card.symbol, 4);
        } else if (fam === 'DIFF_MATCH') {
            contractType = side === 'PRIMARY' ? 'DIGITDIFF' : 'DIGITMATCH';
            barrier = getCardBarrier(card.symbol, side === 'PRIMARY' ? card.coldest_digit : card.hottest_digit);
        } else {
            contractType = side === 'PRIMARY' ? 'CALL' : 'PUT';
        }

        const key = `${card.symbol}-${side}`;
        setBusyKey(key);
        setStatusBanner(null);
        try {
            const res = await executeLiveDerivTrade({
                symbol: card.symbol,
                contractType,
                stake: getCardStake(card.symbol),
                duration: getCardDuration(card.symbol),
                barrier,
                currency,
                stores: { journal, transactions, summary_card, run_panel },
            });
            setStatusBanner(
                `Executed ${contractType}${barrier !== undefined ? ` (${barrier})` : ''} on ${card.display_name} · Contract #${res.contractId} · Payout ${currency} ${res.payout.toFixed(2)}`
            );
        } catch (err: any) {
            setStatusBanner(err?.message || 'Trade execution failed.');
        } finally {
            setBusyKey(null);
        }
    };

    const handleDeployCardBot = async (card: MarketCard, runNow = false) => {
        const fam = getCardFamily(card.symbol);
        let contractType: AIBotContractKind = 'DIGITEVEN';
        let barrier = 4;
        if (fam === 'EVEN_ODD') {
            contractType = card.even_pct >= card.odd_pct ? 'DIGITEVEN' : 'DIGITODD';
        } else if (fam === 'OVER_UNDER') {
            contractType = card.over_pct >= card.under_pct ? 'DIGITOVER' : 'DIGITUNDER';
            barrier = getCardBarrier(card.symbol, 4);
        } else if (fam === 'DIFF_MATCH') {
            contractType = 'DIGITDIFF';
            barrier = card.coldest_digit;
        } else {
            contractType = card.rise_pct >= card.fall_pct ? 'CALL' : 'PUT';
        }

        const xml = compileAIBotToXml({
            name: `AI Scanner ${card.symbol} (${contractType})`,
            symbol: card.symbol,
            contractType,
            barrier,
            durationTicks: getCardDuration(card.symbol),
            baseStake: getCardStake(card.symbol),
            martingaleMultiplier: contractType === 'DIGITDIFF' ? 11 : 2.1,
            takeProfit: Number((getCardStake(card.symbol) * 10).toFixed(2)),
            stopLoss: Number((getCardStake(card.symbol) * 25).toFixed(2)),
            virtualHookEnabled: true,
            virtualHookStartMode: 'virtual',
            virtualHookLosses: 1,
            virtualHookWins: 1,
        });

        await loadXmlIntoBotBuilder({
            xml,
            name: `AI Scanner ${card.symbol} (${contractType})`,
            dashboard,
            load_modal,
            runNow,
            run_panel,
        });
    };

    const totalStrong = cards.reduce((sum, c) => sum + c.strong_count, 0);
    const totalModerate = cards.reduce((sum, c) => sum + c.moderate_count, 0);

    return (
        <div className='scanner-new'>
            <div className='container'>
                <div className='scanner-head'>
                    <div>
                        <h2>AI Bots &amp; Multi-Market Scanner</h2>
                        <p>Live 10-market synthetic digit intelligence with instant trade execution &amp; 1-click AI Bot deployment</p>
                    </div>
                    <div className='ticks'>
                        <span className='ticks-label'>NO. OF TICKS</span>
                        <div className='ticks-pills'>
                            {TICK_OPTIONS.map(t => (
                                <button
                                    key={t}
                                    type='button'
                                    className={t === activeTicks ? 'active' : ''}
                                    onClick={() => setActiveTicks(t)}
                                >
                                    {t}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {statusBanner && <div className='scanner-banner'>{statusBanner}</div>}

                <div className='legend'>
                    <div className='legend-left'>
                        <div className='legend-item'>
                            <span className='legend-dot' style={{ background: DIGIT_COLORS.most }} />
                            Most Appearing
                        </div>
                        <div className='legend-item'>
                            <span className='legend-dot' style={{ background: DIGIT_COLORS.second }} />
                            2nd Most
                        </div>
                        <div className='legend-item'>
                            <span className='legend-dot' style={{ background: DIGIT_COLORS.least }} />
                            Least Appearing
                        </div>
                        <div className='legend-item'>
                            <span className='legend-dot' style={{ background: DIGIT_COLORS.second_least }} />
                            2nd Least
                        </div>
                    </div>
                    <div className='legend-right'>
                        <div className='title'>
                            <span className='legend-dot' style={{ background: '#0066ff' }} />
                            MARKET STRENGTH
                        </div>
                        <span className='pill pill--strong'>{totalStrong} STRONG</span>
                        <span className='pill'>{totalModerate} MODERATE</span>
                    </div>
                </div>

                <div className='grid'>
                    {cards.map(card => {
                        const fam = getCardFamily(card.symbol);
                        const primaryLabel =
                            fam === 'EVEN_ODD'
                                ? 'Trade Even'
                                : fam === 'OVER_UNDER'
                                  ? `Trade Over ${getCardBarrier(card.symbol, 4)}`
                                  : fam === 'DIFF_MATCH'
                                    ? `Differs ${getCardBarrier(card.symbol, card.coldest_digit)}`
                                    : 'Trade Rise';
                        const secondaryLabel =
                            fam === 'EVEN_ODD'
                                ? 'Trade Odd'
                                : fam === 'OVER_UNDER'
                                  ? `Trade Under ${getCardBarrier(card.symbol, 4)}`
                                  : fam === 'DIFF_MATCH'
                                    ? `Matches ${getCardBarrier(card.symbol, card.hottest_digit)}`
                                    : 'Trade Fall';
                        const primaryPct =
                            fam === 'EVEN_ODD'
                                ? card.even_pct
                                : fam === 'OVER_UNDER'
                                  ? card.over_pct
                                  : fam === 'DIFF_MATCH'
                                    ? Number((100 - (card.digits[card.coldest_digit]?.pct || 10)).toFixed(1))
                                    : card.rise_pct;
                        const secondaryPct =
                            fam === 'EVEN_ODD'
                                ? card.odd_pct
                                : fam === 'OVER_UNDER'
                                  ? card.under_pct
                                  : fam === 'DIFF_MATCH'
                                    ? card.digits[card.hottest_digit]?.pct || 10
                                    : card.fall_pct;

                        return (
                            <div key={card.symbol} className='card'>
                                <div className='card-head'>
                                    <div className='card-title'>
                                        <span className='card-symbol-badge'>{card.symbol}</span>
                                        {card.display_name}
                                    </div>
                                    <div className='card-value'>{card.current_quote}</div>
                                </div>

                                <div className='circles'>
                                    {card.digits.map(d => (
                                        <div key={d.digit} className='circle-wrap'>
                                            <div
                                                className='circle-inner'
                                                style={{ '--color': d.color } as React.CSSProperties}
                                            >
                                                {d.digit}
                                            </div>
                                            <div className='pct'>{d.pct}%</div>
                                        </div>
                                    ))}
                                </div>

                                <div className='squares'>
                                    {Array.from({ length: SQUARES_COUNT }).map((_, i) => {
                                        const digit = card.last_digits[i];
                                        const isEven = digit !== undefined && digit % 2 === 0;
                                        return (
                                            <div
                                                key={i}
                                                className={`sq ${isEven ? 'teal' : digit !== undefined ? 'red' : 'empty'}`}
                                            >
                                                {digit !== undefined ? digit : '—'}
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className={`controls${fam === 'OVER_UNDER' || fam === 'DIFF_MATCH' ? ' controls--four' : ''}`}>
                                    <div>
                                        <div className='label'>Trade Type</div>
                                        <select
                                            className='box-input'
                                            value={fam}
                                            onChange={e =>
                                                setTradeFamily(prev => ({
                                                    ...prev,
                                                    [card.symbol]: e.target.value as CardTradeFamily,
                                                }))
                                            }
                                        >
                                            <option value='EVEN_ODD'>Even / Odd</option>
                                            <option value='OVER_UNDER'>Over / Under</option>
                                            <option value='DIFF_MATCH'>Differs / Matches</option>
                                            <option value='RISE_FALL'>Rise / Fall</option>
                                        </select>
                                    </div>
                                    {(fam === 'OVER_UNDER' || fam === 'DIFF_MATCH') && (
                                        <div>
                                            <div className='label'>Digit</div>
                                            <input
                                                className='box-input'
                                                type='number'
                                                min={0}
                                                max={9}
                                                value={barriers[card.symbol] ?? (fam === 'DIFF_MATCH' ? String(card.coldest_digit) : '4')}
                                                onChange={e =>
                                                    setBarriers(prev => ({ ...prev, [card.symbol]: e.target.value }))
                                                }
                                            />
                                        </div>
                                    )}
                                    <div>
                                        <div className='label'>Stake</div>
                                        <input
                                            className='box-input'
                                            type='number'
                                            min={0.35}
                                            step={0.1}
                                            value={stakes[card.symbol] ?? '1'}
                                            onChange={e =>
                                                setStakes(prev => ({ ...prev, [card.symbol]: e.target.value }))
                                            }
                                        />
                                    </div>
                                    <div>
                                        <div className='label'>Ticks</div>
                                        <input
                                            className='box-input'
                                            type='number'
                                            min={1}
                                            max={10}
                                            value={durations[card.symbol] ?? '1'}
                                            onChange={e =>
                                                setDurations(prev => ({ ...prev, [card.symbol]: e.target.value }))
                                            }
                                        />
                                    </div>
                                </div>

                                <div className='payout'>
                                    <button
                                        type='button'
                                        className='payout-box teal'
                                        disabled={busyKey === `${card.symbol}-PRIMARY`}
                                        onClick={() => void handleQuickTrade(card, 'PRIMARY')}
                                    >
                                        <div className='top'>
                                            <span>{busyKey === `${card.symbol}-PRIMARY` ? 'Buying…' : primaryLabel}</span>
                                            <span>{primaryPct}%</span>
                                        </div>
                                        <div className='bottom'>
                                            <span>Est. payout</span>
                                            <span>{card.primary_payout}</span>
                                        </div>
                                    </button>
                                    <button
                                        type='button'
                                        className='payout-box red'
                                        disabled={busyKey === `${card.symbol}-SECONDARY`}
                                        onClick={() => void handleQuickTrade(card, 'SECONDARY')}
                                    >
                                        <div className='top'>
                                            <span>{busyKey === `${card.symbol}-SECONDARY` ? 'Buying…' : secondaryLabel}</span>
                                            <span>{secondaryPct}%</span>
                                        </div>
                                        <div className='bottom'>
                                            <span>Est. payout</span>
                                            <span>{card.secondary_payout}</span>
                                        </div>
                                    </button>
                                </div>

                                <div className='card-bot-actions'>
                                    <button
                                        type='button'
                                        className='card-bot-btn card-bot-btn--primary'
                                        onClick={() => void handleDeployCardBot(card, false)}
                                    >
                                        Load AI Bot in Builder
                                    </button>
                                    <button
                                        type='button'
                                        className='card-bot-btn card-bot-btn--secondary'
                                        onClick={() => {
                                            window.dispatchEvent(
                                                new CustomEvent('tp-dtrader-prefill', {
                                                    detail: {
                                                        symbol: card.symbol,
                                                        contractType: card.even_pct >= card.odd_pct ? 'DIGITEVEN' : 'DIGITODD',
                                                        barrier: card.coldest_digit,
                                                    },
                                                })
                                            );
                                            dashboard.setActiveTab(DBOT_TABS.DTRADER);
                                        }}
                                    >
                                        Open in DTrader
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
});

export default AIBots;
