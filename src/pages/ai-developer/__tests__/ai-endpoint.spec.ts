const handler = require('../../../../api/ai-developer');
const spec = { name: 'Draft', symbol: 'R_50', contractType: 'DIGITUNDER', barrier: 4, recoveryBarrier: 4, durationTicks: 1, baseStake: 1, martingaleMultiplier: 1, takeProfit: 10, stopLoss: 20, entryFilter: 'INSTANT', entryDigit: 0, virtualHook: null };
const req = () => ({ method: 'POST', headers: { host: 'example.com', origin: 'https://example.com', 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.10' }, body: { messages: [{ role: 'user', content: 'Build my bot' }] } });
const res = () => { const r: any = {}; r.status = jest.fn(() => r); r.setHeader = jest.fn(() => r); r.json = jest.fn(() => r); return r; };
const original = process.env;
describe('AI server endpoint', () => {
    beforeAll(() => { (AbortSignal as any).timeout = () => new AbortController().signal; });
    beforeEach(() => { process.env = { ...original, OPENROUTER_API_KEY: 'test-key', AI_LIMIT_SUPABASE_URL: 'https://example.supabase.co', AI_LIMIT_SUPABASE_SERVICE_ROLE_KEY: 'test-service-key', AI_RATE_LIMIT_SECRET: 'x'.repeat(32) }; global.fetch = jest.fn(); });
    afterAll(() => { process.env = original; });
    it('rejects credentials, cross-origin requests and missing configuration before provider access', async () => {
        const r = res(); const request = req(); request.body.messages[0].content = 'sk-or-v1-' + 'a'.repeat(32); await handler(request, r); expect(r.status).toHaveBeenCalledWith(400);
        request.body.messages[0].content = 'Hello'; request.headers.origin = 'https://evil.example'; await handler(request, r); expect(r.status).toHaveBeenCalledWith(403);
        request.headers.origin = 'https://example.com'; delete process.env.OPENROUTER_API_KEY; await handler(request, r); expect(r.status).toHaveBeenCalledWith(503); expect(fetch).not.toHaveBeenCalled();
    });
    it('fails closed on quota errors and never calls provider over quota', async () => {
        (fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => false }); const r = res(); await handler(req(), r);
        expect(r.status).toHaveBeenCalledWith(429); expect(fetch).toHaveBeenCalledTimes(1);
        const payload = JSON.parse((fetch as jest.Mock).mock.calls[0][1].body); expect(payload.client_hash).toMatch(/^[a-f0-9]{64}$/); expect(JSON.stringify(payload)).not.toContain('192.0.2.10');
    });
    it('reports safe reference codes for quota errors without disclosing credentials or response bodies', async () => {
        for (const status of [400, 401, 403, 404, 429, 500]) {
            (fetch as jest.Mock).mockReset().mockResolvedValueOnce({ ok: false, status, json: async () => ({ message: 'private provider detail' }) });
            const r = res(); await handler(req(), r);
            expect(r.status).toHaveBeenCalledWith(503);
            const body = JSON.stringify(r.json.mock.calls);
            expect(body).toContain(status === 500 ? 'Q-DATABASE' : `Q-${status}`);
            expect(body).not.toContain('private provider detail');
            expect(body).not.toContain('test-service-key');
            expect(fetch).toHaveBeenCalledTimes(1);
        }
    });
    it('fails closed with distinct references for missing IP, failed connection, and malformed quota result', async () => {
        const noIp = req(); delete (noIp.headers as any)['x-vercel-forwarded-for'];
        const r1 = res(); await handler(noIp, r1);
        expect(r1.json.mock.calls[0][0].error).toContain('Q-IP');
        expect(fetch).not.toHaveBeenCalled();
        (fetch as jest.Mock).mockRejectedValueOnce(new Error('private error'));
        const r2 = res(); await handler(req(), r2);
        expect(r2.json.mock.calls[0][0].error).toContain('Q-NETWORK');
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ unexpected: true }) });
        const r3 = res(); await handler(req(), r3);
        expect(r3.json.mock.calls[0][0].error).toContain('Q-RESPONSE');
        expect(fetch).toHaveBeenCalledTimes(2);
    });
    it('calls OpenRouter with server credentials and validates the returned structured draft', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => true }).mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Review it', spec }) } }] }) });
        const r = res(); await handler(req(), r);
        expect(r.status).toHaveBeenCalledWith(200); expect(r.json).toHaveBeenCalledWith({ reply: 'Review it', spec });
        expect((fetch as jest.Mock).mock.calls[1][0]).toBe('https://openrouter.ai/api/v1/chat/completions');
        expect(JSON.stringify(r.json.mock.calls)).not.toContain('test-key');
    });
    it('rejects invalid model data and never returns provider error details', async () => {
        const invalid = { reply: 'Ready', spec: { ...spec, contractType: 'HEDGE' } };
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => true })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(invalid) } }] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(invalid) } }] }) });
        const r = res(); await handler(req(), r);
        expect(r.status).toHaveBeenCalledWith(502);
        expect(r.json.mock.calls[0][0]).not.toHaveProperty('spec');
        expect(r.json.mock.calls[0][0].reply).toBe('Ready');
        expect(fetch).toHaveBeenCalledTimes(3); // quota + first attempt + one repair attempt
    });
    it('repairs a minor formatting mistake once and returns the corrected draft', async () => {
        const broken = { reply: 'Review it', spec: { ...spec, virtualHook: { enabled: true, virtualLosses: 2, virtualWins: 1 } } };
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => true })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(broken) } }] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Review it', spec: { ...spec, virtualHook: { virtualLosses: 2, virtualWins: 1 } } }) } }] }) });
        const r = res(); await handler(req(), r);
        expect(r.status).toHaveBeenCalledWith(200);
        expect(r.json).toHaveBeenCalledWith({ reply: 'Review it', spec: { ...spec, virtualHook: { virtualLosses: 2, virtualWins: 1 } } });
        const repairBody = JSON.parse((fetch as jest.Mock).mock.calls[2][1].body);
        expect(repairBody.messages.at(-1).content).toContain('exactly virtualLosses and virtualWins');
        expect(fetch).toHaveBeenCalledTimes(3);
    });
    it('repairs malformed JSON output once', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => true })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: 'not json at all' } }] }) })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Review it', spec }) } }] }) });
        const r = res(); await handler(req(), r);
        expect(r.status).toHaveBeenCalledWith(200);
        expect(r.json).toHaveBeenCalledWith({ reply: 'Review it', spec });
        expect(fetch).toHaveBeenCalledTimes(3);
    });
    it('does not retry when the provider itself is unavailable', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => true })
            .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'private provider detail' }) });
        const r = res(); await handler(req(), r);
        expect(r.status).toHaveBeenCalledWith(502);
        expect(r.json.mock.calls[0][0].error).toContain('provider is unavailable');
        expect(JSON.stringify(r.json.mock.calls)).not.toContain('private provider detail');
        expect(fetch).toHaveBeenCalledTimes(2); // quota + provider only, no repair
    });
    it('documents the paired hedge, its spread warning and the confirmation gate', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => true })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'This pair normally loses the spread — confirm?', spec: null }) } }] }) });
        const r = res(); await handler(req(), r);
        expect(r.status).toHaveBeenCalledWith(200);
        const systemPrompt = JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).messages[0].content;
        expect(systemPrompt).toContain('PAIRED HEDGE');
        expect(systemPrompt).toContain('get the user\'s explicit confirmation');
        expect(systemPrompt).toContain('normally nets a loss');
        expect(systemPrompt).toContain('Never describe a hedge as profitable');
        expect(systemPrompt).not.toContain('paired or hedged contracts, more than one contract');
    });
    it('documents multi-rule entries and no longer refuses ordinary streak strategies', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => true })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Which virtual rule?', spec: null }) } }] }) });
        const r = res(); await handler(req(), r);
        expect(r.status).toHaveBeenCalledWith(200);
        const systemPrompt = JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).messages[0].content;
        expect(systemPrompt).toContain('PARITY_STREAK');
        expect(systemPrompt).toContain('FIRST matching rule');
        expect(systemPrompt).toContain('never refuse ordinary digit strategies');
        expect(systemPrompt).not.toContain('streak entry filters');
        expect(systemPrompt).toContain('trade Odd after 3 Even');
    });
    it('instructs the model with explicit market names so (1s) markets are not confused with R_ symbols', async () => {
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => true })
            .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Which market?', spec: null }) } }] }) });
        const r = res(); await handler(req(), r);
        expect(r.status).toHaveBeenCalledWith(200);
        const systemPrompt = JSON.parse((fetch as jest.Mock).mock.calls[1][1].body).messages[0].content;
        expect(systemPrompt).toContain('Volatility 10 (1s)=1HZ10V');
        expect(systemPrompt).toContain('Volatility 10=R_10');
        expect(systemPrompt).toContain('Never use an R_ symbol for a (1s) market');
    });
});
