const { createHmac } = require('crypto');
const { validateAnswer, answerProblem, sensitive } = require('../src/pages/ai-developer/ai-strategy-validation');

const SYSTEM_PROMPT = `You are TradersPulse's conversational bot developer. Reply ONLY as a JSON object with exactly {"reply": string, "spec": object or null}. Never include XML or code. Ask concise follow-up questions when any required trading detail is missing or ambiguous. Never invent values or claim profitability. When a request cannot be faithfully expressed, explain the limitation and return spec:null, never simplify the user's strategy without their explicit agreement. Never ask for credentials.
Supported scope: ONE contract per cycle only: DIGITOVER, DIGITUNDER, DIGITMATCH, DIGITDIFF, DIGITEVEN, DIGITODD, CALL, PUT. Markets: 1HZ10V,1HZ25V,1HZ50V,1HZ75V,1HZ100V,R_10,R_25,R_50,R_75,R_100,JD10,JD50,JD100. Market names: Volatility 10 (1s)=1HZ10V, Volatility 25 (1s)=1HZ25V, Volatility 50 (1s)=1HZ50V, Volatility 75 (1s)=1HZ75V, Volatility 100 (1s)=1HZ100V, Volatility 10=R_10, Volatility 25=R_25, Volatility 50=R_50, Volatility 75=R_75, Volatility 100=R_100, Jump 10=JD10, Jump 50=JD50, Jump 100=JD100. Never use an R_ symbol for a (1s) market, and never use a 1HZ symbol for a non-(1s) market. Duration 1-10 ticks. Entry is INSTANT or EXACT_DIGIT (checks the latest digit; it does not guarantee a fresh post-cycle tick). Stake multiplies after each non-win by martingaleMultiplier, resets to baseStake after a win. Prediction changes to recoveryBarrier after a non-win and resets after a win. TP and SL are checked after settlement, not guaranteed caps. Virtual Hook is supported only for a single one-tick digit contract: start virtual; switch to real on EITHER the specified number of consecutive virtual losses OR the specified number of consecutive virtual wins; return to virtual after one real loss; a virtual win resets virtual loss count and a virtual loss resets virtual win count; virtual results do not change the real martingale stake, which continues from the real loss. For example, (2 losses, 1 win) is ambiguous: ask whether those are virtual and whether EITHER triggers real, when to return to virtual, and whether to preserve the real stake; only generate this mode if the user confirms these exact semantics. In virtual mode the outcome is simulated from live ticks and may not match a real contract's execution. No paired/hedged trades, other virtual rules, streak entry filters, dynamic barriers, other entry logic, custom stop conditions or multi-stage recovery. Refuse these as unsupported, with spec:null. Currency is the account currency, not necessarily USD. If the user accepts defaults, explicitly disclose and confirm each default before outputting a spec.
When all details are explicitly provided and supported, reply with a summary and a spec containing exactly these keys (every key is required, even when using a default; never add extra keys): name (1-60 characters, only letters, digits, spaces, underscore, hyphen; no parentheses, punctuation or currency symbols), symbol, contractType, barrier (0-9; DIGITOVER 0-8; DIGITUNDER 1-9; use 0 for even/odd/rise/fall), recoveryBarrier (same range; must match barrier unless user explicitly requests a recovery prediction, 0 for even/odd/rise/fall), durationTicks (integer 1-10), baseStake (0.35-10000), martingaleMultiplier (1-20; 1 for fixed stake), takeProfit (0.5-100000), stopLoss (1-100000), entryFilter (INSTANT or EXACT_DIGIT), entryDigit (0-9; use the number 0 for INSTANT, never null), virtualHook (null for disabled, or exactly {"virtualLosses": integer 1-10, "virtualWins": integer 1-10} with no other keys for the exact virtual rule above). Always ask whether Virtual Hook is enabled or disabled; do not infer either. All numeric values must be JSON numbers, not strings. Do not output spec until the user has stated every applicable detail including market, contract, duration, entry, stake, martingale or fixed stake, TP, SL. Recovery prediction is unchanged unless explicitly requested. A generated spec is a draft for the user to review, never a command to trade.`;

