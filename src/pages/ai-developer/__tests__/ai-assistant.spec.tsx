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
    const hedgeSpec = {
        ...spec,
        name: 'Rise Fall Hedge',
        symbol: '1HZ100V',
        contractType: 'CALL',
        barrier: 0,
        recoveryBarrier: 0,
        durationTicks: 3,
        baseStake: 0.35,
        martingaleMultiplier: 2,
        takeProfit: 2.8,
        stopLoss: 10,
        entryFilter: 'INSTANT',
        entryDigit: 0,
        virtualHook: { virtualLosses: 2, virtualWins: 1 },
        hedge: { secondContractType: 'PUT' },
    };
    it('accepts a Rise + Fall hedge only with matching legs and explicit rules', () => {
        expect(validateSpec(hedgeSpec)).toBe(true);
        expect(specProblem(hedgeSpec)).toBeNull();
        const reasons: Array<[any, string]> = [
            [{ ...hedgeSpec, hedge: { secondContractType: 'DIGITEVEN' } }, 'share a contract category'],
            [{ ...hedgeSpec, hedge: { secondContractType: 'PUT', extra: 1 } }, 'unexpected key'],
            [{ ...hedgeSpec, hedge: {} }, 'missing secondContractType'],
            [{ ...hedgeSpec, hedge: { secondContractType: 'HEDGE' } }, 'not supported'],
            [{ ...hedgeSpec, recoveryBarrier: 2 }, 'recoveryBarrier must equal barrier'],
            [{ ...hedgeSpec, rules: [{ name: 'R', when: { type: 'ALWAYS' }, contractType: 'CALL' }] }, 'cannot be combined'],
            [{ ...hedgeSpec, hedge: { secondContractType: 'DIGITUNDER' }, contractType: 'DIGITOVER', barrier: 2, recoveryBarrier: 2 }, 'secondBarrier must be an integer'],
            [{ ...hedgeSpec, hedge: { secondContractType: 'DIGITOVER', secondBarrier: 2 }, contractType: 'CALL' }, 'share a contract category'],
            [{ ...hedgeSpec, contractType: 'DIGITOVER', barrier: 2, recoveryBarrier: 2, hedge: { secondContractType: 'DIGITUNDER', secondBarrier: 7 } }, 'digit pairs with one tick'],
        ];
        for (const [candidate, message] of reasons) expect(specProblem(candidate)).toContain(message);
        expect(validateSpec({ ...hedgeSpec, hedge: { secondContractType: 'DIGITUNDER', secondBarrier: 7 }, contractType: 'DIGITOVER', barrier: 2, recoveryBarrier: 2, durationTicks: 1 })).toBe(true);
        expect(validateSpec({ ...hedgeSpec, virtualHook: null, durationTicks: 5 })).toBe(true);
    });
    it('reviews the hedge with both legs and warns that it normally nets a loss', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Review the hedge.', spec: hedgeSpec }) });
        render(<AIAssistant dashboard={{}} load_modal={{}} run_panel={{}} />);
        send('Build the hedge'); await screen.findByText('Review the hedge.');
        expect(screen.getByText(/Both legs bought together: Rise \+ Fall/)).toBeInTheDocument();
        expect(screen.getByText(/each cycle normally nets a small loss/)).toBeInTheDocument();
        expect(compileAIBotToXml).toHaveBeenCalledWith(expect.objectContaining({ hedge: hedgeSpec.hedge }));
    });
    const rotatingSpec = {
        ...spec,
        name: 'Over 2 All Markets',
        symbol: '1HZ10V',
        contractType: 'DIGITOVER',
        barrier: 2,
        recoveryBarrier: 0,
        baseStake: 2,
        martingaleMultiplier: 1.5,
        entryFilter: 'INSTANT',
        entryDigit: 0,
        virtualHook: { virtualLosses: 2, virtualWins: 1 },
        marketRotation: { everyTrades: 1, markets: ['1HZ10V', 'R_10', '1HZ25V'] },
    };
    it('accepts all-market rotation and rejects shapes the engine cannot honour', () => {
        expect(validateSpec(rotatingSpec)).toBe(true);
        const reasons: Array<[any, string]> = [
            [{ ...rotatingSpec, marketRotation: { everyTrades: 1, markets: ['R_10'] } }, 'between 2 and 12 markets'],
            [{ ...rotatingSpec, marketRotation: { everyTrades: 1, markets: ['R_10', '1HZ10V'] } }, 'must start with the strategy symbol'],
            [{ ...rotatingSpec, marketRotation: { everyTrades: 1, markets: ['1HZ10V', '1HZ10V'] } }, 'must not repeat'],
            [{ ...rotatingSpec, marketRotation: { everyTrades: 1, markets: ['1HZ10V', 'NOPE'] } }, 'is not supported'],
            [{ ...rotatingSpec, marketRotation: { everyTrades: 0, markets: ['1HZ10V', 'R_10'] } }, 'everyTrades must be'],
            [{ ...rotatingSpec, marketRotation: { everyTrades: 1, markets: ['1HZ10V', 'R_10'], extra: 1 } }, 'unexpected key'],
            [{ ...rotatingSpec, entryFilter: 'EXACT_DIGIT' }, 'requires entryFilter INSTANT'],
            [{ ...rotatingSpec, rules: [{ name: 'R', when: { type: 'ALWAYS' }, contractType: 'DIGITOVER', barrier: 2 }], contractType: 'DIGITOVER' }, 'cannot be combined with rules'],
        ];
        for (const [candidate, message] of reasons) expect(specProblem(candidate)).toContain(message);
    });
    it('shows the rotation order and loads the draft and runs it on request', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Review the rotation.', spec: rotatingSpec }) });
        render(<AIAssistant dashboard={{}} load_modal={{ loadStrategyToBuilder: jest.fn() }} run_panel={{ onRunButtonClick: jest.fn() }} />);
        send('Build all markets'); await screen.findByText('Review the rotation.');
        expect(screen.getByText(/Switches every 1 trade\(s\): 1HZ10V → R_10 → 1HZ25V/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Load & Run Now/ }));
        await waitFor(() => expect(loadXmlIntoBotBuilder).toHaveBeenCalledWith(expect.objectContaining({ runNow: true, name: 'Over 2 All Markets' })));
    });
    it('blocks Load & Run Now while a bot is running', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Ready', spec }) });
        render(<AIAssistant dashboard={{}} load_modal={{ loadStrategyToBuilder: jest.fn() }} run_panel={{ is_running: true }} />);
        send('Create a bot'); await screen.findByText('Ready');
        fireEvent.click(screen.getByRole('button', { name: /Load & Run Now/ }));
        expect(screen.getByRole('alert')).toHaveTextContent('Stop the current bot');
        expect(loadXmlIntoBotBuilder).not.toHaveBeenCalled();
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
    it('sends on Enter, keeps Shift+Enter for a new line and does not send while busy', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Which market?', spec: null }) });
        render(<AIAssistant dashboard={{}} load_modal={{}} run_panel={{}} />);
        const box = screen.getByLabelText('Your strategy message') as HTMLTextAreaElement;
        fireEvent.change(box, { target: { value: 'Build a bot' } });
        fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
        expect(fetch).not.toHaveBeenCalled();
        expect(box.value).toBe('Build a bot');
        fireEvent.keyDown(box, { key: 'Enter' });
        await screen.findByText('Which market?');
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(JSON.parse((fetch as jest.Mock).mock.calls[0][1].body).messages[0].content).toBe('Build a bot');
        fireEvent.change(box, { target: { value: 'Another' } });
        fireEvent.keyDown(box, { key: 'Enter', shiftKey: true });
        expect(fetch).toHaveBeenCalledTimes(1);
    });
    it('downloads the reviewed draft XML', async () => {
        const createObjectURL = jest.fn(() => 'blob:draft');
        const revokeObjectURL = jest.fn();
        Object.assign(URL, { createObjectURL, revokeObjectURL });
        const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ reply: 'Ready', spec }) });
        render(<AIAssistant dashboard={{}} load_modal={{}} run_panel={{}} />);
        expect(screen.getByRole('button', { name: 'Download .XML' })).toBeDisabled();
        send('Create a bot'); await screen.findByText('Ready');
        fireEvent.click(screen.getByRole('button', { name: 'Download .XML' }));
        expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(click).toHaveBeenCalledTimes(1);
        expect(revokeObjectURL).toHaveBeenCalledWith('blob:draft');
        expect(compileAIBotToXml).toHaveBeenCalled();
        click.mockRestore();
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
