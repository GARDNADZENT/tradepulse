/**
 * Persistence for AI Bot 08's virtual gate.
 *
 * The gate used to live only in a module-level Map plus component state, so a
 * page reload erased the outstanding "virtual losses owed" obligation *and* reset
 * the trader's configured target back to the default of 1. Bot 08 then resumed
 * recovery and bought real immediately with zero virtual losses — the reported
 * production symptom.
 *
 * Storage is per account and deliberately session-scoped: it survives a reload or
 * remount, but memory of a stale gate does not leak across browser sessions.
 */

export interface PersistedVirtualGate {
    virtualLossesRequired: number;
    /** Real loss opened the gate and no real recovery win has closed it yet. */
    inRecovery: boolean;
    virtualLosses: number;
}

const PREFIX = 'tp_ai_bot08_virtual_gate:';

const storage = (): Storage | null => {
    try {
        if (typeof window === 'undefined' || !window.sessionStorage) return null;
        return window.sessionStorage;
    } catch {
        // Private mode / blocked storage must never break trading.
        return null;
    }
};

const key = (accountKey: string) => `${PREFIX}${accountKey}`;

export const readVirtualGate = (accountKey: string): PersistedVirtualGate | undefined => {
    if (!accountKey) return undefined;
    try {
        const raw = storage()?.getItem(key(accountKey));
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as Partial<PersistedVirtualGate>;
        const required = Math.floor(Number(parsed?.virtualLossesRequired));
        const losses = Math.floor(Number(parsed?.virtualLosses));
        if (!Number.isFinite(required) || required < 1) return undefined;
        if (!Number.isFinite(losses) || losses < 0) return undefined;
        return {
            virtualLossesRequired: required,
            inRecovery: Boolean(parsed?.inRecovery),
            virtualLosses: losses,
        };
    } catch {
        return undefined;
    }
};

export const writeVirtualGate = (accountKey: string, gate: PersistedVirtualGate): void => {
    if (!accountKey) return;
    try {
        storage()?.setItem(key(accountKey), JSON.stringify(gate));
    } catch {
        // ignore quota / blocked storage
    }
};

export const clearVirtualGate = (accountKey: string): void => {
    if (!accountKey) return;
    try {
        storage()?.removeItem(key(accountKey));
    } catch {
        // ignore
    }
};
