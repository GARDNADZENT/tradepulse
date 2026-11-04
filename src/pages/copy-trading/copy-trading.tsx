import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    DERIV_V3_WS_ENDPOINTS,
    getAppId,
    getLegacyWsAppId,
    getPreferredV3SocketURL,
    isProduction,
} from '@/components/shared';
import { api_base } from '@/external/bot-skeleton';
import { getAuthInfo } from '@/external/deriv-core';
import { DerivAccount, DerivWSAccountsService } from '@/services/derivws-accounts.service';
import { getAccountId, isDemoAccount } from '@/utils/account-helpers';
import brandConfig from '../../../brand.config.json';
import './copy-trading.scss';

export interface SyncedClientAccount {
    token: string;
    loginid: string;
    currency: string;
    balance: number;
    isVirtual: boolean;
    enabled: boolean;
    authMode?: 'v2' | 'v3';
}

interface MirroredTradeLog {
    id: string;
    time: string;
    followerLoginId: string;
    symbol: string;
    contractType: string;
    stake: number;
    status: 'MIRRORED' | 'FAILED';
    detail: string;
}

const STORAGE_KEY = 'tp_copytrading_followers_v1';

class DerivClientTokenRejectedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DerivClientTokenRejectedError';
    }
}

const getDerivWSRestBases = (): string[] => {
    const env = isProduction() ? 'production' : 'staging';
    const optionsDir = brandConfig.platform.derivws.directories.options;
    const primary = `${brandConfig.platform.derivws.url[env]}${optionsDir}`;
    const bases = [primary];
    if (env !== 'production') {
        bases.push(`${brandConfig.platform.derivws.url.production}${optionsDir}`);
    }
    return bases;
};

const buildV2AuthHeaderVariants = (cleanToken: string): Record<string, string>[] => {
    const appId = getAppId();
    const isPat = cleanToken.startsWith('pat_');
    const variants: Record<string, string>[] = [];
    if (isPat) {
        variants.push({ Authorization: `Bearer ${cleanToken}`, Accept: 'application/json' });
        if (appId) {
            variants.push({
                Authorization: `Bearer ${cleanToken}`,
                'Deriv-App-ID': appId,
                Accept: 'application/json',
            });
        }
    } else {
        if (appId) {
            variants.push({
                Authorization: `Bearer ${cleanToken}`,
                'Deriv-App-ID': appId,
                Accept: 'application/json',
            });
        }
        variants.push({ Authorization: `Bearer ${cleanToken}`, Accept: 'application/json' });
    }
    return variants;
};

/**
 * Isolated V2 REST follower account lookup — NEVER writes to global sessionStorage/localStorage
 * `deriv_accounts`, preserving the Master trader's own authenticated session.
 */
async function tryFetchFollowerV2Accounts(
    cleanToken: string
): Promise<Array<Omit<SyncedClientAccount, 'enabled'>> | null> {
    const bases = getDerivWSRestBases();
    const headerVariants = buildV2AuthHeaderVariants(cleanToken);
    let sawAuthRejection = false;

    for (const base of bases) {
        const endpoint = `${base}accounts`;
        for (const headers of headerVariants) {
            try {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;
                const response = await fetch(endpoint, {
                    method: 'GET',
                    headers,
                    ...(controller ? { signal: controller.signal } : {}),
                });
                if (timer) clearTimeout(timer);

                if (response.ok) {
                    const payload = await response.json();
                    const list: DerivAccount[] = Array.isArray(payload?.data) ? payload.data : [];
                    if (list.length > 0) {
                        return list.map(acc => ({
                            token: cleanToken,
                            loginid: String(acc.account_id || ''),
                            currency: String(acc.currency || 'USD'),
                            balance: Number(acc.balance ?? 0),
                            isVirtual:
                                acc.account_type === 'demo' || isDemoAccount(String(acc.account_id || '')),
                            authMode: 'v2' as const,
                        }));
                    }
                } else if (response.status === 401 || response.status === 403) {
                    sawAuthRejection = true;
                }
            } catch {
                // Network / CORS / timeout — try next header or endpoint variant
            }
        }
    }

    if (cleanToken.startsWith('pat_') && sawAuthRejection) {
        throw new DerivClientTokenRejectedError(
            'Invalid or unauthorized Personal Access Token (ensure Read + Trade scopes are enabled).'
        );
    }

    return null;
}

/**
 * Isolated V2 OTP WebSocket URL fetch for a specific account (`POST /options/accounts/{id}/otp`).
 * Does not touch global DerivWSAccountsService caches.
 */
