import React, { useEffect, useMemo, useRef, useState } from 'react';
import { getPreferredV3SocketURL } from '@/components/shared';
import './floating-tools.scss';

type ActiveOverlay = 'digits' | 'risk' | null;

const QUICK_MARKETS = [
    { symbol: 'R_100', label: 'Volatility 100' },
    { symbol: '1HZ100V', label: 'Volatility 100 (1s)' },
    { symbol: 'R_75', label: 'Volatility 75' },
    { symbol: '1HZ75V', label: 'Volatility 75 (1s)' },
    { symbol: 'R_50', label: 'Volatility 50' },
    { symbol: '1HZ50V', label: 'Volatility 50 (1s)' },
];

export const FloatingTools: React.FC = () => {
    const [openDrawer, setOpenDrawer] = useState<ActiveOverlay>(null);

    // Quick Digits state
    const [symbol, setSymbol] = useState('R_100');
    const [digits, setDigits] = useState<number[]>([]);
    const pipRef = useRef<number>(2);

    // Quick Risk state
    const [capital, setCapital] = useState('100');
    const [stakePct, setStakePct] = useState('4');
    const [slPct, setSlPct] = useState('25');
    const [tpPct, setTpPct] = useState('15');

    useEffect(() => {
        if (openDrawer !== 'digits') return;
        let closed = false;
        setDigits([]);

        const ws = new WebSocket(getPreferredV3SocketURL());
        ws.onopen = () => {
            if (!closed) {
                ws.send(
                    JSON.stringify({
                        ticks_history: symbol,
                        adjust_start_time: 1,
                        count: 250,
                        end: 'latest',
                        style: 'ticks',
                        subscribe: 1,
                    })
                );
            }
        };
        ws.onmessage = evt => {
            if (closed) return;
            try {
                const msg = JSON.parse(evt.data);
                if (msg.msg_type === 'history' && msg.history?.prices) {
                    const prices: number[] = msg.history.prices.map(Number);
                    pipRef.current = typeof msg.pip_size === 'number' ? msg.pip_size : 2;
                    setDigits(
                        prices.map(p => {
                            const f = p.toFixed(pipRef.current);
                            return Number(f[f.length - 1]) || 0;
                        })
                    );
                } else if (msg.msg_type === 'tick' && msg.tick) {
                    if (typeof msg.tick.pip_size === 'number') pipRef.current = msg.tick.pip_size;
                    const f = Number(msg.tick.quote).toFixed(pipRef.current);
                    const d = Number(f[f.length - 1]) || 0;
                    setDigits(prev => [...prev.slice(-249), d]);
                }
            } catch {}
        };
        return () => {
            closed = true;
            try {
                ws.close();
            } catch {}
        };
    }, [openDrawer, symbol]);

    const digitStats = useMemo(() => {
        const counts = Array(10).fill(0) as number[];
        let even = 0;
        for (const d of digits) {
            if (d >= 0 && d <= 9) {
                counts[d]++;
                if (d % 2 === 0) even++;
            }
        }
        const total = digits.length || 1;
        const pcts = counts.map(c => (c / total) * 100);
        let hot = 0;
        let cold = 0;
        for (let i = 1; i < 10; i++) {
            if (counts[i] > counts[hot]) hot = i;
            if (counts[i] < counts[cold]) cold = i;
        }
        return {
            pcts,
            hot,
            cold,
            evenPct: (even / total) * 100,
            oddPct: ((total - even) / total) * 100,
            lastDigit: digits.length ? digits[digits.length - 1] : null,
        };
    }, [digits]);

    const riskValues = useMemo(() => {
        const cap = Math.max(0, parseFloat(capital) || 0);
        const s = Math.max(0.35, (cap * (parseFloat(stakePct) || 0)) / 100);
        const sl = (cap * (parseFloat(slPct) || 0)) / 100;
        const tp = (cap * (parseFloat(tpPct) || 0)) / 100;
        return {
            stake: cap > 0 ? s : 0,
            sl,
            tp,
        };
    }, [capital, stakePct, slPct, tpPct]);

    return (
        <div className='tp-floating-tools'>
            {openDrawer === 'digits' && (
                <div className='tp-floating-drawer'>
                    <div className='tp-floating-drawer__head'>
                        <div>
                            <span className='tp-floating-drawer__eyebrow'>LIVE OVERLAY · 250 TICKS</span>
                            <h4>Quick Digits Scanner</h4>
                        </div>
                        <button type='button' onClick={() => setOpenDrawer(null)} aria-label='Close'>
                            ✕
                        </button>
                    </div>
                    <div className='tp-floating-drawer__body'>
                        <div className='tp-floating-drawer__row'>
                            <select value={symbol} onChange={e => setSymbol(e.target.value)}>
                                {QUICK_MARKETS.map(m => (
                                    <option key={m.symbol} value={m.symbol}>
                                        {m.label}
                                    </option>
                                ))}
                            </select>
                            <span className='tp-floating-drawer__stat'>
                                Even {digitStats.evenPct.toFixed(0)}% / Odd {digitStats.oddPct.toFixed(0)}%
                            </span>
                        </div>

                        <div className='tp-floating-digits-grid'>
                            {digitStats.pcts.map((pct, d) => {
                                const isHot = d === digitStats.hot && digits.length > 0;
                                const isCold = d === digitStats.cold && digits.length > 0;
                                const isNow = d === digitStats.lastDigit;
                                return (
                                    <div
                                        key={d}
                                        className={`tp-floating-digit${isHot ? ' is-hot' : ''}${isCold ? ' is-cold' : ''}${isNow ? ' is-now' : ''}`}
                                    >
                                        <strong>{d}</strong>
                                        <span>{pct.toFixed(1)}%</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {openDrawer === 'risk' && (
                <div className='tp-floating-drawer'>
                    <div className='tp-floating-drawer__head'>
                        <div>
                            <span className='tp-floating-drawer__eyebrow'>POSITION CALCULATOR</span>
                            <h4>Quick Risk Plan</h4>
                        </div>
                        <button type='button' onClick={() => setOpenDrawer(null)} aria-label='Close'>
                            ✕
                        </button>
                    </div>
                    <div className='tp-floating-drawer__body'>
                        <div className='tp-floating-risk-inputs'>
                            <label>
                                <span>Capital ($)</span>
                                <input type='number' value={capital} onChange={e => setCapital(e.target.value)} />
                            </label>
                            <label>
                                <span>Stake (%)</span>
                                <input type='number' value={stakePct} onChange={e => setStakePct(e.target.value)} />
                            </label>
                            <label>
                                <span>Stop Loss (%)</span>
                                <input type='number' value={slPct} onChange={e => setSlPct(e.target.value)} />
                            </label>
                            <label>
                                <span>Take Profit (%)</span>
                                <input type='number' value={tpPct} onChange={e => setTpPct(e.target.value)} />
                            </label>
                        </div>

                        <div className='tp-floating-risk-results'>
                            <div>
                                <span>Stake</span>
                                <strong>${riskValues.stake.toFixed(2)}</strong>
                            </div>
                            <div className='tp'>
                                <span>Take Profit</span>
                                <strong>${riskValues.tp.toFixed(2)}</strong>
                            </div>
                            <div className='sl'>
                                <span>Stop Loss</span>
                                <strong>${riskValues.sl.toFixed(2)}</strong>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className='tp-floating-tools__pills'>
                <button
                    type='button'
                    className={`tp-floating-pill tp-floating-pill--digits${openDrawer === 'digits' ? ' is-open' : ''}`}
                    onClick={() => setOpenDrawer(prev => (prev === 'digits' ? null : 'digits'))}
                >
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                        <path d='M4 18V10M10 18V6M16 18v-8M22 18V4' stroke='currentColor' strokeWidth='2.4' strokeLinecap='round' />
                    </svg>
                    <span>Digits</span>
                </button>

                <button
                    type='button'
                    className={`tp-floating-pill tp-floating-pill--risk${openDrawer === 'risk' ? ' is-open' : ''}`}
                    onClick={() => setOpenDrawer(prev => (prev === 'risk' ? null : 'risk'))}
                >
                    <svg width='15' height='15' viewBox='0 0 24 24' fill='none'>
                        <path
                            d='M12 3l7 3v6c0 4.5-3 8.2-7 9-4-.8-7-4.5-7-9V6l7-3z'
                            stroke='currentColor'
                            strokeWidth='2.1'
                            strokeLinejoin='round'
                        />
                    </svg>
                    <span>Risk</span>
                </button>
            </div>
        </div>
    );
};

export default FloatingTools;
