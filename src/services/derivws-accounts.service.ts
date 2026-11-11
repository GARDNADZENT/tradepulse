import { getAppId, isProduction } from '@/components/shared';
import brandConfig from '../../brand.config.json';

/**
 * Account information from derivatives/accounts endpoint
 */
export interface DerivAccount {
    account_id: string;
    balance: string;
    currency: string;
    group: string;
    status: string;
    account_type: 'demo' | 'real';
}

/**
 * Response from derivatives/accounts endpoint
 */
interface AccountsResponse {
    data: DerivAccount[];
}

/**
 * OTP response data (nested JSON string)
 */
interface OTPResponseData {
    url: string;
}

/**
 * Response from options/accounts/{accountId}/otp endpoint
 */
interface OTPResponse {
    data: OTPResponseData;
    // JSON string containing OTPResponseData
}

/**
 * Service for handling DerivWS account operations and WebSocket URL retrieval
 *
 * This service manages:
 * - Fetching account list from derivatives/accounts endpoint
 * - Storing accounts in sessionStorage
 * - Fetching OTP and WebSocket URL for specific accounts
 * - Managing default account selection
 * - Singleton pattern to prevent duplicate API calls
 * - Promise caching to handle concurrent requests
 */
export class DerivWSAccountsService {
    // Singleton instance for promise caching
    private static accountsFetchPromise: Promise<DerivAccount[]> | null = null;
    private static otpFetchPromises: Map<string, Promise<string>> = new Map();

    /**
     * Gets the DerivWS base URL based on environment
     * @returns DerivWS base URL (e.g., "https://api.derivws.com/trading/v1/")
     */
    private static getDerivWSBaseURL(): string {
        const environment = isProduction() ? 'production' : 'staging';
        return brandConfig.platform.derivws.url[environment];
    }

    /**
     * Clears all cached promises (useful for testing or forced refresh)
     */
    static clearCache(): void {
        this.accountsFetchPromise = null;
        this.otpFetchPromises.clear();
    }

    /**
     * Stores accounts list in sessionStorage and localStorage for cross-reload/tab parity
     * @param accounts Array of DerivAccount objects
     */
    static storeAccounts(accounts: DerivAccount[]): void {
        const serialized = JSON.stringify(accounts);
        sessionStorage.setItem('deriv_accounts', serialized);
        localStorage.setItem('deriv_accounts', serialized);
    }

    /**
     * Retrieves accounts list from sessionStorage (falling back to localStorage)
     * @returns Array of DerivAccount objects or null if not found
     */
    static getStoredAccounts(): DerivAccount[] | null {
        try {
            const accountsStr =
                sessionStorage.getItem('deriv_accounts') || localStorage.getItem('deriv_accounts');
            if (!accountsStr) {
                return null;
            }
            const parsed = JSON.parse(accountsStr) as DerivAccount[];
            if (!sessionStorage.getItem('deriv_accounts') && Array.isArray(parsed) && parsed.length > 0) {
                sessionStorage.setItem('deriv_accounts', accountsStr);
            }
            return parsed;
        } catch (error) {
            console.error('[DerivWS] Error parsing stored accounts:', error);
            return null;
        }
    }

    /**
     * Gets the default account (first account from the list)
     * @returns DerivAccount object or null if no accounts available
     */
    static getDefaultAccount(): DerivAccount | null {
        const accounts = this.getStoredAccounts();
        if (!accounts || accounts.length === 0) {
            return null;
        }
        return accounts[0];
    }

    /**
     * Clears stored accounts from sessionStorage and localStorage
     */
    static clearStoredAccounts(): void {
        sessionStorage.removeItem('deriv_accounts');
        localStorage.removeItem('deriv_accounts');
    }

