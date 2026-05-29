/**
 * Utility functions for authentication-related operations
 */
import Cookies from 'js-cookie';
import { ensureCustomAppIdConfigured, generateOAuthURL } from '@/components/shared/utils/config/config';

type TOidcAuthenticationOptions = {
    state?: Record<string, unknown>;
    login_code?: string;
};

const OAUTH_REDIRECT_IN_PROGRESS_KEY = 'oauth_redirect_in_progress';

export const getAuthCookieDomain = (): string => window.location.hostname.split('.').slice(-2).join('.');

export const setLoggedStateCookie = (is_logged_in: boolean): void => {
    Cookies.set('logged_state', is_logged_in ? 'true' : 'false', {
        domain: getAuthCookieDomain(),
        expires: 30,
        path: '/',
        secure: true,
    });
};

/** True when legacy tokens are present in localStorage. */
export const hasStoredAuthSession = (): boolean => {
    const auth_token = localStorage.getItem('authToken');
    if (!auth_token) return false;
    const accounts_list = JSON.parse(localStorage.getItem('accountsList') ?? '{}');
    return Object.keys(accounts_list).length > 0;
};

/** OIDC login options so the user returns to this app after /callback, not production dbot. */
export const getOidcAuthenticationOptions = (options: TOidcAuthenticationOptions = {}) => ({
    redirectCallbackUri: `${window.location.origin}/callback`,
    postLoginRedirectUri: window.location.href,
    postLogoutRedirectUri: window.location.origin,
    ...options,
});

/**
 * Legacy oauth.deriv.com authorize — returns acct1/token1 to this origin (not app.deriv.com).
 * OIDC is not used here because app_id 127021 is tied to app.deriv.com/callback in Hydra.
 */
export const redirectToDerivOAuthLogin = (): void => {
    ensureCustomAppIdConfigured();

    const return_url = window.location.href;
    sessionStorage.setItem('redirect_url', return_url);
    sessionStorage.setItem(OAUTH_REDIRECT_IN_PROGRESS_KEY, '1');

    // Stale values send users to app.deriv.com after /callback
    localStorage.removeItem('config.post_login_redirect_uri');
    localStorage.removeItem('config.post_logout_redirect_uri');

    window.location.replace(generateOAuthURL());
};

export const clearOAuthRedirectInProgress = (): void => {
    sessionStorage.removeItem(OAUTH_REDIRECT_IN_PROGRESS_KEY);
};

export const isOAuthRedirectInProgress = (): boolean => sessionStorage.getItem(OAUTH_REDIRECT_IN_PROGRESS_KEY) === '1';

/** Legacy OAuth redirect left only `state` in the URL (no acct/token) — session was not established. */
export const isOrphanOAuthStateRedirect = (): boolean => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('state')) return false;
    if (params.has('acct1') || params.has('token1')) return false;
    return true;
};

export const clearOrphanOAuthStateFromUrl = (): void => {
    if (!isOrphanOAuthStateRedirect()) return;
    setLoggedStateCookie(false);
    clearOAuthRedirectInProgress();
    const params = new URLSearchParams(window.location.search);
    params.delete('state');
    const query = params.toString();
    const clean_url = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', clean_url);
};

/**
 * Clears authentication data from local storage and reloads the page
 */
export const clearAuthData = (is_reload: boolean = true): void => {
    localStorage.removeItem('accountsList');
    localStorage.removeItem('clientAccounts');
    localStorage.removeItem('callback_token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('active_loginid');
    localStorage.removeItem('client.accounts');
    localStorage.removeItem('client.country');
    sessionStorage.removeItem('query_param_currency');
    clearOAuthRedirectInProgress();
    if (is_reload) {
        location.reload();
    }
};

/**
 * Handles OIDC authentication failure by clearing auth data and showing logged out view
 * @param error - The error that occurred during OIDC authentication
 */
export const handleOidcAuthFailure = (error: unknown): void => {
    console.error('OIDC authentication failed:', error);

    localStorage.removeItem('authToken');
    localStorage.removeItem('active_loginid');
    localStorage.removeItem('clientAccounts');
    localStorage.removeItem('accountsList');

    setLoggedStateCookie(false);
    clearOAuthRedirectInProgress();

    window.location.reload();
};