const send = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);
const validMessages = messages => Array.isArray(messages) && messages.length > 0 && messages.length <= 16 &&
    messages[messages.length - 1]?.role === 'user' && messages.every(m => m && typeof m === 'object' &&
        Object.keys(m).length === 2 && ['user', 'assistant'].includes(m.role) && typeof m.content === 'string' &&
        m.content.trim().length > 0 && m.content.length <= 4000 && !sensitive(m.content)) &&
    JSON.stringify(messages).length <= 24000;

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { error: 'Method not allowed.' }); }
    const host = req.headers.host;
    let origin;
    try { origin = new URL(req.headers.origin); } catch { return send(res, 403, { error: 'Invalid request origin.' }); }
    if (!host || origin.host !== host || !['https:', 'http:'].includes(origin.protocol)) return send(res, 403, { error: 'Invalid request origin.' });
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'JSON required.' });
    if (!validMessages(req.body?.messages)) return send(res, 400, { error: 'Invalid message or possible credential. Never send API keys or login tokens in chat.' });
    const { OPENROUTER_API_KEY, AI_LIMIT_SUPABASE_URL, AI_LIMIT_SUPABASE_SERVICE_ROLE_KEY, AI_RATE_LIMIT_SECRET } = process.env;
    if (!OPENROUTER_API_KEY || !AI_LIMIT_SUPABASE_URL || !AI_LIMIT_SUPABASE_SERVICE_ROLE_KEY || !AI_RATE_LIMIT_SECRET || AI_RATE_LIMIT_SECRET.length < 32)
        return send(res, 503, { error: 'AI Developer is not configured yet. Please contact the site owner.' });
    // Vercel supplies this header at the edge. Never send raw IP addresses to the database.
    const ip = (req.headers['x-vercel-forwarded-for'] || '').split(',')[0].trim();
    if (!ip || ip.length > 64) return send(res, 503, { error: 'AI usage protection is unavailable. Reference: Q-IP.' });
    const clientHash = createHmac('sha256', AI_RATE_LIMIT_SECRET).update(ip).digest('hex');
    let quota;
    try {
        quota = await fetch(`${AI_LIMIT_SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/consume_ai_developer_quota`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', apikey: AI_LIMIT_SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${AI_LIMIT_SUPABASE_SERVICE_ROLE_KEY}` },
            body: JSON.stringify({ client_hash: clientHash }), signal: AbortSignal.timeout(8000),
        });
    } catch {
        return send(res, 503, { error: 'AI usage protection is unavailable. Reference: Q-NETWORK.' });
    }
    if (!quota.ok) {
        // Return only a small, safe diagnostic category, never provider error bodies or secrets.
        const reference = [400, 401, 403, 404, 429].includes(quota.status) ? `Q-${quota.status}` : 'Q-DATABASE';
        return send(res, 503, { error: `AI usage protection is unavailable. Reference: ${reference}.` });
    }
    let allowed;
    try { allowed = await quota.json(); } catch { return send(res, 503, { error: 'AI usage protection is unavailable. Reference: Q-RESPONSE.' }); }
    if (allowed === false) return send(res, 429, { error: 'AI usage limit reached. Please try again later.' });
    if (allowed !== true) return send(res, 503, { error: 'AI usage protection is unavailable. Reference: Q-RESPONSE.' });

    const callModel = async messages => {
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST', headers: { Authorization: `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini', messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages], temperature: 0.2, max_tokens: 900, response_format: { type: 'json_object' } }),
            signal: AbortSignal.timeout(30000),
        });
        if (!response.ok) return { ok: false, reason: 'provider' };
        const data = await response.json();
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || text.length > 10000) return { ok: false, reason: 'malformed' };
        try { return { ok: true, answer: JSON.parse(text) }; } catch { return { ok: false, reason: 'malformed' }; }
    };

    try {
        const messages = req.body.messages;
        const first = await callModel(messages);
        if (!first.ok && first.reason === 'provider') return send(res, 502, { error: 'The AI provider is unavailable. Please try again later.' });
        if (first.ok && validateAnswer(first.answer)) return send(res, 200, first.answer);
        // One repair attempt: tell the model the exact validation problem so a minor
        // formatting mistake does not end the conversation. Quota was consumed once.
        const problem = first.ok ? (answerProblem(first.answer) || 'the JSON did not match the required format') : 'the response was not valid JSON';
        const history = first.ok
            ? [...messages, { role: 'assistant', content: JSON.stringify(first.answer).slice(0, 4000) }]
            : messages;
        const repaired = await callModel([
            ...history,
            { role: 'user', content: `That response is invalid: ${problem}. Reply with ONLY the corrected JSON object {"reply": string, "spec": object or null}. Use exactly the required keys and types, add no extra keys, never use null for a number, and keep the strategy details the user already confirmed.` },
        ]);
        if (repaired.ok && validateAnswer(repaired.answer)) return send(res, 200, repaired.answer);
        const reply = first.ok && typeof first.answer?.reply === 'string' && first.answer.reply.trim()
            ? first.answer.reply.slice(0, 2500)
            : undefined;
        return send(res, 502, { error: 'The AI returned an unsupported or invalid strategy. Please clarify and try again.', ...(reply ? { reply } : {}) });
    } catch {
        return send(res, 502, { error: 'The AI service could not be reached. Please try again later.' });
    }
};
