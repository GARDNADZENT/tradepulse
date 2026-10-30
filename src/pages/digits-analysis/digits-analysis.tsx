import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getAppId } from '@/components/shared';
import './digits-analysis.scss';

const VOLATILITY_MARKETS = [
    { symbol: 'R_100', label: 'Volatility 100 Index' },
    { symbol: '1HZ100V', label: 'Volatility 100 (1s) Index' },
    { symbol: 'R_75', label: 'Volatility 75 Index' },
    { symbol: '1HZ75V', label: 'Volatility 75 (1s) Index' },
    { symbol: 'R_50', label: 'Volatility 50 Index' },
    { symbol: '1HZ50V', label: 'Volatility 50 (1s) Index' },
    { symbol: 'R_25', label: 'Volatility 25 Index' },
    { symbol: '1HZ25V', label: 'Volatility 25 (1s) Index' },
    { symbol: 'R_10', label: 'Volatility 10 Index' },
    { symbol: '1HZ10V', label: 'Volatility 10 (1s) Index' },
];

const TICK_WINDOWS = [100, 250, 500, 1000];

const inferPipSize = (prices: number[], fallbackPip?: number): number => {
    if (typeof fallbackPip === 'number' && fallbackPip >= 0 && fallbackPip <= 6) return fallbackPip;
    let maxDec = 2;
    for (const p of prices.slice(-40)) {
        const parts = String(p).split('.');
        if (parts[1] && parts[1].length > maxDec) {
            maxDec = Math.min(5, parts[1].length);
        }
    }
    return maxDec;
};

const extractLastDigit = (quote: number, pipSize: number): number => {
    const fixed = Number(quote).toFixed(pipSize);
    const ch = fixed[fixed.length - 1];
    const d = Number(ch);
    return Number.isFinite(d) ? d : 0;
};