    /**
     * Executes a DerivWS REST call with automatic Deriv-App-ID header negotiation
     * so both user-scoped Personal Access Tokens (pat_...) and app-scoped OAuth tokens succeed.
     */
    private static async fetchWithAppIdFallback(
        endpoint: string,
        method: 'GET' | 'POST',
        accessToken: string
    ): Promise<Response> {
        const appId = getAppId();
        const isPatToken = accessToken.startsWith('pat_');
        const primaryIncludeAppId = Boolean(appId && !isPatToken);

        const buildHeaders = (includeAppId: boolean): Record<string, string> => {
            const headers: Record<string, string> = {
                Authorization: `Bearer ${accessToken}`,
                Accept: 'application/json',
            };
            if (includeAppId && appId) {
                headers['Deriv-App-ID'] = appId;
            }
            return headers;
        };

        const response = await fetch(endpoint, {
            method,
            headers: buildHeaders(primaryIncludeAppId),
        });

        if (!response.ok && appId) {
            const retryResponse = await fetch(endpoint, {
                method,
                headers: buildHeaders(!primaryIncludeAppId),
            });
            if (retryResponse.ok) {
                return retryResponse;
            }
        }

        return response;
    }

    /**
     * Fetches accounts list from derivatives/accounts endpoint with singleton pattern
     * Prevents duplicate API calls by caching the promise
     * @param accessToken Bearer token from OAuth or PAT authentication
     * @returns Promise with array of DerivAccount objects
     */
    static async fetchAccountsList(accessToken: string): Promise<DerivAccount[]> {
        // If there's already a fetch in progress, return that promise
        if (this.accountsFetchPromise) {
            return this.accountsFetchPromise;
        }

        // Create new fetch promise and cache it
        this.accountsFetchPromise = (async () => {
            try {
                const baseURL = this.getDerivWSBaseURL();
                const OptionsDir = brandConfig.platform.derivws.directories.options;
                const endpoint = `${baseURL}${OptionsDir}accounts`;

                const response = await this.fetchWithAppIdFallback(endpoint, 'GET', accessToken);

                if (!response.ok) {
                    throw new Error(`Failed to fetch accounts: ${response.status} ${response.statusText}`);
                }

                const data: AccountsResponse = await response.json();

                // Extract accounts array from nested data structure
                const accounts = data?.data || [];

                if (accounts.length === 0) {
                    console.warn('[DerivWS] No accounts found in response');
                }

                // Store accounts in sessionStorage/localStorage for future use
                this.storeAccounts(accounts);

                return accounts;
            } catch (error) {
                console.error('[DerivWS] Error fetching accounts:', error);
                // Clear the cached promise on error so retry is possible
                this.accountsFetchPromise = null;
                throw error;
            } finally {
                // Clear the promise after completion (success or failure)
                // This allows fresh fetches on subsequent calls
                setTimeout(() => {
                    this.accountsFetchPromise = null;
                }, 100);
            }
        })();

        return this.accountsFetchPromise;
    }

    /**
     * Fetches OTP and WebSocket URL for a specific account with singleton pattern
     * Prevents duplicate OTP calls for the same account by caching the promise
     * @param accessToken Bearer token from OAuth or PAT authentication
     * @param accountId Account ID to get OTP for
     * @returns Promise with WebSocket URL
     */
    static async fetchOTPWebSocketURL(accessToken: string, accountId: string): Promise<string> {
        // Create a unique key for this account's OTP request
        const cacheKey = `${accountId}`;

        // If there's already a fetch in progress for this account, return that promise
        if (this.otpFetchPromises.has(cacheKey)) {
            return this.otpFetchPromises.get(cacheKey)!;
        }

        // Create new fetch promise and cache it
        const otpPromise = (async () => {
            try {
                const baseURL = this.getDerivWSBaseURL();
                const optionsDir = brandConfig.platform.derivws.directories.options;
                const endpoint = `${baseURL}${optionsDir}accounts/${accountId}/otp`;

                const response = await this.fetchWithAppIdFallback(endpoint, 'POST', accessToken);

                if (!response.ok) {
                    throw new Error(`Failed to fetch OTP: ${response.status} ${response.statusText}`);
                }

                const otpResponse: OTPResponse & { url?: string } = await response.json();
                const parsedData =
                    typeof otpResponse?.data === 'string'
                        ? (JSON.parse(otpResponse.data) as OTPResponseData)
                        : otpResponse?.data;
                const websocketURL = parsedData?.url || otpResponse?.url;

                if (!websocketURL) {
                    throw new Error('WebSocket URL not found in OTP response');
                }
                return websocketURL;
            } catch (error) {
                console.error('[DerivWS] Error fetching OTP:', error);
                // Clear the cached promise on error so retry is possible
                this.otpFetchPromises.delete(cacheKey);
                throw error;
            } finally {
                // Clear the promise after completion (success or failure)
                // This allows fresh OTP fetches on subsequent calls
                setTimeout(() => {
                    this.otpFetchPromises.delete(cacheKey);
                }, 100);
            }
        })();

        this.otpFetchPromises.set(cacheKey, otpPromise);
        return otpPromise;
    }