async function fetchIsolatedV2OtpWsUrl(cleanToken: string, accountId: string): Promise<string> {
    const bases = getDerivWSRestBases();
    const headerVariants = buildV2AuthHeaderVariants(cleanToken);
    let lastStatus = 0;

    for (const base of bases) {
        const endpoint = `${base}accounts/${encodeURIComponent(accountId)}/otp`;
        for (const headers of headerVariants) {
            try {
                const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
                const timer = controller ? setTimeout(() => controller.abort(), 10000) : null;
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers,
                    ...(controller ? { signal: controller.signal } : {}),
                });
                if (timer) clearTimeout(timer);

                if (response.ok) {
                    const payload = await response.json();
                    const parsed =
                        typeof payload?.data === 'string' ? JSON.parse(payload.data) : payload?.data;
                    const wsUrl = parsed?.url || payload?.url;
                    if (wsUrl) return String(wsUrl);
                } else {
                    lastStatus = response.status;
                }
            } catch {
                // continue to next variant
            }
        }
    }

    throw new Error(
        lastStatus === 401 || lastStatus === 403
            ? `Token lacks Trade/OTP permission for ${accountId} (HTTP ${lastStatus}).`
            : `Unable to establish authenticated Deriv OTP session for ${accountId}.`
    );
}

const getCandidateV3WsUrls = (): string[] => {
    const appId = getLegacyWsAppId();
    const preferred = getPreferredV3SocketURL();
    const urls = [preferred, ...DERIV_V3_WS_ENDPOINTS.map(base => `${base}?app_id=${appId}`)];
    return Array.from(new Set(urls));
};

/**
 * Connects and authorizes a Legacy V3 Deriv API token across all official V3 WebSocket hosts,
 * returning the open authorized WebSocket and the `authorize` payload.
 */
async function connectAuthorizedV3Socket(
    cleanToken: string
): Promise<{ ws: WebSocket; authorize: any; wsUrl: string }> {
    const candidateUrls = getCandidateV3WsUrls();
    let lastError: Error | null = null;

    for (const wsUrl of candidateUrls) {
        try {
            const result = await new Promise<{ ws: WebSocket; authorize: any }>((resolve, reject) => {
                let settled = false;
                const ws = new WebSocket(wsUrl);
                const timer = setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    try {
                        ws.close();
                    } catch {}
                    reject(new Error(`Timed out connecting to ${wsUrl}`));
                }, 10000);

                ws.onopen = () => {
                    try {
                        ws.send(JSON.stringify({ authorize: cleanToken }));
                    } catch (err) {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        try {
                            ws.close();
                        } catch {}
                        reject(err instanceof Error ? err : new Error('Failed to send authorize request.'));
                    }
                };

                ws.onmessage = evt => {
                    if (settled) return;
                    try {
                        const msg = JSON.parse(evt.data);
                        if (msg.msg_type === 'authorize' || msg.error) {
                            settled = true;
                            clearTimeout(timer);
                            if (msg.error) {
                                try {
                                    ws.close();
                                } catch {}
                                reject(
                                    new DerivClientTokenRejectedError(
                                        msg.error.message || 'Invalid Deriv API token.'
                                    )
                                );
                            } else {
                                resolve({ ws, authorize: msg.authorize });
                            }
                        }
                    } catch (err) {
                        settled = true;
                        clearTimeout(timer);
                        try {
                            ws.close();
                        } catch {}
                        reject(err instanceof Error ? err : new Error('Malformed Deriv response.'));
                    }
                };

                ws.onerror = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    try {
                        ws.close();
                    } catch {}
                    reject(new Error(`WebSocket handshake failed (${wsUrl})`));
                };

                ws.onclose = () => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    reject(new Error(`WebSocket closed before authorization (${wsUrl})`));
                };
            });

            try {
                if (typeof window !== 'undefined') {
                    window.localStorage.setItem('deriv_v3_ws_url', wsUrl);
                }
            } catch {}

            return { ...result, wsUrl };
        } catch (err) {
            if (err instanceof DerivClientTokenRejectedError) {
                throw err;
            }
            lastError = err instanceof Error ? err : new Error('WebSocket connection error.');
        }
    }

    throw new Error(
        cleanToken.startsWith('pat_')
            ? 'Unable to verify Personal Access Token against Deriv API. Check Read + Trade token scopes and network access.'
            : lastError?.message || 'Unable to reach Deriv WebSocket servers.'
    );
}

/**
 * Verifies either a Deriv V2 Bearer PAT (`pat_...`) or a Legacy V3 API token,
 * returning one or more synced client accounts ready for Copy Trading.
 */
