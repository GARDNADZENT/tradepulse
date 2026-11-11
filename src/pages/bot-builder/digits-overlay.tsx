import React, { useEffect, useMemo, useState } from 'react';
import { api_base } from '@/external/bot-skeleton';
import './digits-overlay.scss';

const getWorkspaceSymbol = (): string => {
    try {
        const ws = (window as any)?.Blockly?.derivWorkspace;
        const blocks = ws?.getAllBlocks?.(false) || [];
        const marketBlock = blocks.find((b: any) => b.type === 'trade_definition_market');
        const sym = marketBlock?.getFieldValue?.('SYMBOL_LIST');
        return sym || '1HZ10V';
    } catch {
        return '1HZ10V';
    }
};

const extractLastDigit = (quote: number, pipSize = 2): number => {
    const fixed = Number(quote).toFixed(pipSize);
    const ch = fixed.slice(-1);
    const n = parseInt(ch, 10);
    return Number.isNaN(n) ? 0 : n;
};

const DigitsOverlay: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [symbol, setSymbol] = useState<string>('1HZ10V');
    const [digits, setDigits] = useState<number[]>([]);
    const [lastQuote, setLastQuote] = useState<string>('--');

    useEffect(() => {
        if (!isOpen) return;

        const activeSym = getWorkspaceSymbol();
        setSymbol(activeSym);

        let pipSize = 2;
        let isMounted = true;

        api_base?.api
            ?.send({
                ticks_history: activeSym,
                adjust_start_time: 1,
                count: 100,
                end: 'latest',
                style: 'ticks',
                subscribe: 1,
            })
            .then((res: any) => {
                if (!isMounted) return;
                if (typeof res?.pip_size === 'number') pipSize = res.pip_size;
                const prices: number[] = res?.history?.prices || [];
                if (prices.length) {
                    setDigits(prices.slice(-100).map(p => extractLastDigit(p, pipSize)));
                    setLastQuote(Number(prices[prices.length - 1]).toFixed(pipSize));
                }
            })
            .catch(() => {});

        const sub = api_base?.api?.onMessage?.()?.subscribe?.(({ data }: any) => {
            if (!isMounted || !data) return;
            if (data.msg_type === 'tick' && data.tick?.symbol === activeSym) {
                if (typeof data.tick.pip_size === 'number') pipSize = data.tick.pip_size;
                const q = Number(data.tick.quote);
                setLastQuote(q.toFixed(pipSize));
                const d = extractLastDigit(q, pipSize);
                setDigits(prev => [...prev.slice(-99), d]);
            }
        });

        return () => {
            isMounted = false;
            sub?.unsubscribe?.();
        };
    }, [isOpen]);

    const stats = useMemo(() => {
        const counts = Array(10).fill(0);
        digits.forEach(d => {
            if (d >= 0 && d <= 9) counts[d]++;
        });
        const total = digits.length || 1;
        const pcts = counts.map(c => Number(((c / total) * 100).toFixed(1)));
        const maxPct = Math.max(...pcts, 1);
        const minPct = Math.min(...pcts);
        const currentDigit = digits.length ? digits[digits.length - 1] : null;
        return { pcts, maxPct, minPct, currentDigit };
    }, [digits]);

    return (
        <div className='bb-digits-overlay'>
            <button
                type='button'
                className={`bb-digits-overlay__pill ${isOpen ? 'bb-digits-overlay__pill--active' : ''}`}
                onClick={() => setIsOpen(prev => !prev)}
                title='Toggle Live Digits Strip'
            >
                <svg width='13' height='13' viewBox='0 0 24 24' fill='none' aria-hidden='true'>
                    <rect x='3' y='12' width='4' height='9' rx='1' fill='currentColor' />
                    <rect x='10' y='6' width='4' height='15' rx='1' fill='currentColor' />
                    <rect x='17' y='3' width='4' height='18' rx='1' fill='currentColor' />
                </svg>
                <span>Digits</span>
            </button>

            {isOpen && (
                <div className='bb-digits-overlay__panel'>
                    <div className='bb-digits-overlay__header'>
                        <span className='bb-digits-overlay__symbol'>{symbol}</span>
                        <span className='bb-digits-overlay__quote'>Spot: {lastQuote}</span>
                        <span className='bb-digits-overlay__recent'>
                            Last 5: {digits.slice(-5).join(', ') || '--'}
                        </span>
                        <button
                            type='button'
                            className='bb-digits-overlay__close'
                            onClick={() => setIsOpen(false)}
                            aria-label='Close Digits Overlay'
                        >
                            ✕
                        </button>
                    </div>
                    <div className='bb-digits-overlay__grid'>
                        {stats.pcts.map((pct, d) => {
                            const isHot = pct === stats.maxPct && digits.length > 0;
                            const isCold = pct === stats.minPct && digits.length > 0;
                            const isCurrent = stats.currentDigit === d;
                            return (
                                <div
                                    key={d}
                                    className={`bb-digits-overlay__cell ${isCurrent ? 'is-current' : ''} ${
                                        isHot ? 'is-hot' : isCold ? 'is-cold' : ''
                                    }`}
                                >
                                    <span className='bb-digits-overlay__digit'>{d}</span>
                                    <span className='bb-digits-overlay__pct'>{pct}%</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DigitsOverlay;
