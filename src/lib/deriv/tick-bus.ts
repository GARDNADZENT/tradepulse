import { getAppId } from '@/components/shared';
import { api_base } from '@/external/bot-skeleton';
import {
    CONNECTION_STATUS,
    connectionStatus$,
} from '@/external/bot-skeleton/services/api/observables/connection-status-stream';

export type BusStatus = 'idle' | 'connecting' | 'live' | 'error';
export type Tick = { t: number; price: number };

type TickListener = (symbol: string, tick: Tick) => void;
type HistoryListener = (symbol: string, ticks: Tick[]) => void;
type StatusListener = (s: BusStatus) => void;

const MAX_BUFFER = 1000;
const STALE_MS = 9000;
const WATCHDOG_MS = 4500;
const RETRY_BASE_MS = 1500;
const RETRY_MAX_MS = 18000;

class DerivTickBus {
    private buffers = new Map<string, Tick[]>();
    private digits = new Map<string, number[]>();
    private pip = new Map<string, number>();
    private refs = new Map<string, number>();
    private subs = new Map<string, any>();
    private fallbackWs = new Map<string, WebSocket>();
    private status: BusStatus = 'idle';
    private lastEpoch = new Map<string, number>();
    private tickLs = new Set<TickListener>();
    private histLs = new Set<HistoryListener>();
    private statusLs = new Set<StatusListener>();
    private retryAttempts = new Map<string, number>();
    private retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private seeding = new Set<string>();
    private lastKnownConnectionStatus: string = CONNECTION_STATUS.UNKNOWN;
    private messageUnsub: { unsubscribe: () => void } | null = null;

    constructor() {
        this.attachConnectionWatcher();
        this.startWatchdog();
    }

    getStatus() {
        return this.status;
    }

    getTicks(s: string) {
        return [...(this.buffers.get(s) || [])].slice(-MAX_BUFFER);
    }

    getDigits(s: string) {
        return [...(this.digits.get(s) || [])].slice(-MAX_BUFFER);
    }

    getPipSize(s: string) {
        return this.pip.get(s) ?? 2;
    }

    onTick(cb: TickListener) {
        this.tickLs.add(cb);
        return () => {
            this.tickLs.delete(cb);
        };
    }

    onHistory(cb: HistoryListener) {
        this.histLs.add(cb);
        for (const [s, t] of this.buffers) cb(s, [...t]);
        return () => {
            this.histLs.delete(cb);
        };
    }

    onStatus(cb: StatusListener) {
        this.statusLs.add(cb);
        cb(this.status);
        return () => {
            this.statusLs.delete(cb);
        };
    }

    private setStatus(s: BusStatus) {
        if (this.status === s) return;
        this.status = s;
        this.statusLs.forEach(f => f(s));
    }

    private inferPipFromPrices(prices: number[], hint?: number) {
        if (typeof hint === 'number' && hint >= 0 && hint <= 6) return hint;
        let maxDec = 2;
        for (const p of prices.slice(-30)) {
            const parts = String(p).split('.');
            if (parts[1] && parts[1].length > maxDec) maxDec = Math.min(5, parts[1].length);
        }
        return maxDec;
    }

    private digit(s: string, p: number) {
        const pipSize = this.getPipSize(s);
        const fixed = Math.abs(p).toFixed(Math.max(0, pipSize));
        return Number(fixed.charAt(fixed.length - 1)) || 0;
    }

    private setBuffer(s: string, t: Tick[]) {
        const x = t.slice(-MAX_BUFFER);
        this.buffers.set(s, x);
        this.digits.set(
            s,
            x.map(v => this.digit(s, v.price))
        );
        this.lastEpoch.set(s, x.length ? Math.floor(x[x.length - 1].t / 1000) : 0);
    }