export async function verifyClientTokenAccounts(
    rawToken: string
): Promise<Array<Omit<SyncedClientAccount, 'enabled'>>> {
    const cleanToken = rawToken
        .replace(/^['"]+|['"]+$/g, '')
        .replace(/^Bearer\s+/i, '')
        .trim();

    if (!cleanToken) {
        throw new Error('Empty API token.');
    }

    const v2Accounts = await tryFetchFollowerV2Accounts(cleanToken);
    if (v2Accounts && v2Accounts.length > 0) {
        return v2Accounts;
    }

    const { ws, authorize } = await connectAuthorizedV3Socket(cleanToken);
    try {
        ws.close();
    } catch {}

    const loginid = String(authorize?.loginid || '');
    return [
        {
            token: cleanToken,
            loginid,
            currency: String(authorize?.currency || 'USD'),
            balance: Number(authorize?.balance ?? 0),
            isVirtual: Boolean(authorize?.is_virtual) || isDemoAccount(loginid),
            authMode: 'v3',
        },
    ];
}

const getMasterV3Token = (): string => {
    try {
        const direct = localStorage.getItem('deriv_api_token') || localStorage.getItem('authToken');
        if (direct && !direct.startsWith('pat_')) return direct;
        const activeId = localStorage.getItem('active_loginid');
        const map = JSON.parse(localStorage.getItem('accountsList') || '{}');
        if (activeId && map[activeId] && !String(map[activeId]).startsWith('pat_')) {
            return String(map[activeId]);
        }
        const first = Object.values(map).find(
            val => typeof val === 'string' && !val.startsWith('pat_')
        );
        return typeof first === 'string' ? first : '';
    } catch {
        return '';
    }
};

const getMasterV2Session = (): { accessToken: string; accountId: string } | null => {
    try {
        const authInfo = getAuthInfo();
        const accessToken = authInfo?.access_token || '';
        if (!accessToken) return null;
        const accountId =
            getAccountId() ||
            localStorage.getItem('active_loginid') ||
            (api_base?.account_info as any)?.loginid ||
            DerivWSAccountsService.getStoredAccounts()?.[0]?.account_id ||
            '';
        if (!accountId) return null;
        return { accessToken, accountId };
    } catch {
        return null;
    }
};

const parseRawTokensInput = (input: string): string[] =>
    input
        .replace(/\bBearer\s+/gi, '')
        .split(/[\s,;]+/)
        .map(t => t.replace(/^['"]+|['"]+$/g, '').trim())
        .filter(Boolean);

export const CopyTrading: React.FC = () => {
    const [tokensInput, setTokensInput] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    const [accounts, setAccounts] = useState<SyncedClientAccount[]>(() => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    });

    const [isCopyActive, setIsCopyActive] = useState(false);
    const [stakeMultiplier, setStakeMultiplier] = useState('1.0');
    const [maxStakeCap, setMaxStakeCap] = useState('50');
    const [accountFilter, setAccountFilter] = useState<'all' | 'real' | 'demo'>('all');
    const [tradeLogs, setTradeLogs] = useState<MirroredTradeLog[]>([]);
    const [masterStatus, setMasterStatus] = useState<string>('Idle');

    // Deriv public trader token copying
    const [leaderToken, setLeaderToken] = useState('');
    const [leaderFollowing, setLeaderFollowing] = useState(false);
    const [leaderFeedback, setLeaderFeedback] = useState<string>('');

    const masterWsRef = useRef<WebSocket | null>(null);
    const mirroredContractIdsRef = useRef<Set<number>>(new Set());
    const accountsRef = useRef(accounts);
    accountsRef.current = accounts;

    useEffect(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
        } catch {}
    }, [accounts]);

    const handleSyncTokens = async (e: React.FormEvent) => {
        e.preventDefault();
        const rawTokens = parseRawTokensInput(tokensInput);

        if (rawTokens.length === 0) {
            setSyncMessage({
                type: 'err',
                text: 'Enter one or more Deriv API tokens separated by spaces or commas.',
            });
            return;
        }

        setSyncing(true);
        setSyncMessage(null);

        let syncedAccountsCount = 0;
        const errors: string[] = [];
        const updated = [...accounts];

        for (const tk of rawTokens) {
            try {
                const verifiedList = await verifyClientTokenAccounts(tk);
                for (const verified of verifiedList) {
                    if (!verified.loginid) continue;
                    const idx = updated.findIndex(a => a.loginid === verified.loginid);
                    if (idx >= 0) {
                        updated[idx] = { ...verified, enabled: updated[idx].enabled };
                    } else {
                        updated.push({ ...verified, enabled: true });
                    }
                    syncedAccountsCount++;
                }
            } catch (err) {
                errors.push(err instanceof Error ? err.message : 'Token validation failed.');
            }
        }

        setAccounts(updated);
        setSyncing(false);

        if (syncedAccountsCount > 0) {
            setTokensInput('');
            setSyncMessage({
                type: 'ok',
                text: `Synced ${syncedAccountsCount} account${syncedAccountsCount > 1 ? 's' : ''}${errors.length ? ` (${errors.length} failed)` : ''}.`,
            });
        } else {
            setSyncMessage({
                type: 'err',
                text: errors[0] || 'Could not validate entered token(s).',
            });
        }
    };

    const recordMirrorLog = useCallback(
        (
            follower: SyncedClientAccount,
            symbol: string,
            contractType: string,
            stake: number,
            ok: boolean,
            detail: string,
            balanceAfter?: number
        ) => {
            if (typeof balanceAfter === 'number' && Number.isFinite(balanceAfter)) {
                setAccounts(prev =>
                    prev.map(item =>
                        item.loginid === follower.loginid ? { ...item, balance: balanceAfter } : item
                    )
                );
            }
            setTradeLogs(prev => [
                {
                    id: `${Date.now()}-${follower.loginid}-${Math.random().toString(36).slice(2, 6)}`,
                    time: new Date().toLocaleTimeString(),
                    followerLoginId: follower.loginid,
                    symbol,
                    contractType,
                    stake,
                    status: ok ? 'MIRRORED' : 'FAILED',
                    detail,
                },
                ...prev.slice(0, 29),
            ]);
        },
        []
    );

    const mirrorContractToFollower = useCallback(
        async (follower: SyncedClientAccount, contract: any) => {
            const mult = Math.max(0.1, parseFloat(stakeMultiplier) || 1);
            const cap = Math.max(0.35, parseFloat(maxStakeCap) || 50);
            const rawStake = Number(contract.buy_price ?? contract.amount ?? 1) * mult;
            const stake = Number(Math.min(cap, Math.max(0.35, rawStake)).toFixed(2));
            const symbol = String(
                contract.underlying_symbol || contract.underlying || contract.symbol || 'R_100'
            );
            const contractType = String(contract.contract_type || 'CALL');

            let duration = 1;
            let durationUnit = 't';
            if (Number(contract.tick_count) > 0) {
                duration = Number(contract.tick_count);
                durationUnit = 't';
            } else if (Number(contract.duration) > 0 && contract.duration_unit) {
                duration = Number(contract.duration);
                durationUnit = String(contract.duration_unit);
            } else if (contract.date_expiry && contract.date_start) {
                const diffSec = Math.max(
                    1,
                    Math.round(Number(contract.date_expiry) - Number(contract.date_start))
                );
                if (diffSec < 60) {
                    duration = diffSec;
                    durationUnit = 's';
                } else {
                    duration = Math.max(1, Math.round(diffSec / 60));
                    durationUnit = 'm';
                }
            }

            const buildBuyParameters = (useUnderlyingSymbol: boolean): Record<string, any> => {
                const params: Record<string, any> = {
                    amount: stake,
                    basis: 'stake',
                    contract_type: contractType,
                    currency: follower.currency || 'USD',
                    duration,
                    duration_unit: durationUnit,
                };
                if (useUnderlyingSymbol) params.underlying_symbol = symbol;
                else params.symbol = symbol;

                if (
                    contract.barrier !== undefined &&
                    contract.barrier !== null &&
                    String(contract.barrier) !== ''
                ) {
                    params.barrier = String(contract.barrier);
                }
                return params;
            };

            const isV2Follower =
                follower.authMode === 'v2' ||
                (!follower.authMode && follower.token.startsWith('pat_'));

            try {
                if (isV2Follower) {
                    const otpWsUrl = await fetchIsolatedV2OtpWsUrl(follower.token, follower.loginid);
                    await new Promise<void>(resolve => {
                        let settled = false;
                        let retriedWithSymbol = false;
                        const ws = new WebSocket(otpWsUrl);
                        const timer = setTimeout(() => {
                            if (settled) return;
                            settled = true;
                            try {
                                ws.close();
                            } catch {}
                            recordMirrorLog(
                                follower,
                                symbol,
                                contractType,
                                stake,
                                false,
                                'Timed out placing mirrored trade'
                            );
                            resolve();
                        }, 12000);

                        ws.onopen = () => {
                            ws.send(
                                JSON.stringify({
                                    buy: '1',
                                    price: stake,
                                    parameters: buildBuyParameters(true),
                                })
                            );
                        };

                        ws.onmessage = evt => {
                            if (settled) return;
                            try {
                                const msg = JSON.parse(evt.data);
                                if (
                                    msg.error?.code === 'InputValidationFailed' &&
                                    !retriedWithSymbol
                                ) {
                                    retriedWithSymbol = true;
                                    ws.send(
                                        JSON.stringify({
                                            buy: '1',
                                            price: stake,
                                            parameters: buildBuyParameters(false),
                                        })
                                    );
                                    return;
                                }
                                if (msg.msg_type === 'buy' || msg.error) {
                                    settled = true;
                                    clearTimeout(timer);
                                    const ok = !msg.error && Boolean(msg.buy?.contract_id);
                                    const nextBal =
                                        msg.buy?.balance_after !== undefined
                                            ? Number(msg.buy.balance_after)
                                            : undefined;
                                    recordMirrorLog(
                                        follower,
                                        symbol,
                                        contractType,
                                        stake,
                                        ok,
                                        ok
                                            ? `Contract #${msg.buy.contract_id}`
                                            : msg.error?.message || 'Execution rejected',
                                        nextBal
                                    );
                                    try {
                                        ws.close();
                                    } catch {}
                                    resolve();
                                }
                            } catch {}
                        };

                        ws.onerror = () => {
                            if (settled) return;
                            settled = true;
                            clearTimeout(timer);
                            try {
                                ws.close();
                            } catch {}
                            recordMirrorLog(
                                follower,
                                symbol,
                                contractType,
                                stake,
                                false,
                                'Follower OTP WebSocket error'
                            );
                            resolve();
                        };
                    });
                    return;
                }

                const { ws } = await connectAuthorizedV3Socket(follower.token);
                await new Promise<void>(resolve => {
                    let settled = false;
                    let retriedWithUnderlying = false;
                    const timer = setTimeout(() => {
                        if (settled) return;
                        settled = true;
                        try {
                            ws.close();
                        } catch {}
                        recordMirrorLog(
                            follower,
                            symbol,
                            contractType,
                            stake,
                            false,
                            'Timed out placing mirrored trade'
                        );
                        resolve();
                    }, 12000);

                    ws.onmessage = evt => {
                        if (settled) return;
                        try {
                            const msg = JSON.parse(evt.data);
                            if (
                                msg.error?.code === 'InputValidationFailed' &&
                                !retriedWithUnderlying
                            ) {
                                retriedWithUnderlying = true;
                                ws.send(
                                    JSON.stringify({
                                        buy: 1,
                                        price: stake,
                                        parameters: buildBuyParameters(true),
                                    })
                                );
                                return;
                            }
                            if (msg.msg_type === 'buy' || msg.error) {
                                settled = true;
                                clearTimeout(timer);
                                const ok = !msg.error && Boolean(msg.buy?.contract_id);
                                const nextBal =
                                    msg.buy?.balance_after !== undefined
                                        ? Number(msg.buy.balance_after)
                                        : undefined;
                                recordMirrorLog(
                                    follower,
                                    symbol,
                                    contractType,
                                    stake,
                                    ok,
                                    ok
                                        ? `Contract #${msg.buy.contract_id}`
                                        : msg.error?.message || 'Execution rejected',
                                    nextBal
                                );
                                try {
                                    ws.close();
                                } catch {}
                                resolve();
                            }
                        } catch {}
                    };

                    ws.onerror = () => {
                        if (settled) return;
                        settled = true;
                        clearTimeout(timer);
                        try {
                            ws.close();
                        } catch {}
                        recordMirrorLog(
                            follower,
                            symbol,
                            contractType,
                            stake,
                            false,
                            'Follower WebSocket error'
                        );
                        resolve();
                    };

                    ws.send(
                        JSON.stringify({
                            buy: 1,
                            price: stake,
                            parameters: buildBuyParameters(false),
                        })
                    );
                });
            } catch (err) {
                recordMirrorLog(
                    follower,
                    symbol,
                    contractType,
                    stake,
                    false,
                    err instanceof Error ? err.message : 'Follower connection failed'
                );
            }
        },
        [stakeMultiplier, maxStakeCap, recordMirrorLog]
    );

    useEffect(() => {
        if (!isCopyActive) {
            if (masterWsRef.current) {
                try {
                    masterWsRef.current.close();
                } catch {}
                masterWsRef.current = null;
            }
            setMasterStatus('Idle');
            return;
        }

        let cancelled = false;
        let apiBaseSub: { unsubscribe?: () => void } | null = null;

        const dispatchContractToFollowers = (masterLoginId: string, contractPayload: any) => {
            const cid = Number(contractPayload?.contract_id);
            if (!cid || mirroredContractIdsRef.current.has(cid)) return;
            mirroredContractIdsRef.current.add(cid);
            const activeFollowers = accountsRef.current.filter(
                f => f.enabled && f.loginid && f.loginid !== masterLoginId
            );
            activeFollowers.forEach(f => {
                void mirrorContractToFollower(f, contractPayload);
            });
        };

        const v2Session = getMasterV2Session();
        const masterV3Token = getMasterV3Token();
        const activeApiBaseLoginId = String(
            (api_base?.account_info as any)?.loginid ||
                localStorage.getItem('active_loginid') ||
                v2Session?.accountId ||
                ''
        );

        // 1. Subscribe immediately to in-app `api_base.api` messages if available (0ms latency)
        if (api_base?.api?.onMessage) {
            try {
                apiBaseSub = api_base.api.onMessage().subscribe(({ data }: any) => {
                    if (cancelled || !data) return;
                    if (data.msg_type === 'buy' && data.buy?.contract_id) {
                        const reqParams = data.echo_req?.parameters || {};
                        dispatchContractToFollowers(activeApiBaseLoginId, {
                            contract_id: data.buy.contract_id,
                            buy_price: data.buy.buy_price ?? reqParams.amount,
                            underlying_symbol: reqParams.underlying_symbol || reqParams.symbol,
                            contract_type: reqParams.contract_type,
                            duration: reqParams.duration,
                            duration_unit: reqParams.duration_unit,
                            barrier: reqParams.barrier,
                        });
                    } else if (
                        data.msg_type === 'proposal_open_contract' &&
                        data.proposal_open_contract?.contract_id &&
                        !data.proposal_open_contract.is_sold
                    ) {
                        const poc = data.proposal_open_contract;
                        dispatchContractToFollowers(
                            String(poc.account_id || activeApiBaseLoginId),
                            poc
                        );
                    }
                });
            } catch {}
        }

        if (!v2Session && !masterV3Token && !apiBaseSub) {
            setMasterStatus('Log in or connect via PAT Login first');
            setIsCopyActive(false);
            return;
        }

        setMasterStatus('Connecting to Master Account…');

        // 2. Also open a dedicated Master listener socket so external trades on the Master account are caught too
        (async () => {
            try {
                if (v2Session) {
                    const otpWsUrl = await fetchIsolatedV2OtpWsUrl(
                        v2Session.accessToken,
                        v2Session.accountId
                    );
                    if (cancelled) return;
                    const ws = new WebSocket(otpWsUrl);
                    masterWsRef.current = ws;
                    let initializedSnapshot = false;

                    ws.onopen = () => {
                        if (cancelled) return;
                        setMasterStatus(`Listening on Master ${v2Session.accountId}`);
                        ws.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
                    };

                    ws.onmessage = evt => {
                        if (cancelled) return;
                        try {
                            const msg = JSON.parse(evt.data);
                            if (msg.msg_type === 'proposal_open_contract' && msg.proposal_open_contract) {
                                const poc = msg.proposal_open_contract;
                                if (!poc.contract_id) {
                                    initializedSnapshot = true;
                                    return;
                                }
                                const cid = Number(poc.contract_id);
                                if (!initializedSnapshot) {
                                    mirroredContractIdsRef.current.add(cid);
                                    initializedSnapshot = true;
                                    return;
                                }
                                if (!poc.is_sold) {
                                    dispatchContractToFollowers(
                                        String(poc.account_id || v2Session.accountId),
                                        poc
                                    );
                                }
                            }
                        } catch {}
                    };

                    ws.onerror = () => {
                        if (!cancelled && !apiBaseSub) {
                            setMasterStatus('Master stream connection error');
                        } else if (!cancelled && apiBaseSub) {
                            setMasterStatus(`Listening on Master ${v2Session.accountId}`);
                        }
                    };
                    return;
                }

                if (masterV3Token) {
                    const { ws, authorize } = await connectAuthorizedV3Socket(masterV3Token);
                    if (cancelled) {
                        try {
                            ws.close();
                        } catch {}
                        return;
                    }
                    masterWsRef.current = ws;
                    const masterId = String(authorize?.loginid || activeApiBaseLoginId || 'Master');
                    setMasterStatus(`Listening on Master ${masterId}`);
                    let initializedSnapshot = false;

                    ws.onmessage = evt => {
                        if (cancelled) return;
                        try {
                            const msg = JSON.parse(evt.data);
                            if (msg.msg_type === 'proposal_open_contract' && msg.proposal_open_contract) {
                                const poc = msg.proposal_open_contract;
                                if (!poc.contract_id) {
                                    initializedSnapshot = true;
                                    return;
                                }
                                const cid = Number(poc.contract_id);
                                if (!initializedSnapshot) {
                                    mirroredContractIdsRef.current.add(cid);
                                    initializedSnapshot = true;
                                    return;
                                }
                                if (!poc.is_sold) {
                                    dispatchContractToFollowers(String(poc.account_id || masterId), poc);
                                }
                            }
                        } catch {}
                    };

                    ws.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
                    return;
                }

                if (apiBaseSub) {
                    setMasterStatus(`Listening on Master ${activeApiBaseLoginId || 'Active Session'}`);
                }
            } catch (err) {
                if (cancelled) return;
                if (apiBaseSub && activeApiBaseLoginId) {
                    setMasterStatus(`Listening on Master ${activeApiBaseLoginId}`);
                } else {
                    setMasterStatus(
                        `Master Auth Error: ${err instanceof Error ? err.message : 'Unable to connect'}`
                    );
                    setIsCopyActive(false);
                }
            }
        })();

        return () => {
            cancelled = true;
            try {
                apiBaseSub?.unsubscribe?.();
            } catch {}
            if (masterWsRef.current) {
                try {
                    masterWsRef.current.close();
                } catch {}
                masterWsRef.current = null;
            }
        };
    }, [isCopyActive, mirrorContractToFollower]);

    const handleLeaderToggle = async () => {
        const v2Session = getMasterV2Session();
        const masterV3Token = getMasterV3Token();
        if (!v2Session && !masterV3Token) {
            setLeaderFeedback('Please log in or authenticate with PAT Login first.');
            return;
        }
        if (!leaderFollowing && !leaderToken.trim()) {
            setLeaderFeedback('Enter a Deriv Leader Trader token to copy.');
            return;
        }

        const commandPayload = !leaderFollowing
            ? { copy_start: leaderToken.trim() }
            : { copy_stop: leaderToken.trim() };

        try {
            let ws: WebSocket;
            if (v2Session) {
                const otpWsUrl = await fetchIsolatedV2OtpWsUrl(
                    v2Session.accessToken,
                    v2Session.accountId
                );
                ws = await new Promise<WebSocket>((resolve, reject) => {
                    const sock = new WebSocket(otpWsUrl);
                    const t = setTimeout(() => {
                        try {
                            sock.close();
                        } catch {}
                        reject(new Error('Timed out connecting to Deriv session.'));
                    }, 10000);
                    sock.onopen = () => {
                        clearTimeout(t);
                        resolve(sock);
                    };
                    sock.onerror = () => {
                        clearTimeout(t);
                        reject(new Error('WebSocket connection error.'));
                    };
                });
            } else {
                const connected = await connectAuthorizedV3Socket(masterV3Token);
                ws = connected.ws;
            }

            await new Promise<void>(resolve => {
                const timer = setTimeout(() => {
                    setLeaderFeedback('Timed out waiting for copy command response.');
                    try {
                        ws.close();
                    } catch {}
                    resolve();
                }, 10000);

                ws.onmessage = evt => {
                    try {
                        const msg = JSON.parse(evt.data);
                        if (
                            msg.msg_type === 'copy_start' ||
                            msg.msg_type === 'copy_stop' ||
                            msg.error
                        ) {
                            clearTimeout(timer);
                            if (msg.error) {
                                setLeaderFeedback(msg.error.message || 'Copy command failed.');
                            } else {
                                const next = msg.msg_type === 'copy_start';
                                setLeaderFollowing(next);
                                setLeaderFeedback(
                                    next
                                        ? 'Now copying external Deriv trader.'
                                        : 'Stopped external copy stream.'
                                );
                            }
                            try {
                                ws.close();
                            } catch {}
                            resolve();
                        }
                    } catch {}
                };

                ws.onerror = () => {
                    clearTimeout(timer);
                    setLeaderFeedback('Copy stream connection error.');
                    try {
                        ws.close();
                    } catch {}
                    resolve();
                };

                ws.send(JSON.stringify(commandPayload));
            });
        } catch (err) {
            setLeaderFeedback(err instanceof Error ? err.message : 'Unable to send copy command.');
        }
    };

    const visibleAccounts = accounts.filter(acc => {
        if (accountFilter === 'real') return !acc.isVirtual;
        if (accountFilter === 'demo') return acc.isVirtual;
        return true;
    });

    return (
        <div className='tp-copy-page'>
            <div className='tp-copy-page__wrap'>
                <div className='tp-copy-hero'>
                    <div>
                        <span className='tp-copy-hero__eyebrow'>MULTI-ACCOUNT TRADE MIRRORING</span>
                        <h1 className='tp-copy-hero__title'>Copy Trading &amp; Client Account Sync</h1>
                        <p className='tp-copy-hero__sub'>
                            Sync follower API tokens and mirror every trade executed on your Master account in real time.
                        </p>
                    </div>

                    <div className='tp-copy-hero__master'>
                        <div className='tp-copy-hero__status'>
                            <span className={`tp-copy-hero__dot${isCopyActive ? ' tp-copy-hero__dot--on' : ''}`} />
                            <span>{masterStatus}</span>
                        </div>
                        <button
                            type='button'
                            className={`tp-copy-hero__toggle${isCopyActive ? ' tp-copy-hero__toggle--on' : ''}`}
                            onClick={() => setIsCopyActive(v => !v)}
                        >
                            Copy Trading: {isCopyActive ? 'ON' : 'OFF'}
                        </button>
                    </div>
                </div>

                <div className='tp-copy-grid'>
                    <section className='tp-copy-card'>
                        <h2 className='tp-copy-card__title'>Enter Client API Tokens</h2>
                        <p className='tp-copy-card__desc'>
                            Paste one or multiple Deriv API tokens (comma or space separated) with Read + Trade permissions.
                        </p>

                        <form className='tp-copy-sync-form' onSubmit={handleSyncTokens}>
                            <input
                                type='text'
                                className='tp-copy-sync-form__input'
                                placeholder='Enter Tokens (e.g. pat_... , a1-xyz...)'
                                value={tokensInput}
                                onChange={e => setTokensInput(e.target.value)}
                            />
                            <button type='submit' className='tp-copy-sync-form__btn' disabled={syncing}>
                                {syncing ? 'SYNCING…' : 'SYNC'}
                            </button>
                        </form>

                        {syncMessage && (
                            <div className={`tp-copy-alert tp-copy-alert--${syncMessage.type}`}>
                                {syncMessage.text}
                            </div>
                        )}

                        <div className='tp-copy-params'>
                            <label className='tp-copy-params__field'>
                                <span>Stake Multiplier (×)</span>
                                <input
                                    type='number'
                                    min='0.1'
                                    max='20'
                                    step='0.1'
                                    value={stakeMultiplier}
                                    onChange={e => setStakeMultiplier(e.target.value)}
                                />
                            </label>
                            <label className='tp-copy-params__field'>
                                <span>Max Stake Cap ($)</span>
                                <input
                                    type='number'
                                    min='0.35'
                                    step='1'
                                    value={maxStakeCap}
                                    onChange={e => setMaxStakeCap(e.target.value)}
                                />
                            </label>
                        </div>

                        <div className='tp-copy-leader'>
                            <h3 className='tp-copy-leader__title'>Follow External Deriv Signal Token</h3>
                            <div className='tp-copy-sync-form'>
                                <input
                                    type='text'
                                    className='tp-copy-sync-form__input'
                                    placeholder='Leader trader copy token…'
                                    value={leaderToken}
                                    onChange={e => setLeaderToken(e.target.value)}
                                />
                                <button
                                    type='button'
                                    className={`tp-copy-sync-form__btn${leaderFollowing ? ' tp-copy-sync-form__btn--stop' : ''}`}
                                    onClick={() => void handleLeaderToggle()}
                                >
                                    {leaderFollowing ? 'STOP' : 'COPY'}
                                </button>
                            </div>
                            {leaderFeedback && <p className='tp-copy-leader__note'>{leaderFeedback}</p>}
                        </div>
                    </section>

                    <section className='tp-copy-card'>
                        <div className='tp-copy-card__head-row'>
                            <h2 className='tp-copy-card__title'>
                                Synced Accounts ({visibleAccounts.length})
                            </h2>
                            <div className='tp-copy-tabs'>
                                <button
                                    type='button'
                                    className={accountFilter === 'all' ? 'active' : ''}
                                    onClick={() => setAccountFilter('all')}
                                >
                                    All
                                </button>
                                <button
                                    type='button'
                                    className={accountFilter === 'real' ? 'active' : ''}
                                    onClick={() => setAccountFilter('real')}
                                >
                                    Real Accounts
                                </button>
                                <button
                                    type='button'
                                    className={accountFilter === 'demo' ? 'active' : ''}
                                    onClick={() => setAccountFilter('demo')}
                                >
                                    Demo
                                </button>
                            </div>
                        </div>

                        {visibleAccounts.length === 0 ? (
                            <div className='tp-copy-empty'>
                                No synced client accounts yet. Enter API tokens on the left and click <strong>SYNC</strong>.
                            </div>
                        ) : (
                            <div className='tp-copy-table-wrap'>
                                <table className='tp-copy-table'>
                                    <thead>
                                        <tr>
                                            <th>Login ID</th>
                                            <th>Type</th>
                                            <th>Balance</th>
                                            <th>Mirror</th>
                                            <th />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {visibleAccounts.map(acc => (
                                            <tr key={acc.loginid}>
                                                <td>
                                                    <strong>{acc.loginid}</strong>
                                                </td>
                                                <td>
                                                    <span
                                                        className={`tp-copy-badge ${acc.isVirtual ? 'tp-copy-badge--demo' : 'tp-copy-badge--real'}`}
                                                    >
                                                        {acc.isVirtual ? 'DEMO' : 'REAL'}
                                                    </span>
                                                </td>
                                                <td>
                                                    {acc.balance.toFixed(2)} {acc.currency}
                                                </td>
                                                <td>
                                                    <input
                                                        type='checkbox'
                                                        checked={acc.enabled}
                                                        onChange={() =>
                                                            setAccounts(prev =>
                                                                prev.map(item =>
                                                                    item.loginid === acc.loginid
                                                                        ? { ...item, enabled: !item.enabled }
                                                                        : item
                                                                )
                                                            )
                                                        }
                                                    />
                                                </td>
                                                <td>
                                                    <button
                                                        type='button'
                                                        className='tp-copy-remove'
                                                        onClick={() =>
                                                            setAccounts(prev =>
                                                                prev.filter(item => item.loginid !== acc.loginid)
                                                            )
                                                        }
                                                    >
                                                        Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <h3 className='tp-copy-subhead'>Live Mirrored Execution Feed</h3>
                        {tradeLogs.length === 0 ? (
                            <div className='tp-copy-empty tp-copy-empty--compact'>
                                Turn <strong>Copy Trading: ON</strong> to broadcast Master trades to enabled follower accounts.
                            </div>
                        ) : (
                            <div className='tp-copy-logs'>
                                {tradeLogs.map(log => (
                                    <div key={log.id} className='tp-copy-log-row'>
                                        <span>{log.time}</span>
                                        <strong>{log.followerLoginId}</strong>
                                        <span>
                                            {log.symbol} · {log.contractType} · ${log.stake.toFixed(2)}
                                        </span>
                                        <span
                                            className={`tp-copy-badge ${log.status === 'MIRRORED' ? 'tp-copy-badge--real' : 'tp-copy-badge--err'}`}
                                        >
                                            {log.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                </div>
            </div>
        </div>
    );
};

export default CopyTrading;
