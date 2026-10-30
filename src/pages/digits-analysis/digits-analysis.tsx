import React, { useEffect, useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { DBOT_TABS } from '@/constants/bot-contents';
import { useStore } from '@/hooks/useStore';
import { derivBus } from '@/lib/deriv/tick-bus';
import { compileAIBotToXml, loadXmlIntoBotBuilder } from '@/utils/ai-bot-xml-builder';
import '../riskmanagers-tools.scss';

const MARKETS = [
    { symbol: 'R_10', label: 'Volatility 10 Index' },
    { symbol: 'R_25', label: 'Volatility 25 Index' },
    { symbol: 'R_50', label: 'Volatility 50 Index' },
    { symbol: 'R_75', label: 'Volatility 75 Index' },
    { symbol: 'R_100', label: 'Volatility 100 Index' },
    { symbol: '1HZ10V', label: 'Volatility 10 (1s) Index' },
    { symbol: '1HZ25V', label: 'Volatility 25 (1s) Index' },
    { symbol: '1HZ50V', label: 'Volatility 50 (1s) Index' },
    { symbol: '1HZ75V', label: 'Volatility 75 (1s) Index' },
    { symbol: '1HZ100V', label: 'Volatility 100 (1s) Index' },
    { symbol: 'JD10', label: 'Jump 10 Index' },
    { symbol: 'JD25', label: 'Jump 25 Index' },
    { symbol: 'JD50', label: 'Jump 50 Index' },
    { symbol: 'JD75', label: 'Jump 75 Index' },
    { symbol: 'JD100', label: 'Jump 100 Index' },
];

const WINDOWS = [100, 250, 500, 1000];

const getDigit = (value: number, pip = 2) => {
    const fixed = Math.abs(value).toFixed(Math.max(0, pip));
    return Number(fixed.charAt(fixed.length - 1)) || 0;
};

const DigitsAnalysis = observer(() => {
    const { dashboard, load_modal, run_panel } = useStore();
    const [symbol, setSymbol] = useState('R_50');
    const [windowSize, setWindowSize] = useState(500);
    const [digits, setDigits] = useState<number[]>([]);
    const [quote, setQuote] = useState<string>('—');
    const [status, setStatus] = useState('Connecting…');

    useEffect(() => {
        let cancelled = false;
        setStatus('Loading live digits…');

        const syncFromBuffer = (sym: string, list: { t: number; price: number }[]) => {
            if (cancelled || sym !== symbol || !list.length) return;
            const pip = derivBus.getPipSize(symbol);
            const mapped = list.slice(-windowSize).map(item => getDigit(item.price, pip));
            setDigits(mapped);
            setQuote(list[list.length - 1].price.toFixed(pip));
            setStatus('Live');
        };

        const unsubHist = derivBus.onHistory(syncFromBuffer);
        const unsubTick = derivBus.onTick((sym, tick) => {
            if (cancelled || sym !== symbol) return;
            const pip = derivBus.getPipSize(symbol);
            const d = getDigit(tick.price, pip);
            setQuote(tick.price.toFixed(pip));
            setStatus('Live');
            setDigits(prev => [...prev, d].slice(-windowSize));
        });

        const existing = derivBus.getTicks(symbol);
        if (existing.length) {
            syncFromBuffer(symbol, existing);
        }
        const releaseSub = derivBus.subscribe([symbol]);

        return () => {
            cancelled = true;
            unsubHist();
            unsubTick();
            releaseSub();
        };
    }, [symbol, windowSize]);

    const counts = useMemo(() => Array.from({ length: 10 }, (_, d) => digits.filter(x => x === d).length), [digits]);
    const total = digits.length || 1;
    const even = digits.filter(d => d % 2 === 0).length;
    const odd = digits.length - even;
    const over4 = digits.filter(d => d > 4).length;
    const hottest = counts.indexOf(Math.max(...counts));
    const coldest = counts.indexOf(Math.min(...counts));
    const currentDigit = digits.length ? digits[digits.length - 1] : null;

    const handleSendToDTrader = (contractType: string, barrier: number) => {
        window.dispatchEvent(
            new CustomEvent('tp-dtrader-prefill', {
                detail: { symbol, contractType, barrier },
            })
        );
        dashboard.setActiveTab(DBOT_TABS.DTRADER);
    };

    const handleLoadDigitBot = async (mode: 'DIFFERS_COLD' | 'EVEN_ODD' | 'OVER_UNDER', runNow = false) => {
        const evenPct = (even / total) * 100;
        const overPct = (over4 / total) * 100;
        const contractType =
            mode === 'DIFFERS_COLD'
                ? 'DIGITDIFF'
                : mode === 'EVEN_ODD'
                  ? evenPct >= 50
                      ? 'DIGITEVEN'
                      : 'DIGITODD'
                  : overPct >= 50
                    ? 'DIGITOVER'
                    : 'DIGITUNDER';
        const barrier = mode === 'DIFFERS_COLD' ? coldest : contractType === 'DIGITOVER' ? 2 : 7;

        const xml = compileAIBotToXml({
            name: `Digits Analysis ${contractType} (${symbol})`,
            symbol,
            contractType,
            barrier,
            baseStake: 1,
            martingaleMultiplier: mode === 'DIFFERS_COLD' ? 11 : 2.1,
            takeProfit: 10,
            stopLoss: 25,
            virtualHookEnabled: true,
            virtualHookStartMode: 'virtual',
            virtualHookLosses: 1,
            virtualHookWins: 1,
        });

        await loadXmlIntoBotBuilder({
            xml,
            name: `Digits Analysis ${contractType} (${symbol})`,
            dashboard,
            load_modal,
            runNow,
            run_panel,
        });
    };

    return (
        <div className='rm-tool'>
            <div className='rm-tool__header'>
                <div>
                    <h2>Digits Analysis</h2>
                    <span>{windowSize}-tick live digit distribution and parity analysis</span>
                </div>
                <div className='rm-tool__header-actions'>
                    <span className='rm-status'>Quote: {quote}</span>
                    <span className={status === 'Live' ? 'rm-status rm-status--live' : 'rm-status'}>{status}</span>
                </div>
            </div>

            <div className='rm-card'>
                <div className='rm-toolbar-row'>
                    <select value={symbol} onChange={e => setSymbol(e.target.value)} aria-label='Market'>
                        {MARKETS.map(m => (
                            <option key={m.symbol} value={m.symbol}>
                                {m.label} — {m.symbol}
                            </option>
                        ))}
                    </select>

                    <div className='rm-window-pills'>
                        {WINDOWS.map(w => (
                            <button
                                key={w}
                                type='button'
                                className={`rm-window-pill${windowSize === w ? ' rm-window-pill--active' : ''}`}
                                onClick={() => setWindowSize(w)}
                            >
                                {w} Ticks
                            </button>
                        ))}
                    </div>
                </div>

                <div className='rm-analysis-summary'>
                    <div>
                        <strong>{digits.length}</strong>
                        <span>Ticks Sampled</span>
                    </div>
                    <div>
                        <strong style={{ color: '#34d399' }}>
                            {hottest} ({((counts[hottest] / total) * 100).toFixed(1)}%)
                        </strong>
                        <span>Hottest Digit</span>
                    </div>
                    <div>
                        <strong style={{ color: '#f87171' }}>
                            {coldest} ({((counts[coldest] / total) * 100).toFixed(1)}%)
                        </strong>
                        <span>Coldest Digit</span>
                    </div>
                    <div>
                        <strong>{((even / total) * 100).toFixed(1)}%</strong>
                        <span>Even Parity</span>
                    </div>
                    <div>
                        <strong>{((odd / total) * 100).toFixed(1)}%</strong>
                        <span>Odd Parity</span>
                    </div>
                    <div>
                        <strong>
                            {((over4 / total) * 100).toFixed(1)}% / {(((digits.length - over4) / total) * 100).toFixed(1)}%
                        </strong>
                        <span>Over 4 / Under 5</span>
                    </div>
                </div>

                <div className='rm-bars'>
                    {counts.map((count, d) => {
                        const pct = (count / total) * 100;
                        const isHot = digits.length > 0 && d === hottest;
                        const isCold = digits.length > 0 && d === coldest;
                        const isCurrent = d === currentDigit;
                        return (
                            <div
                                className={`rm-bar${isHot ? ' rm-bar--hot' : ''}${isCold ? ' rm-bar--cold' : ''}${isCurrent ? ' rm-bar--current' : ''}`}
                                key={d}
                            >
                                <span>{d}</span>
                                <div>
                                    <i style={{ width: `${Math.max(2, Math.min(100, pct * 4))}%` }} />
                                </div>
                                <strong>{pct.toFixed(1)}%</strong>
                            </div>
                        );
                    })}
                </div>

                <div style={{ marginTop: '1.8rem' }}>
                    <div className='rm-muted'>Last 30 Live Tick Digits (Latest highlighted)</div>
                    <div className='rm-last-digits'>
                        {digits.slice(-30).map((d, i, arr) => (
                            <span
                                key={`${i}-${d}`}
                                className={`${d % 2 === 0 ? 'is-even' : 'is-odd'}${i === arr.length - 1 ? ' is-latest' : ''}`}
                            >
                                {d}
                            </span>
                        ))}
                    </div>
                </div>

                <div className='rm-actions-bar'>
                    <button
                        type='button'
                        className='rm-button rm-button--primary'
                        onClick={() => handleSendToDTrader('DIGITDIFF', coldest)}
                    >
                        Trade Differs {coldest} in DTrader
                    </button>
                    <button
                        type='button'
                        className='rm-button rm-button--secondary'
                        onClick={() => void handleLoadDigitBot('DIFFERS_COLD', false)}
                    >
                        Load Differs ({coldest}) Bot
                    </button>
                    <button
                        type='button'
                        className='rm-button rm-button--secondary'
                        onClick={() => void handleLoadDigitBot('EVEN_ODD', false)}
                    >
                        Load Dominant Parity Bot
                    </button>
                    <button
                        type='button'
                        className='rm-button rm-button--emerald'
                        onClick={() => void handleLoadDigitBot('OVER_UNDER', true)}
                    >
                        Load &amp; Run Over/Under Bot
                    </button>
                </div>
            </div>
        </div>
    );
});

export default DigitsAnalysis;