    private append(s: string, t: Tick) {
        const b = this.buffers.get(s) || [];
        b.push(t);
        if (b.length > MAX_BUFFER) b.splice(0, b.length - MAX_BUFFER);
        this.buffers.set(s, b);
        const d = this.digits.get(s) || [];
        d.push(this.digit(s, t.price));
        if (d.length > MAX_BUFFER) d.splice(0, d.length - MAX_BUFFER);
        this.digits.set(s, d);
        this.lastEpoch.set(s, Math.floor(t.t / 1000));
    }

    subscribe(symbols: string[]) {
        const unique = [...new Set(symbols.filter(Boolean))];
        for (const s of unique) {
            const nextCount = (this.refs.get(s) || 0) + 1;
            this.refs.set(s, nextCount);
            if (nextCount === 1) void this.seed(s);
        }
        return () => {
            for (const s of unique) {
                const n = (this.refs.get(s) || 1) - 1;
                if (n <= 0) {
                    this.refs.delete(s);
                    const sub = this.subs.get(s);
                    try {
                        sub?.unsubscribe?.();
                    } catch {}
                    this.subs.delete(s);
                    const ws = this.fallbackWs.get(s);
                    if (ws) {
                        try {
                            ws.close();
                        } catch {}
                        this.fallbackWs.delete(s);
                    }
                    this.clearRetry(s);
                } else {
                    this.refs.set(s, n);
                }
            }
        };
    }

    private attachConnectionWatcher() {
        try {
            connectionStatus$.subscribe((s: string) => {
                const reconnected =
                    s === CONNECTION_STATUS.OPENED && this.lastKnownConnectionStatus !== CONNECTION_STATUS.OPENED;
                this.lastKnownConnectionStatus = s;
                if (reconnected) this.resubscribeAll();
            });
        } catch {}
    }

    private resubscribeAll() {
        for (const s of this.refs.keys()) {
            this.clearRetry(s);
            void this.seed(s);
        }
    }

    private startWatchdog() {
        if (typeof window === 'undefined') return;
        setInterval(() => {
            const now = Date.now();
            for (const s of this.refs.keys()) {
                if (this.seeding.has(s) || this.retryTimers.has(s)) continue;
                const last = (this.lastEpoch.get(s) || 0) * 1000;
                if (!last || now - last > STALE_MS) void this.seed(s);
            }
        }, WATCHDOG_MS);
    }

    private clearRetry(s: string) {
        const t = this.retryTimers.get(s);
        if (t) clearTimeout(t);
        this.retryTimers.delete(s);
        this.retryAttempts.delete(s);
    }

