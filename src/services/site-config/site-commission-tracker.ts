import { supabase } from '@/services/supabase/client';
import { isDemoAccount } from '@/utils/account-helpers';
import { getActiveTenantConfig } from './site-runtime-config';

interface SocketAccountMeta {
    loginid: string;
    currency: string;
    isVirtual: boolean;
}

const socketAuthMap = new WeakMap<WebSocket, SocketAccountMeta>();
const observedSockets = new WeakSet<WebSocket>();
const recordedContracts = new Set<string>();
let trackerInstalled = false;

const isDerivWebSocketUrl = (url: string): boolean => {
    if (!url) return false;
    return (
        url.includes('derivws.com') ||
        url.includes('binaryws.com') ||
        url.includes('/trading/v1/options/ws')
    );
};

const extractActiveRealAccountFallback = (): SocketAccountMeta | null => {
    if (typeof window === 'undefined') return null;
    try {
        const activeLoginId = (window.localStorage.getItem('active_loginid') || '').trim();
        const accountType = (window.localStorage.getItem('account_type') || '').trim().toLowerCase();
        if (!activeLoginId || isDemoAccount(activeLoginId) || accountType === 'demo') {
            return null;
        }
        return {
            loginid: activeLoginId,
            currency: 'USD',
            isVirtual: false,
        };
    } catch {
        return null;
    }
};

const parseShortcodeMeta = (shortcode?: string): { contractType: string; symbol: string } => {
    if (!shortcode || typeof shortcode !== 'string') {
        return { contractType: '', symbol: '' };
    }
    const parts = shortcode.split('_');
    return {
        contractType: parts[0] || '',
        symbol: parts[1] || '',
    };
};

export async function recordTenantRealBuyEvent(params: {
    contractId: string;
    transactionId?: string;
    stakeAmount: number;
    loginid: string;
    currency?: string;
    shortcode?: string;
}): Promise<boolean> {
    const tenant = getActiveTenantConfig();
    if (!tenant || !tenant.id || tenant.status !== 'active') return false;
    if (!supabase) return false;

    const contractId = String(params.contractId || '').trim();
    const loginid = String(params.loginid || '').trim();
    const stake = Number(params.stakeAmount || 0);

    if (!contractId || !loginid || isDemoAccount(loginid) || !(stake > 0)) {
        return false;
    }
    if (recordedContracts.has(contractId)) {
        return false;
    }
    recordedContracts.add(contractId);

    const { contractType, symbol } = parseShortcodeMeta(params.shortcode);

    try {
        const client: any = supabase;
        const { error } = await client.from('managed_site_commissions').upsert(
            {
                site_id: tenant.id,
                owner_id: tenant.owner_id || '00000000-0000-0000-0000-000000000000',
                site_slug: tenant.slug,
                contract_id: contractId,
                transaction_id: String(params.transactionId || ''),
                trader_loginid: loginid,
                currency: String(params.currency || 'USD'),
                contract_type: contractType,
                symbol,
                stake_amount: stake,
            },
            { onConflict: 'contract_id', ignoreDuplicates: true }
        );
        if (error) {
            recordedContracts.delete(contractId);
            return false;
        }
        return true;
    } catch {
        recordedContracts.delete(contractId);
        return false;
    }
}

const attachDerivSocketObserver = (ws: WebSocket) => {
    if (observedSockets.has(ws)) return;
    observedSockets.add(ws);

    ws.addEventListener('message', (event: MessageEvent) => {
        if (typeof event.data !== 'string') return;
        if (!event.data.includes('"authorize"') && !event.data.includes('"buy"')) return;

        try {
            const payload = JSON.parse(event.data);
            if (!payload || payload.error) return;

            // Track exact account identity per WebSocket (handles Copy Trading followers too)
            if (payload.msg_type === 'authorize' && payload.authorize?.loginid) {
                const loginid = String(payload.authorize.loginid);
                const isVirtual =
                    Boolean(payload.authorize.is_virtual) || isDemoAccount(loginid);
                socketAuthMap.set(ws, {
                    loginid,
                    currency: String(payload.authorize.currency || 'USD'),
                    isVirtual,
                });
                return;
            }

            // Capture real-account contract purchase confirmations
            if (payload.msg_type === 'buy' && payload.buy?.contract_id) {
                if (!getActiveTenantConfig()) return;

                const meta = socketAuthMap.get(ws) || extractActiveRealAccountFallback();
                if (!meta || meta.isVirtual || isDemoAccount(meta.loginid)) {
                    return;
                }

                void recordTenantRealBuyEvent({
                    contractId: String(payload.buy.contract_id),
                    transactionId: String(payload.buy.transaction_id || ''),
                    stakeAmount: Number(payload.buy.buy_price || 0),
                    loginid: meta.loginid,
                    currency: meta.currency,
                    shortcode: String(payload.buy.shortcode || ''),
                });
            }
        } catch {
            // Never disrupt trading socket messages
        }
    });
};

export function installTenantCommissionTracker(): void {
    if (trackerInstalled || typeof window === 'undefined' || typeof window.WebSocket !== 'function') {
        return;
    }
    trackerInstalled = true;

    const NativeWebSocket = window.WebSocket;
    const OrigSend = NativeWebSocket.prototype.send;

    NativeWebSocket.prototype.send = function patchedDerivSend(
        this: WebSocket,
        data: string | ArrayBufferLike | Blob | ArrayBufferView
    ) {
        try {
            if (this && typeof this.url === 'string' && isDerivWebSocketUrl(this.url)) {
                attachDerivSocketObserver(this);
            }
        } catch {
            // Ignore observer errors
        }
        return OrigSend.call(this, data as any);
    };
}