export const DigitsAnalysis: React.FC = () => {
    const [symbol, setSymbol] = useState<string>('R_100');
    const [tickWindow, setTickWindow] = useState<number>(500);
    const [digits, setDigits] = useState<number[]>([]);
    const [latestPrice, setLatestPrice] = useState<string>('—');
    const [isLive, setIsLive] = useState<boolean>(false);

    const pipRef = useRef<number>(2);

    useEffect(() => {
        let closed = false;
        setIsLive(false);
        setDigits([]);

        const appId = getAppId() || 1089;
        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);

        ws.onopen = () => {
            if (closed) return;
            ws.send(
                JSON.stringify({
                    ticks_history: symbol,
                    adjust_start_time: 1,
                    count: tickWindow,
                    end: 'latest',
                    style: 'ticks',
                    subscribe: 1,
                })
            );
        };

        ws.onmessage = evt => {
            if (closed) return;
            try {
                const msg = JSON.parse(evt.data);
                if (msg.msg_type === 'history' && msg.history?.prices) {
                    const rawPrices: number[] = msg.history.prices.map(Number);
                    pipRef.current = inferPipSize(rawPrices, msg.pip_size);
                    const extracted = rawPrices.map(p => extractLastDigit(p, pipRef.current));
                    setDigits(extracted.slice(-tickWindow));
                    if (rawPrices.length > 0) {
                        setLatestPrice(rawPrices[rawPrices.length - 1].toFixed(pipRef.current));
                    }
                    setIsLive(true);
                } else if (msg.msg_type === 'tick' && msg.tick) {
                    if (typeof msg.tick.pip_size === 'number') {
                        pipRef.current = msg.tick.pip_size;
                    }
                    const q = Number(msg.tick.quote);
                    const d = extractLastDigit(q, pipRef.current);
                    setLatestPrice(q.toFixed(pipRef.current));
                    setIsLive(true);
                    setDigits(prev => {
                        const next = [...prev, d];
                        return next.length > tickWindow ? next.slice(next.length - tickWindow) : next;
                    });
                }
            } catch {}
        };

        ws.onerror = () => {
            if (!closed) setIsLive(false);
        };

        return () => {
            closed = true;
            try {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ forget_all: 'ticks' }));
                }
                ws.close();
            } catch {}
        };
    }, [symbol, tickWindow]);

    const stats = useMemo(() => {
        const counts = Array(10).fill(0) as number[];
        let even = 0;
        let odd = 0;
        let over4 = 0;
        let under5 = 0;

        for (const d of digits) {
            if (d >= 0 && d <= 9) {
                counts[d]++;
                if (d % 2 === 0) even++;
                else odd++;
                if (d > 4) over4++;
                else under5++;
            }
        }

        const total = digits.length || 1;
        const pcts = counts.map(c => (c / total) * 100);

        let hottestDigit = 0;
        let coldestDigit = 0;
        for (let i = 1; i < 10; i++) {
            if (counts[i] > counts[hottestDigit]) hottestDigit = i;
            if (counts[i] < counts[coldestDigit]) coldestDigit = i;
        }

        const maxPct = Math.max(...pcts, 14);
        const currentDigit = digits.length > 0 ? digits[digits.length - 1] : null;

        return {
            counts,
            pcts,
            hottestDigit,
            hottestPct: pcts[hottestDigit] || 0,
            coldestDigit,
            coldestPct: pcts[coldestDigit] || 0,
            evenPct: (even / total) * 100,
            oddPct: (odd / total) * 100,
            over4Pct: (over4 / total) * 100,
            under5Pct: (under5 / total) * 100,
            maxPct,
            currentDigit,
            last30: digits.slice(-30),
        };
    }, [digits]);

    const selectedMarketLabel = VOLATILITY_MARKETS.find(m => m.symbol === symbol)?.label || symbol;

    return (
        <div className='tp-digits-page'>
            <div className='tp-digits-page__inner'>
                <section className='tp-digits-card'>
                    <header className='tp-digits-card__header'>
                        <div className='tp-digits-card__title-group'>
                            <h1 className='tp-digits-card__title'>
                                {tickWindow}-Tick Live Digits &amp; Parity Analysis
                            </h1>
                            <span className='tp-digits-card__subtitle'>
                                {selectedMarketLabel} · Quote: <strong>{latestPrice}</strong>
                            </span>
                        </div>

                        <div className='tp-digits-card__controls'>
                            <select
                                className='tp-digits-card__select'
                                value={symbol}
                                onChange={e => setSymbol(e.target.value)}
                                aria-label='Select synthetic market'
                            >
                                {VOLATILITY_MARKETS.map(m => (
                                    <option key={m.symbol} value={m.symbol}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>

                            <select
                                className='tp-digits-card__select tp-digits-card__select--compact'
                                value={tickWindow}
                                onChange={e => setTickWindow(Number(e.target.value))}
                                aria-label='Select tick count'
                            >
                                {TICK_WINDOWS.map(w => (
                                    <option key={w} value={w}>
                                        {w} Ticks
                                    </option>
                                ))}
                            </select>

                            <span className={`tp-digits-card__live-pill${isLive ? ' tp-digits-card__live-pill--on' : ''}`}>
                                <span className='tp-digits-card__live-dot' />
                                {isLive ? `LIVE ${digits.length} TICKS` : 'CONNECTING…'}
                            </span>
                        </div>
                    </header>

                    <div className='tp-digits-card__kpis'>
                        <div className='tp-digits-kpi'>
                            <span className='tp-digits-kpi__label'>Sample Window</span>
                            <strong className='tp-digits-kpi__value'>{digits.length || tickWindow} Ticks</strong>
                        </div>
                        <div className='tp-digits-kpi tp-digits-kpi--hot'>
                            <span className='tp-digits-kpi__label'>Hottest Digit</span>
                            <strong className='tp-digits-kpi__value'>
                                {stats.hottestDigit} · {stats.hottestPct.toFixed(1)}%
                            </strong>
                        </div>
                        <div className='tp-digits-kpi tp-digits-kpi--cold'>
                            <span className='tp-digits-kpi__label'>Coldest Digit</span>
                            <strong className='tp-digits-kpi__value'>
                                {stats.coldestDigit} · {stats.coldestPct.toFixed(1)}%
                            </strong>
                        </div>
                        <div className='tp-digits-kpi'>
                            <span className='tp-digits-kpi__label'>Even Parity</span>
                            <strong className='tp-digits-kpi__value'>{stats.evenPct.toFixed(1)}%</strong>
                        </div>
                        <div className='tp-digits-kpi'>
                            <span className='tp-digits-kpi__label'>Odd Parity</span>
                            <strong className='tp-digits-kpi__value'>{stats.oddPct.toFixed(1)}%</strong>
                        </div>
                    </div>

                    <div className='tp-digits-card__bars'>
                        {stats.pcts.map((pct, digit) => {
                            const isHot = digit === stats.hottestDigit && digits.length > 0;
                            const isCold = digit === stats.coldestDigit && digits.length > 0;
                            const isCurrent = digit === stats.currentDigit;
                            const barHeight = Math.max(8, Math.round((pct / stats.maxPct) * 100));

                            return (
                                <div
                                    key={digit}
                                    className={`tp-digit-col${isCurrent ? ' tp-digit-col--active' : ''}`}
                                >
                                    <span
                                        className={`tp-digit-col__pct${isHot ? ' tp-digit-col__pct--hot' : ''}${isCold ? ' tp-digit-col__pct--cold' : ''}`}
                                    >
                                        {pct.toFixed(1)}%
                                    </span>
                                    <div className='tp-digit-col__track'>
                                        <div
                                            className={`tp-digit-col__fill${isHot ? ' tp-digit-col__fill--hot' : ''}${isCold ? ' tp-digit-col__fill--cold' : ''}`}
                                            style={{ height: `${barHeight}%` }}
                                        />
                                    </div>
                                    <span
                                        className={`tp-digit-col__badge${isCurrent ? ' tp-digit-col__badge--current' : ''}${isHot ? ' tp-digit-col__badge--hot' : ''}`}
                                    >
                                        {digit}
                                    </span>
                                    <span className='tp-digit-col__count'>{stats.counts[digit]}x</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className='tp-digits-card__splits'>
                        <div className='tp-split-meter'>
                            <div className='tp-split-meter__labels'>
                                <span>Even ({stats.evenPct.toFixed(1)}%)</span>
                                <span>Odd ({stats.oddPct.toFixed(1)}%)</span>
                            </div>
                            <div className='tp-split-meter__bar'>
                                <div className='tp-split-meter__left' style={{ width: `${stats.evenPct}%` }} />
                            </div>
                        </div>

                        <div className='tp-split-meter'>
                            <div className='tp-split-meter__labels'>
                                <span>Under 5 (0–4: {stats.under5Pct.toFixed(1)}%)</span>
                                <span>Over 4 (5–9: {stats.over4Pct.toFixed(1)}%)</span>
                            </div>
                            <div className='tp-split-meter__bar'>
                                <div
                                    className='tp-split-meter__left tp-split-meter__left--emerald'
                                    style={{ width: `${stats.under5Pct}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className='tp-digits-card__tape-wrap'>
                        <div className='tp-digits-card__tape-title'>Last 30 Tick Digits</div>
                        <div className='tp-digits-card__tape'>
                            {stats.last30.map((d, idx) => {
                                const isNewest = idx === stats.last30.length - 1;
                                const isEven = d % 2 === 0;
                                return (
                                    <span
                                        key={`${idx}-${d}`}
                                        className={`tp-tick-pill${isEven ? ' tp-tick-pill--even' : ' tp-tick-pill--odd'}${isNewest ? ' tp-tick-pill--latest' : ''}`}
                                    >
                                        {d}
                                    </span>
                                );
                            })}
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};

export default DigitsAnalysis;
