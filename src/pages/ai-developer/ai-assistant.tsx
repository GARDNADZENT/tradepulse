import React, { useEffect, useRef, useState } from 'react';
import { compileAIBotToXml, loadXmlIntoBotBuilder } from '@/utils/ai-bot-xml-builder';
import { describeEntryRule } from './ai-rule-description';
import { AIStrategy, sensitive, validateAnswer } from './ai-strategy-validation';

type Message = { role: 'user' | 'assistant'; content: string; display?: string };
const initialMessage = 'Tell me what you want your bot to do. I’ll ask for any missing details before preparing a strategy.';

export default function AIAssistant({ dashboard, load_modal, run_panel }: { dashboard: any; load_modal: any; run_panel: any }) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [spec, setSpec] = useState<AIStrategy | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [showXml, setShowXml] = useState(false);
    const [loadingBot, setLoadingBot] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    useEffect(() => () => abortRef.current?.abort(), []);

    const sendMessage = async (event: React.FormEvent) => {
        event.preventDefault();
        const text = input.trim();
        if (!text || busy) return;
        if (sensitive(text)) { setError('Please never send API keys or login tokens in chat. Revoke any exposed key.'); return; }
        const next: Message[] = [...messages, { role: 'user', content: text }];
        setMessages(next);
        setInput('');
        setSpec(null); // A draft never survives an unanswered revision or failed request.
        setShowXml(false);
        setError('');
        setBusy(true);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const response = await fetch('/api/ai-developer', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ messages: next.slice(-16).map(({ role, content }) => ({ role, content })) }),
                signal: controller.signal,
            });
            let data: any;
            try { data = await response.json(); } catch { throw new Error('AI Developer is unavailable. Please try again later.'); }
            // If the AI produced a readable reply but no valid draft, keep it in the
            // conversation so the user can clarify instead of hitting a dead end.
            const showReply = () => {
                if (typeof data?.reply === 'string' && data.reply.trim()) {
                    setMessages(prev => [...prev, { role: 'assistant', content: data.reply, display: data.reply }]);
                }
            };
            if (!response.ok) { showReply(); throw new Error(typeof data?.error === 'string' ? data.error : 'AI Developer is unavailable.'); }
            if (!validateAnswer(data)) { showReply(); throw new Error('The AI returned an invalid strategy. Please clarify and try again.'); }
            setMessages(prev => [...prev, { role: 'assistant', content: JSON.stringify(data), display: data.reply }]);
            setSpec(data.spec);
        } catch (err) {
            if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'AI Developer is unavailable.');
        } finally {
            if (!controller.signal.aborted) setBusy(false);
        }
    };

    const xml = spec ? compileAIBotToXml({ ...spec, virtualHookEnabled: false, assistantVirtualHook: spec.virtualHook || undefined }) : '';
    const xmlValid = !!xml && !new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror');
    const load = async () => {
        if (!spec || !xmlValid || !load_modal?.loadStrategyToBuilder || loadingBot) return;
        if (run_panel?.is_running || run_panel?.has_open_contract) {
            setError('Stop the current bot and wait for open contracts to settle before loading this draft.');
            return;
        }
        setLoadingBot(true);
        setError('');
        try {
            await loadXmlIntoBotBuilder({ xml, name: spec.name, dashboard, load_modal, run_panel, runNow: false });
        } catch {
            setError('Could not load the bot. Please try again.');
        } finally { setLoadingBot(false); }
    };
    const prediction = spec && ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(spec.contractType);
    const rules = spec?.rules || [];
    const hasRules = rules.length > 0;
    return (
        <section className='ai-chat' aria-label='AI Strategy Assistant'>
            <div className='ai-chat__conversation'>
                <div className='ai-chat__heading'><div><span className='ai-chat__eyebrow'>OPENROUTER AI</span><h2>AI Strategy Assistant</h2><p>Describe a bot and refine it together.</p></div><button type='button' disabled={busy} onClick={() => { setMessages([]); setSpec(null); setShowXml(false); setError(''); setInput(''); }}>New chat</button></div>
                <div className='ai-chat__messages' aria-live='polite'>
                    <div className='ai-chat__message ai-chat__message--assistant'><strong>Assistant</strong><p>{initialMessage}</p></div>
                    {messages.map((message, index) => <div key={index} className={`ai-chat__message ai-chat__message--${message.role}`}><strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong><p>{message.display || message.content}</p></div>)}
                    {busy && <div className='ai-chat__thinking'>Thinking…</div>}
                </div>
                {error && <div className='ai-chat__error' role='alert'>{error}</div>}
                <form className='ai-chat__form' onSubmit={sendMessage}>
                    <label className='ai-chat__sr-only' htmlFor='ai-chat-input'>Your strategy message</label>
                    <textarea id='ai-chat-input' value={input} maxLength={4000} onChange={event => setInput(event.target.value)} placeholder='Describe your bot or answer the assistant…' rows={2} />
                    <button type='submit' disabled={busy || !input.trim()}>{busy ? 'Thinking…' : 'Send'}</button>
                </form>
                <p className='ai-chat__privacy'>Messages are sent to OpenRouter and its selected model provider. Don’t share passwords, API keys or account tokens.</p>
            </div>
            <aside className='ai-chat__review'>
                <div className='ai-chat__review-top'><h2>Strategy review</h2><span className={spec ? 'ai-chat__badge ai-chat__badge--ready' : 'ai-chat__badge'}>{spec ? 'Draft ready' : 'Needs details'}</span></div>
                {spec ? <>
                    <p className='ai-chat__review-note'>Check every detail. The AI can make mistakes.</p>
                    <dl>
                        <div><dt>Name</dt><dd>{spec.name}</dd></div>
                        <div><dt>Market</dt><dd>{spec.symbol}</dd></div>
                        <div><dt>Contract</dt><dd>{spec.contractType}{prediction ? ` · ${spec.barrier}` : ''} · {spec.durationTicks} tick(s)</dd></div>
                        <div><dt>Entry</dt><dd>{hasRules ? 'Rules are checked in order every tick; if none match, wait for the next tick' : spec.entryFilter === 'INSTANT' ? 'Every cycle (instant)' : `Latest digit equals ${spec.entryDigit} (not guaranteed fresh)`}</dd></div>
                        <div><dt>Stake / multiplier</dt><dd>{spec.baseStake} / ×{spec.martingaleMultiplier}</dd></div>
                        <div><dt>After a loss</dt><dd>{hasRules ? '' : prediction ? `Prediction ${spec.recoveryBarrier}; ` : ''}multiply stake ×{spec.martingaleMultiplier}; reset on win</dd></div>
                        <div><dt>Virtual hook</dt><dd>{spec.virtualHook ? `Start virtual; ${spec.virtualHook.virtualLosses} consecutive losses or ${spec.virtualHook.virtualWins} consecutive wins → real; real loss → virtual; real stake preserved` : 'Off'}</dd></div>
                        {hasRules && <div className='ai-chat__rules'><dt>Rules (first match wins)</dt><dd><ol>{rules.map((rule, index) => <li key={index}>{describeEntryRule(rule)}</li>)}</ol></dd></div>}
                        <div><dt>TP / SL</dt><dd>{spec.takeProfit} / {spec.stopLoss} (account currency)</dd></div>
                    </dl>
                </> : <p className='ai-chat__empty'>Once the details are complete, your draft strategy will appear here. Entries can be a single contract or ordered rules: digit streaks, over/under runs, parity or over/under shares, rising/falling tick runs, and AND/OR groups. The virtual-hook rule supports one-tick digit contracts. Paired virtual hedges are not supported.</p>}
                <div className='ai-chat__actions'>
                    <button type='button' disabled={!xmlValid || busy} onClick={() => setShowXml(v => !v)}>{showXml ? 'Hide XML' : 'Preview XML'}</button>
                    <button type='button' className='ai-chat__primary' disabled={!xmlValid || busy || loadingBot} onClick={() => void load()}>{loadingBot ? 'Loading…' : 'Load into Bot Builder'}</button>
                </div>
                <p className='ai-chat__warning'>Review and test on a demo account. AI does not guarantee profit. Virtual trades are simulations and may differ from real execution. Martingale can rapidly increase losses; TP/SL are checked after settlement and may be exceeded.</p>
            </aside>
            {showXml && xmlValid && <div className='ai-chat__xml'><strong>Generated Blockly XML</strong><pre>{xml}</pre></div>}
        </section>
    );
}
