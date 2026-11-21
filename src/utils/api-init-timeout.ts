/**
 * Helpers for turning the app's "Initializing Deriv Bot account" gate into a
 * bounded, diagnosable startup instead of an endless spinner.
 *
 * Background: the dashboard used to leave the loading screen only from inside
 * `retrieveActiveSymbols().then(...)`. `ActiveSymbols.retrieveActiveSymbols()`
 * awaits `TradingTimes.initialise()` first, which awaits a `trading_times` socket
 * request; if that request never settles (WebSocket blocked by an extension,
 * proxy or network policy, or the socket never opens at all) the app sits on the
 * loading screen forever with no error and no retry.
 *
 * These helpers give the startup a hard deadline, a descriptive error, and a
 * reconnect attempt so the failure is visible and recoverable.
 */

/** Human readable, localized-at-call-site description of the startup failure. */
export type ApiInitFailure = {
    /** Short headline, e.g. "Unable to connect to Deriv". */
    title: string;
    /** Explanation that names the likely cause and what to do. */
    detail: string;
    /** Machine readable code, useful in logs and tests. */
    code: 'socket_timeout' | 'symbols_timeout' | 'symbols_error';
};

export const API_INIT_TIMEOUT_MS = 30_000;
/** How long to wait for the socket to reach OPEN before showing an error. */
export const SOCKET_OPEN_TIMEOUT_MS = 20_000;
/** Grace period for symbol loading on top of the socket-open deadline. */
export const SYMBOLS_LOAD_TIMEOUT_MS = 15_000;

/**
 * Waits for `promise` but rejects after `timeoutMs` with the supplied message.
 *
 * The timeout timer is always cleared, so a resolved promise does not leave a
 * dangling timer (which would keep Jest's fake timers or a test process busy).
 */
export const withTimeout = <T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string
): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
        promise.then(
            value => {
                clearTimeout(timer);
                resolve(value);
            },
            error => {
                clearTimeout(timer);
                reject(error);
            }
        );
    });

export const getSocketTimeoutFailure = (status: string): ApiInitFailure => ({
    code: 'socket_timeout',
    title: 'Unable to connect to Deriv',
    detail:
        `The Deriv connection did not open within ${Math.round(SOCKET_OPEN_TIMEOUT_MS / 1000)} seconds ` +
        `(status: ${status}). This is usually a blocked WebSocket — check any ad/tracker blocker, ` +
        'VPN or firewall for this site, then retry.',
});

export const getSymbolsTimeoutFailure = (): ApiInitFailure => ({
    code: 'symbols_timeout',
    title: 'Deriv is taking too long to respond',
    detail:
        `The market list did not load within ${Math.round(SYMBOLS_LOAD_TIMEOUT_MS / 1000)} seconds after ` +
        'connecting. Deriv may be temporarily slow; retry in a moment.',
});

export const getSymbolsErrorFailure = (error?: unknown): ApiInitFailure => ({
    code: 'symbols_error',
    title: 'Could not load Deriv markets',
    detail:
        (error instanceof Error && error.message
            ? `${error.message}. `
            : 'The market list request failed. ') +
        'Retry — if it keeps failing, Deriv may be temporarily unavailable in your region.',
});