    private scheduleRetry(s: string) {
        if (!this.refs.has(s)) return;
        const attempt = (this.retryAttempts.get(s) || 0) + 1;
        this.retryAttempts.set(s, attempt);
        const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * Math.pow(1.6, attempt - 1));
        const t = setTimeout(() => {
            this.retryTimers.delete(s);
            if (this.refs.has(s)) void this.seed(s);
        }, delay);
        this.retryTimers.set(s, t);
    }

    private seedFallbackSocket(s: string) {
        if (typeof window === 'undefined' || !this.refs.has(s)) return;
        const existing = this.fallbackWs.get(s);
        if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
            return;
        }
        try {
            const appId = getAppId() || 1089;
            const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
            this.fallbackWs.set(s, ws);
            ws.onopen = () => {
                if (!this.refs.has(s)) {
                    ws.close();
                    return;
                }
                ws.send(
                    JSON.stringify({
                        ticks_history: s,
                        adjust_start_time: 1,
                        count: MAX_BUFFER,
                        end: 'latest',
                        style: 'ticks',
                        subscribe: 1,
                    })
                );
            };
            ws.onmessage = evt => {
                if (!this.refs.has(s)) return;
                try {
                    const m = JSON.parse(evt.data);
                    if (m?.msg_type === 'history' && m.history?.prices) {
                        const rawPrices = m.history.prices.map(Number);
                        this.pip.set(s, this.inferPipFromPrices(rawPrices, m.pip_size));
                        const times = m.history.times || [];
                        this.setBuffer(
                            s,
                            rawPrices.map((p: number, i: number) => ({
                                t: Number(times[i] || Math.floor(Date.now() / 1000)) * 1000,
                                price: p,
                            }))
                        );
                        this.histLs.forEach(f => f(s, this.getTicks(s)));
                        this.setStatus('live');
                    } else if (m?.msg_type === 'tick' && m.tick) {
                        const epoch = Number(m.tick.epoch);
                        const price = Number(m.tick.quote);
                        if (!Number.isFinite(epoch) || !Number.isFinite(price)) return;
                        if (epoch <= (this.lastEpoch.get(s) || 0)) return;
                        if (m.tick.pip_size !== undefined) this.pip.set(s, Number(m.tick.pip_size));
                        const tick = { t: epoch * 1000, price };
                        this.append(s, tick);
                        this.setStatus('live');
                        this.tickLs.forEach(f => f(s, tick));
                    }
                } catch {}
            };
            ws.onerror = () => {
                this.fallbackWs.delete(s);
            };
            ws.onclose = () => {
                if (this.fallbackWs.get(s) === ws) this.fallbackWs.delete(s);
            };
        } catch {
            this.setStatus('error');
        }
    }

    private async seed(s: string) {
        if (this.seeding.has(s)) return;
        this.seeding.add(s);
        this.setStatus('connecting');

        if (!api_base.api) {
            this.seedFallbackSocket(s);
            this.seeding.delete(s);
            return;
        }

        try {
            this.attachMessageListener();
            const sub: any = (api_base.api as any).send({ ticks: s, subscribe: 1 });
            this.subs.set(s, sub);
            if (sub?.then) {
                const resolved = await sub;
                this.subs.set(s, resolved?.subscription || resolved);
            }
            const r: any = await (api_base.api as any).send({
                ticks_history: s,
                adjust_start_time: 1,
                count: MAX_BUFFER,
                end: 'latest',
                style: 'ticks',
            });
            if (r?.history?.prices) {
                const rawPrices = r.history.prices.map(Number);
                this.pip.set(s, this.inferPipFromPrices(rawPrices, r.pip_size));
                const times = r.history.times || [];
                this.setBuffer(
                    s,
                    rawPrices.map((p: number, i: number) => ({
                        t: Number(times[i] || Math.floor(Date.now() / 1000)) * 1000,
                        price: p,
                    }))
                );
                this.histLs.forEach(f => f(s, this.getTicks(s)));
            }
            const fb = this.fallbackWs.get(s);
            if (fb) {
                try {
                    fb.close();
                } catch {}
                this.fallbackWs.delete(s);
            }
            this.clearRetry(s);
            this.setStatus('live');
        } catch {
            this.seedFallbackSocket(s);
            this.scheduleRetry(s);
        } finally {
            this.seeding.delete(s);
        }
    }

    private attachMessageListener() {
        if (this.messageUnsub || !api_base.api) return;
        this.messageUnsub = (api_base.api as any).onMessage().subscribe((msg: any) => {
            const m = msg?.data || msg;
            if (m?.msg_type !== 'tick' || !m.tick) return;
            const s = String(m.tick.symbol || '');
            if (!this.refs.has(s)) return;
            const epoch = Number(m.tick.epoch);
            const price = Number(m.tick.quote);
            if (!s || !Number.isFinite(epoch) || !Number.isFinite(price)) return;
            if (epoch <= (this.lastEpoch.get(s) || 0)) return;
            if (m.tick.pip_size !== undefined) this.pip.set(s, Number(m.tick.pip_size));
            const t = { t: epoch * 1000, price };
            this.append(s, t);
            this.setStatus('live');
            this.tickLs.forEach(f => f(s, t));
        });
    }
}

export const derivBus = new DerivTickBus();
