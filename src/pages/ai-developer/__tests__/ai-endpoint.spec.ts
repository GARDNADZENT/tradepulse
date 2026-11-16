const handler = require('../../../../api/ai-developer');
const spec = { name: 'Draft', symbol: 'R_50', contractType: 'DIGITUNDER', barrier: 4, recoveryBarrier: 4, durationTicks: 1, baseStake: 1, martingaleMultiplier: 1, takeProfit: 10, stopLoss: 20, entryFilter: 'INSTANT', entryDigit: 0 };
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
        (fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => true }).mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Ready', spec: { ...spec, contractType: 'HEDGE' } }) } }] }) });
        const r = res(); await handler(req(), r); expect(r.status).toHaveBeenCalledWith(502); expect(r.json.mock.calls[0][0]).not.toHaveProperty('spec');
    });
});