    /**
     * Resets a demo account's balance to the default amount via the REST endpoint
     * POST /trading/v1/options/accounts/{account_id}/reset-demo-balance
     *
     * Unlike topup_virtual (which only tops up to the current virtual credit limit),
     * this endpoint performs a true reset to the default $10,000 demo balance.
     *
     * @param accessToken Bearer token from OAuth authentication (scope: trade)
     * @param accountId Account ID to reset (must be a demo account)
     * @throws Error with status code if the reset fails (e.g. 400 = not a demo account)
     */
    static async resetDemoBalance(accessToken: string, accountId: string): Promise<void> {
        const baseURL = this.getDerivWSBaseURL();
        const optionsDir = brandConfig.platform.derivws.directories.options;
        const endpoint = `${baseURL}${optionsDir}accounts/${accountId}/reset-demo-balance`;

        const headers: Record<string, string> = {
            Authorization: `Bearer ${accessToken}`,
        };
        const appId = getAppId();
        if (appId) headers['Deriv-App-ID'] = appId;

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
        });

        // 200 OK - Demo balance successfully reset to default amount (no body).
        // 400 Bad request - Invalid account ID or not a demo account.
        if (!response.ok) {
            throw new Error(`Failed to reset demo balance: ${response.status} ${response.statusText}`);
        }
    }

    /**
     * Complete flow to get authenticated WebSocket URL with optimized caching
     * 1. Check if accounts are already in sessionStorage (skip fetch on refresh)
     * 2. If not in storage, fetch accounts list
     * 3. Store accounts in sessionStorage
     * 4. Get default account (first from list)
     * 5. Fetch OTP and WebSocket URL for that account (always fresh OTP)
     *
     * @param accessToken Bearer token from OAuth authentication
     * @returns Promise with WebSocket URL
     */
    static async getAuthenticatedWebSocketURL(accessToken: string): Promise<string> {
        try {
            let accounts: DerivAccount[] | null = null;

            // Step 1: Check if accounts are already stored (optimization for refresh)
            const storedAccounts = this.getStoredAccounts();
            if (storedAccounts && storedAccounts.length > 0) {
                accounts = storedAccounts;
            } else {
                // Step 2: Fetch accounts list if not in storage
                accounts = await this.fetchAccountsList(accessToken);

                if (!accounts || accounts.length === 0) {
                    throw new Error('No accounts available');
                }
            }

            // Step 3: Resolve which account to connect as.
            // On an account switch the caller has already written the new loginid to
            // localStorage before triggering a WebSocket regeneration, so we honour
            // that selection here instead of always falling back to accounts[0].
            const activeLoginId = localStorage.getItem('active_loginid');
            const targetAccount =
                (activeLoginId && accounts.find(a => a.account_id === activeLoginId)) || accounts[0];

            // Step 4: Fetch OTP and WebSocket URL for the resolved account (always fresh OTP)
            const websocketURL = await this.fetchOTPWebSocketURL(accessToken, targetAccount.account_id);
            return websocketURL;
        } catch (error) {
            console.error('[DerivWS] Error in authenticated WebSocket URL flow:', error);
            throw error;
        }
    }
}
