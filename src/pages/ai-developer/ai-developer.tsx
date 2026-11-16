import React, { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useStore } from '@/hooks/useStore';
import { derivBus } from '@/lib/deriv/tick-bus';
import AIAssistant from './ai-assistant';
import './ai-developer.scss';

// The page is AI-first: the header chip is the only market context, and every
// strategy detail comes from the conversation.
const LIVE_SYMBOL = '1HZ10V';

const AIDeveloper = observer(() => {
    const { dashboard, load_modal, run_panel } = useStore();

    const [liveDigits, setLiveDigits] = useState<number[]>([]);
    const [liveQuote, setLiveQuote] = useState('—');

    useEffect(() => {
        let cancelled = false;
        let lastFlush = 0;
        let pendingQuote = '';
        let pendingDigits: number[] | null = null;
        let flushTimer: number | undefined;

        const extract = (sym: string, list: { t: number; price: number }[]) => {
            if (cancelled || sym !== LIVE_SYMBOL || !list.length) return;
            const pip = derivBus.getPipSize(LIVE_SYMBOL);
            setLiveQuote(list[list.length - 1].price.toFixed(pip));
            setLiveDigits(
                list.slice(-200).map(item => {
                    const s = Math.abs(item.price).toFixed(pip);
                    return Number(s.charAt(s.length - 1)) || 0;
                })
            );
        };

        let u1 = () => {};
        let u2 = () => {};
        let rel = () => {};

        const rafId = requestAnimationFrame(() => {
            if (cancelled) return;
            u1 = derivBus.onHistory(extract);
            u2 = derivBus.onTick((sym, tk) => {
                if (cancelled || sym !== LIVE_SYMBOL) return;
                const pip = derivBus.getPipSize(LIVE_SYMBOL);
                const s = Math.abs(tk.price).toFixed(pip);
                const d = Number(s.charAt(s.length - 1)) || 0;
                pendingQuote = tk.price.toFixed(pip);
                const flush = () => {
                    flushTimer = undefined;
                    if (cancelled) return;
                    lastFlush = performance.now();
                    if (pendingQuote) setLiveQuote(pendingQuote);
                    if (pendingDigits) {
                        const batch = pendingDigits;
                        pendingDigits = null;
                        setLiveDigits(prev => [...prev, ...batch].slice(-200));
                    }
                };
                pendingDigits = pendingDigits ? [...pendingDigits, d] : [d];
                const elapsed = performance.now() - lastFlush;
                if (elapsed >= 450) {
                    flush();
                } else if (flushTimer === undefined) {
                    flushTimer = window.setTimeout(flush, 450 - elapsed);
                }
            });
            extract(LIVE_SYMBOL, derivBus.getTicks(LIVE_SYMBOL));
            rel = derivBus.subscribe([LIVE_SYMBOL]);
        });

        return () => {
            cancelled = true;
            cancelAnimationFrame(rafId);
            if (flushTimer !== undefined) window.clearTimeout(flushTimer);
            u1();
            u2();
            rel();
        };
    }, []);

    return (
        <div className='ai-dev'>
            <div className='ai-dev__inner'>
                <header className='ai-dev__header'>
                    <div>
                        <span className='ai-dev__kicker'>TRADERSPULSE AI STRATEGY ARCHITECT</span>
                        <h1>AI Developer</h1>
                        <p>
                            Describe your Deriv bot in plain English. Review the generated strategy, then load it into
                            Bot Builder — nothing runs until you start it.
                        </p>
                    </div>
                    <div className='ai-dev__live-chip'>
                        <span className='ai-dev__dot' />
                        <span>
                            {LIVE_SYMBOL} · Quote <strong>{liveQuote}</strong> ({liveDigits.length}t)
                        </span>
                    </div>
                </header>

                <AIAssistant dashboard={dashboard} load_modal={load_modal} run_panel={run_panel} />
            </div>
        </div>
    );
});

export default AIDeveloper;
