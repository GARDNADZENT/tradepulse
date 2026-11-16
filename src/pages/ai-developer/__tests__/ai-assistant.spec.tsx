import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AIAssistant from '../ai-assistant';
import { compileAIBotToXml, loadXmlIntoBotBuilder } from '@/utils/ai-bot-xml-builder';
import { answerProblem, specProblem, validateAnswer, validateSpec } from '../ai-strategy-validation';

jest.mock('@/utils/ai-bot-xml-builder', () => ({
    compileAIBotToXml: jest.fn(() => '<xml><block type="trade_definition" /></xml>'),
    loadXmlIntoBotBuilder: jest.fn().mockResolvedValue(undefined),
}));
const spec = { name: 'Test Bot', symbol: '1HZ100V', contractType: 'DIGITOVER', barrier: 5, recoveryBarrier: 5, durationTicks: 1, baseStake: 1, martingaleMultiplier: 1, takeProfit: 10, stopLoss: 20, entryFilter: 'EXACT_DIGIT', entryDigit: 4, virtualHook: null };
const send = (message: string) => { fireEvent.change(screen.getByLabelText('Your strategy message'), { target: { value: message } }); fireEvent.click(screen.getByRole('button', { name: 'Send' })); };

describe('AI strategy assistant', () => {
    beforeEach(() => { jest.clearAllMocks(); global.fetch = jest.fn(); });
    it('validates an exact supported spec and rejects unsafe/unsupported variations', () => {
        expect(validateSpec(spec)).toBe(true);
        for (const patch of [{ contractType: 'HEDGE' }, { entryFilter: 'STREAK' }, { symbol: 'BAD' }, { barrier: 9 }, { baseStake: NaN }, { extra: '<xml />' }, { name: '<script>' }]) expect(validateSpec({ ...spec, ...patch })).toBe(false);
        expect(validateAnswer({ reply: 'Please clarify.', spec: null })).toBe(true);
        expect(validateAnswer({ reply: 'Ready', spec: { ...spec, takeProfit: -1 } })).toBe(false);
    });
    const streakSpec = {
        ...spec,
        name: 'Even Odd Streak',
        contractType: 'DIGITODD',
        barrier: 0,
        recoveryBarrier: 0,
        entryFilter: 'INSTANT',
        entryDigit: 0,
        baseStake: 0.35,
        martingaleMultiplier: 1.2,
        virtualHook: { virtualLosses: 2, virtualWins: 1 },
        rules: [
            { name: 'Odd after 3 even', when: { type: 'PARITY_STREAK', parity: 'EVEN', count: 3 }, contractType: 'DIGITODD' },
            { name: 'Even after 3 odd', when: { type: 'PARITY_STREAK', parity: 'ODD', count: 3 }, contractType: 'DIGITEVEN' },
        ],
    };
    it('accepts ordered multi-rule strategies and rejects unsafe rule shapes', () => {
        expect(validateSpec(streakSpec)).toBe(true);
        expect(specProblem(streakSpec)).toBeNull();
        const reasons: Array<[any, string]> = [
            [{ ...streakSpec, rules: [] }, 'between 1 and 12'],
            [{ ...streakSpec, contractType: 'DIGITEVEN' }, 'must equal the first rule'],
            [{ ...streakSpec, barrier: 4 }, 'barrier must equal the first rule'],
            [{ ...streakSpec, entryFilter: 'EXACT_DIGIT' }, 'entryFilter must be INSTANT'],
            [{ ...streakSpec, recoveryBarrier: 3 }, 'recoveryBarrier must equal barrier'],
            [{ ...streakSpec, rules: [{ ...streakSpec.rules[0], when: { type: 'MOON_PHASE' } }] }, 'unsupported entry condition'],
            [{ ...streakSpec, rules: [{ ...streakSpec.rules[0], when: { type: 'PARITY_STREAK', parity: 'EVEN', count: 0 } }] }, 'count must be an integer from 1 to 20'],
            [{ ...streakSpec, rules: [{ ...streakSpec.rules[0], extra: true }] }, 'unexpected key'],
            [{ ...streakSpec, rules: [{ ...streakSpec.rules[0], name: '<script>' }] }, 'name must be'],
            [{ ...streakSpec, rules: [{ name: 'Rise', when: { type: 'ALWAYS' }, contractType: 'CALL' }], contractType: 'CALL', barrier: 0, recoveryBarrier: 0 }, 'every rule buys a digit contract'],
            [{ ...streakSpec, rules: [{ ...streakSpec.rules[0], when: { type: 'ALL', of: [{ type: 'ALWAYS' }] } }] }, '2 to 5 conditions'],
            [(() => { const { virtualHook, ...rest } = streakSpec; return rest; })(), 'missing required key "virtualHook"'],
        ];
        for (const [candidate, message] of reasons) expect(specProblem(candidate)).toContain(message);
        expect(validateSpec({ ...streakSpec, rules: [{ ...streakSpec.rules[0], when: { type: 'ALL', of: [{ type: 'ALWAYS' }, { type: 'EXACT_DIGIT', digit: 4 }] } }] })).toBe(true);
        expect(validateSpec({ ...streakSpec, rules: [{ ...streakSpec.rules[0], when: { type: 'TICK_RUN', direction: 'RISE', count: 3 } }] })).toBe(true);
    });
    it('supports conversation, reviews locally compiled XML and never auto-runs', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'What stake?', spec: null }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Review this draft.', spec }) });
        render(<AIAssistant dashboard={{}} load_modal={{ loadStrategyToBuilder: jest.fn() }} run_panel={{}} />);
        send('Create a bot');
        await screen.findByText('What stake?');
        expect(screen.getByRole('button', { name: 'Preview XML' })).toBeDisabled();
        send('Use 1');
        await screen.findByText('Review this draft.');
        expect((fetch as jest.Mock).mock.calls[1][0]).toBe('/api/ai-developer');
        expect(JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).messages).toHaveLength(3);
        expect(screen.getByText('1HZ100V')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Preview XML' }));
        expect(screen.getByText('Generated Blockly XML')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Load into Bot Builder' }));
        await waitFor(() => expect(loadXmlIntoBotBuilder).toHaveBeenCalledWith(expect.objectContaining({ runNow: false, name: 'Test Bot' })));
        expect(compileAIBotToXml).toHaveBeenCalledWith(expect.objectContaining({ ...spec, virtualHookEnabled: false }));
    });
    it('shows the exact virtual rule for review and passes it to the XML compiler', async () => {
        const virtualSpec = { ...spec, virtualHook: { virtualLosses: 2, virtualWins: 1 } };
        expect(validateSpec(virtualSpec)).toBe(true);
        expect(validateSpec({ ...virtualSpec, virtualHook: { virtualLosses: 2, virtualWins: 0 } })).toBe(false);
        expect(validateSpec({ ...virtualSpec, contractType: 'CALL', barrier: 0, recoveryBarrier: 0 })).toBe(false);
        expect(validateSpec({ ...virtualSpec, durationTicks: 2 })).toBe(false);
        const { virtualHook, ...missingHook } = virtualSpec;
        expect(validateSpec(missingHook)).toBe(false);
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Review your virtual hook.', spec: virtualSpec }) });
        render(<AIAssistant dashboard={{}} load_modal={{}} run_panel={{}} />);
        send('Create a virtual bot'); await screen.findByText('Review your virtual hook.');
        expect(screen.getByText(/2 consecutive losses or 1 consecutive wins/)).toBeInTheDocument();
        expect(compileAIBotToXml).toHaveBeenCalledWith(expect.objectContaining({ assistantVirtualHook: virtualSpec.virtualHook }));
    });
    it('lists each multi-rule entry in the review panel', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ reply: 'Review the rules.', spec: streakSpec }) });
        render(<AIAssistant dashboard={{}} load_modal={{}} run_panel={{}} />);
        send('Build an even odd streak bot'); await screen.findByText('Review the rules.');
        expect(screen.getByText('Rules (first match wins)')).toBeInTheDocument();
        expect(screen.getByText('Odd after 3 even: last 3 digits all even → buy Odd')).toBeInTheDocument();
        expect(screen.getByText('Even after 3 odd: last 3 digits all odd → buy Even')).toBeInTheDocument();
        expect(screen.getByText(/2 consecutive losses or 1 consecutive wins/)).toBeInTheDocument();
        expect(compileAIBotToXml).toHaveBeenCalledWith(expect.objectContaining({ rules: streakSpec.rules }));
    });
    it('does not replace a running bot or one with open contracts', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Ready', spec }) });
        render(<AIAssistant dashboard={{}} load_modal={{ loadStrategyToBuilder: jest.fn() }} run_panel={{ is_running: true }} />);
        send('Create a bot'); await screen.findByText('Ready');
        fireEvent.click(screen.getByRole('button', { name: 'Load into Bot Builder' }));
        expect(screen.getByRole('alert')).toHaveTextContent('Stop the current bot');
        expect(loadXmlIntoBotBuilder).not.toHaveBeenCalled();
    });
    it('removes stale drafts while revising or when the provider fails', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Ready', spec }) }).mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Unavailable' }) });
        render(<AIAssistant dashboard={{}} load_modal={{}} run_panel={{}} />);
        send('Create a bot'); await screen.findByText('Ready');
        send('Change it'); await screen.findByRole('alert');
        expect(screen.getByRole('button', { name: 'Load into Bot Builder' })).toBeDisabled();
        expect(screen.getByText('Needs details')).toBeInTheDocument();
    });
    it('does not send common API secrets', () => {
        render(<AIAssistant dashboard={{}} load_modal={{}} run_panel={{}} />);
        send('sk-or-v1-' + 'a'.repeat(32));
        expect(fetch).not.toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('never send');
    });
});
