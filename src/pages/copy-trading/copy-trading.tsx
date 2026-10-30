import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getAppId } from '@/components/shared';
import './copy-trading.scss';

interface SyncedClientAccount {
    token: string;
    loginid: string;
    currency: string;
    balance: number;
    isVirtual: boolean;
    enabled: boolean;
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

const getMasterToken = (): string => {
    try {
        const direct = localStorage.getItem('deriv_api_token') || localStorage.getItem('authToken');
        if (direct) return direct;
        const activeId = localStorage.getItem('active_loginid');
        const map = JSON.parse(localStorage.getItem('accountsList') || '{}');
        if (activeId && map[activeId]) return map[activeId];
        const first = Object.values(map)[0];
        return typeof first === 'string' ? first : '';
    } catch {
        return '';
    }
};

const verifyTokenOnce = (token: string): Promise<Omit<SyncedClientAccount, 'enabled'>> =>
    new Promise((resolve, reject) => {
        const appId = getAppId() || 1089;
        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
        const timer = setTimeout(() => {
            try {
                ws.close();
            } catch {}
            reject(new Error('Timed out verifying token.'));
        }, 12000);

        ws.onopen = () => ws.send(JSON.stringify({ authorize: token }));
        ws.onmessage = evt => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.msg_type === 'authorize' || msg.error) {
                    clearTimeout(timer);
                    try {
                        ws.close();
                    } catch {}
                    if (msg.error) {
                        reject(new Error(msg.error.message || 'Invalid API token'));
                    } else {
                        const a = msg.authorize;
                        resolve({
                            token,
                            loginid: String(a.loginid || ''),
                            currency: String(a.currency || 'USD'),
                            balance: Number(a.balance ?? 0),
                            isVirtual: Boolean(a.is_virtual) || String(a.loginid || '').startsWith('VR'),
                        });
                    }
                }
            } catch (e) {
                clearTimeout(timer);
                reject(e);
            }
        };
        ws.onerror = () => {
            clearTimeout(timer);
            reject(new Error('WebSocket connection error.'));
        };
    });

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
        const rawTokens = tokensInput
            .split(/[\s,;]+/)
            .map(t => t.trim())
            .filter(Boolean);

        if (rawTokens.length === 0) {
            setSyncMessage({ type: 'err', text: 'Enter one or more Deriv API tokens separated by spaces or commas.' });
            return;
        }

        setSyncing(true);
        setSyncMessage(null);

        let added = 0;
        const errors: string[] = [];
        const updated = [...accounts];

        for (const tk of rawTokens) {
            try {
                const verified = await verifyTokenOnce(tk);
                const idx = updated.findIndex(a => a.loginid === verified.loginid);
                if (idx >= 0) {
                    updated[idx] = { ...verified, enabled: updated[idx].enabled };
                } else {
                    updated.push({ ...verified, enabled: true });
                }
                added++;
            } catch (err) {
                errors.push(err instanceof Error ? err.message : 'Token failed');
            }
        }

        setAccounts(updated);
        setSyncing(false);

        if (added > 0) {
            setTokensInput('');
            setSyncMessage({
                type: 'ok',
                text: `Synced ${added} account${added > 1 ? 's' : ''}${errors.length ? ` (${errors.length} failed)` : ''}.`,
            });
        } else {
            setSyncMessage({ type: 'err', text: errors[0] || 'Could not validate entered token(s).' });
        }
    };

    const mirrorContractToFollower = useCallback(
        (follower: SyncedClientAccount, contract: any) => {
            const mult = Math.max(0.1, parseFloat(stakeMultiplier) || 1);
            const cap = Math.max(0.35, parseFloat(maxStakeCap) || 50);
            const rawStake = Number(contract.buy_price || 1) * mult;
            const stake = Number(Math.min(cap, Math.max(0.35, rawStake)).toFixed(2));
            const symbol = String(contract.underlying || 'R_100');
            const contractType = String(contract.contract_type || 'CALL');

            const appId = getAppId() || 1089;
            const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);

            ws.onopen = () => ws.send(JSON.stringify({ authorize: follower.token }));
            ws.onmessage = evt => {
                try {
                    const msg = JSON.parse(evt.data);
                    if (msg.msg_type === 'authorize' && !msg.error) {
                        const params: Record<string, any> = {
                            amount: stake,
                            basis: 'stake',
                            contract_type: contractType,
                            currency: follower.currency || 'USD',
                            duration: Number(contract.tick_count || 1),
                            duration_unit: contract.tick_count ? 't' : 'm',
                            symbol,
                        };
                        if (contract.barrier !== undefined && contract.barrier !== null) {
                            params.barrier = String(contract.barrier);
                        }
                        ws.send(JSON.stringify({ buy: 1, price: stake, parameters: params }));
                    } else if (msg.msg_type === 'buy' || msg.error) {
                        const ok = !msg.error && Boolean(msg.buy?.contract_id);
                        setTradeLogs(prev => [
                            {
                                id: `${Date.now()}-${follower.loginid}`,
                                time: new Date().toLocaleTimeString(),
                                followerLoginId: follower.loginid,
                                symbol,
                                contractType,
                                stake,
                                status: ok ? 'MIRRORED' : 'FAILED',
                                detail: ok
                                    ? `Contract #${msg.buy.contract_id}`
                                    : msg.error?.message || 'Execution rejected',
                            },
                            ...prev.slice(0, 29),
                        ]);
                        try {
                            ws.close();
                        } catch {}
                    }
                } catch {}
            };
        },
        [stakeMultiplier, maxStakeCap]
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

        const masterToken = getMasterToken();
        if (!masterToken) {
            setMasterStatus('Connect Master Account via API Token Login first');
            setIsCopyActive(false);
            return;
        }

        const appId = getAppId() || 1089;
        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
        masterWsRef.current = ws;
        setMasterStatus('Connecting to Master Account…');
        let initializedSnapshot = false;

        ws.onopen = () => ws.send(JSON.stringify({ authorize: masterToken }));
        ws.onmessage = evt => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.msg_type === 'authorize') {
                    if (msg.error) {
                        setMasterStatus(`Master Auth Error: ${msg.error.message}`);
                        setIsCopyActive(false);
                        return;
                    }
                    setMasterStatus(`Listening on Master ${msg.authorize.loginid}`);
                    ws.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 }));
                } else if (msg.msg_type === 'proposal_open_contract' && msg.proposal_open_contract) {
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
                    if (!mirroredContractIdsRef.current.has(cid) && !poc.is_sold) {
                        mirroredContractIdsRef.current.add(cid);
                        const activeFollowers = accountsRef.current.filter(
                            f => f.enabled && f.loginid !== poc.account_id
                        );
                        activeFollowers.forEach(f => mirrorContractToFollower(f, poc));
                    }
                }
            } catch {}
        };

        return () => {
            try {
                ws.close();
            } catch {}
        };
    }, [isCopyActive, mirrorContractToFollower]);

    const handleLeaderToggle = () => {
        const masterToken = getMasterToken();
        if (!masterToken) {
            setLeaderFeedback('Please authenticate with API Token Login first.');
            return;
        }
        if (!leaderFollowing && !leaderToken.trim()) {
            setLeaderFeedback('Enter a Deriv Leader Trader token to copy.');
            return;
        }

        const appId = getAppId() || 1089;
        const ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
        ws.onopen = () => ws.send(JSON.stringify({ authorize: masterToken }));
        ws.onmessage = evt => {
            try {
                const msg = JSON.parse(evt.data);
                if (msg.msg_type === 'authorize' && !msg.error) {
                    if (!leaderFollowing) {
                        ws.send(JSON.stringify({ copy_start: leaderToken.trim() }));
                    } else {
                        ws.send(JSON.stringify({ copy_stop: leaderToken.trim() }));
                    }
                } else if (msg.msg_type === 'copy_start' || msg.msg_type === 'copy_stop' || msg.error) {
                    if (msg.error) {
                        setLeaderFeedback(msg.error.message || 'Copy command failed.');
                    } else {
                        const next = msg.msg_type === 'copy_start';
                        setLeaderFollowing(next);
                        setLeaderFeedback(next ? 'Now copying external Deriv trader.' : 'Stopped external copy stream.');
                    }
                    try {
                        ws.close();
                    } catch {}
                }
            } catch {}
        };
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
                                placeholder='Enter Tokens (e.g. a1-xyz... , b2-abc...)'
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
                                    onClick={handleLeaderToggle}
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
