export type TpSlModalKind = 'tp' | 'sl';

export interface TpSlModalPayload {
    id: number;
    type: TpSlModalKind;
    amount: number;
    currency: string;
    source?: string;
}

type Listener = (payload: TpSlModalPayload | null) => void;

let currentModal: TpSlModalPayload | null = null;
let lastTriggeredAt = 0;
let lastTriggeredType: TpSlModalKind | null = null;
let seq = 1;
const listeners = new Set<Listener>();

function emit(): void {
    listeners.forEach(fn => {
        try {
            fn(currentModal);
        } catch {
            // ignore listener error
        }
    });
}

export function formatTpSlSignedAmount(amount: number, currency = 'USD', type: TpSlModalKind = 'tp'): string {
    const num = Number.isFinite(Number(amount)) ? Math.abs(Number(amount)) : 0;
    const sign = type === 'tp' ? '+' : '-';
    const fixed = num.toFixed(2);
    const upper = String(currency || 'USD').trim().toUpperCase();

    if (upper === 'USD' || upper === 'US$') return `${sign}$${fixed}`;
    if (upper === 'EUR') return `${sign}€${fixed}`;
    if (upper === 'GBP') return `${sign}£${fixed}`;
    return `${sign}${fixed} ${upper}`;
}

export function triggerTpSlModal(params: {
    type: TpSlModalKind;
    amount: number;
    currency?: string;
    source?: string;
}): void {
    const now = Date.now();
    // Deduplicate back-to-back triggers from overlapping bot hooks (e.g. text_print + Bot.isTradeAgain(false))
    if (
        currentModal &&
        lastTriggeredType === params.type &&
        now - lastTriggeredAt < 1800
    ) {
        return;
    }

    lastTriggeredAt = now;
    lastTriggeredType = params.type;
    currentModal = {
        id: seq++,
        type: params.type,
        amount: Number(params.amount || 0),
        currency: params.currency || 'USD',
        source: params.source,
    };
    emit();
}

export function dismissTpSlModal(): void {
    if (!currentModal) return;
    currentModal = null;
    emit();
}

export function getTpSlModalState(): TpSlModalPayload | null {
    return currentModal;
}

export function resetTpSlModalForTests(): void {
    currentModal = null;
    lastTriggeredAt = 0;
    lastTriggeredType = null;
    emit();
}

export function subscribeTpSlModal(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function classifyBotAlertForTpSl(
    rawMessage: unknown,
    sessionProfit: number,
    sessionRuns: number
): TpSlModalKind | null {
    if (sessionRuns <= 0) return null;
    const text = String(rawMessage ?? '').toLowerCase();

    if (
        /take\s*profit|target\s*profit|expected\s*profit|congrat|printed|tp\s*hit|goal\s*reached/i.test(
            text
        )
    ) {
        return 'tp';
    }
    if (/stop\s*loss|max\s*loss|sl\s*hit|oops|hit\s*your\s*stop|loss\s*limit/i.test(text)) {
        return 'sl';
    }

    if (sessionProfit > 0) return 'tp';
    if (sessionProfit < 0) return 'sl';
    return null;
}

export function autoDockRunPanel(runPanel: any, preferredTabIndex: 0 | 1 | 2 = 1): void {
    if (!runPanel) return;
    try {
        if (typeof runPanel.setActiveTabIndex === 'function') {
            runPanel.setActiveTabIndex(preferredTabIndex);
        } else if ('active_index' in runPanel) {
            runPanel.active_index = preferredTabIndex;
        }
        if (typeof runPanel.toggleDrawer === 'function') {
            runPanel.toggleDrawer(true);
        } else if ('is_drawer_open' in runPanel) {
            runPanel.is_drawer_open = true;
        }
    } catch {
        // ignore store edge cases in isolated unit tests
    }
}
