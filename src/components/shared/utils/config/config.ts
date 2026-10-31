import {
    buildAuthorizationUrl,
    buildSignUpUrl,
    getAuthInfo,
    parseReferralLink,
    parseLandingParams,
    resolveReferralViaProxy,
} from '@/external/deriv-core';
import type { AuthConfig } from '@/external/deriv-core';
import { DERIV_CREATE_ACCOUNT_URL } from '@/constants/social-links';
import { DerivWSAccountsService } from '@/services/derivws-accounts.service';
import brandConfig from '../../../../../brand.config.json';

// =============================================================================
// Constants - Domain & Server Configuration (from brand.config.json)
// =============================================================================

// Production app domains
export const PRODUCTION_DOMAINS = {
    COM: brandConfig.platform.hostname.production.com,
} as const;

// Staging app domains
export const STAGING_DOMAINS = {
    COM: brandConfig.platform.hostname.staging.com,
} as const;

// WebSocket server URLs
export const WS_SERVERS = {
    STAGING: `${brandConfig.platform.derivws.url.staging}options/ws/public`,
    PRODUCTION: `${brandConfig.platform.derivws.url.production}options/ws/public`,
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

const sanitizeEnvValue = (value?: string): string => {
    if (!value) return '';
    const trimmed = value.trim();
    return trimmed === '🔒' ? '' : trimmed;
};

export const DERIV_V3_WS_ENDPOINTS = [
    'wss://ws.derivws.com/websockets/v3',
    'wss://ws.binaryws.com/websockets/v3',
    'wss://green.derivws.com/websockets/v3',
    'wss://blue.derivws.com/websockets/v3',
] as const;

// Helper to check if we're on production.
// NEXT_PUBLIC_DERIV_ENV is the authoritative signal (set at build/deploy time and
// also read by vendored deriv-core for OAuth). When unset, default to production
// unless the hostname explicitly indicates staging (matching deriv-core/config/urls.ts).
export const isProduction = () => {
    const env = sanitizeEnvValue(process.env.NEXT_PUBLIC_DERIV_ENV);
    if (env === 'production') return true;
    if (env === 'preview' || env === 'staging') return false;

    const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
    if (hostname && hostname.includes('staging')) return false;
    return true;
};

export const isLocal = () => /localhost(:\d+)?$/i.test(window.location.hostname);

export const getAppId = () => {
    return sanitizeEnvValue(process.env.NEXT_PUBLIC_DERIV_APP_ID);
};

/**
 * Returns a valid numeric app_id for Legacy Deriv V3 WebSocket endpoints (/websockets/v3).
 * NEXT_PUBLIC_DERIV_APP_ID may contain a V2 OAuth client_id string (e.g. UUID / app_...)
 * or be unset — /websockets/v3 rejects non-numeric app_ids during handshake, so fall back to 1089.
 */
export const getLegacyWsAppId = (): string => {
    const raw = getAppId();
    return raw && /^\d+$/.test(raw) ? raw : '1089';
};

export const getPreferredV3SocketURL = (): string => {
    const appId = getLegacyWsAppId();
    if (typeof window !== 'undefined') {
        const saved = window.localStorage.getItem('deriv_v3_ws_url');
        if (saved && saved.startsWith('wss://')) {
            try {
                const parsed = new URL(saved);
                if (!/^\d+$/.test(parsed.searchParams.get('app_id') || '')) {
                    parsed.searchParams.set('app_id', appId);
                }
                return parsed.toString();
            } catch {
                // ignore malformed URL and use default below
            }
        }
    }
    return `${DERIV_V3_WS_ENDPOINTS[0]}?app_id=${appId}`;
};

const getDefaultServerURL = () => {
    const isProductionEnv = isProduction();

    try {
        return isProductionEnv ? WS_SERVERS.PRODUCTION : WS_SERVERS.STAGING;
    } catch (error) {
        console.error('Error in getDefaultServerURL:', error);
    }

    return isProductionEnv ? WS_SERVERS.PRODUCTION : WS_SERVERS.STAGING;
};

/**
 * Gets the WebSocket URL using the authenticated flow:
 * 1. V2 OAuth / Bearer PAT: get access_token from auth_info -> fetch OTP WebSocket URL
 * 2. Legacy V3 API Token: connect to verified V3 WebSocket URL so api_base can authorize(token)
 * 3. Unauthenticated fallback: public V2 WebSocket URL
 */
export const getSocketURL = async (): Promise<string> => {
    try {
        const authInfo = getAuthInfo();
        if (authInfo && authInfo.access_token) {
            const wsUrl = await DerivWSAccountsService.getAuthenticatedWebSocketURL(authInfo.access_token);
            return wsUrl;
        }

        if (typeof window !== 'undefined') {
            const patMode = window.localStorage.getItem('deriv_pat_mode');
            const v3Token = window.localStorage.getItem('deriv_api_token') || window.localStorage.getItem('authToken');
            if (patMode === 'v3' && v3Token) {
                return getPreferredV3SocketURL();
            }
        }

        return getDefaultServerURL();
    } catch (error) {
        console.error('[DerivWS] Error in getSocketURL:', error);
        if (typeof window !== 'undefined') {
            const patMode = window.localStorage.getItem('deriv_pat_mode');
            const v3Token = window.localStorage.getItem('deriv_api_token') || window.localStorage.getItem('authToken');
            if (patMode === 'v3' && v3Token) {
                return getPreferredV3SocketURL();
            }
        }
        return getDefaultServerURL();
    }
};

export const getDebugServiceWorker = () => {
    const debug_service_worker_flag = window.localStorage.getItem('debug_service_worker');
    if (debug_service_worker_flag) return !!parseInt(debug_service_worker_flag);

    return false;
};

const REFERRAL_CACHE_KEY = 'resolved_referral_cache';

interface ResolvedReferral {
    affiliateToken: string;
    affiliateTokenParam: 't' | 'affiliate_token' | 'sidi' | 'ca';
    utmCampaign: string;
    utmSource?: string;
    utmMedium?: string;
}

/**
 * Read the cached Scaleo referral resolution. The per-click token is minted by
 * Scaleo's 302 redirect and resolved via the BFF proxy; once resolved it is
 * cached so repeat login/sign-up clicks never block on the proxy again.
 */
const getCachedReferral = (): ResolvedReferral | null => {
    try {
        const raw = window.localStorage.getItem(REFERRAL_CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as ResolvedReferral;
    } catch {
        return null;
    }
};

const cacheReferral = (referral: ResolvedReferral): void => {
    try {
        window.localStorage.setItem(REFERRAL_CACHE_KEY, JSON.stringify(referral));
    } catch {
        // Non-fatal: caching is an optimization, ignore storage failures
    }
};

/**
 * Generates the OAuth login or sign-up URL using vendored deriv-core
 *
 * @param prompt - Optional prompt parameter ('registration' for sign-up flow)
 * @returns Promise with the OAuth URL string
 */
export const generateOAuthURL = async (prompt?: string): Promise<string> => {
    try {
        if (prompt === 'registration') {
            return DERIV_CREATE_ACCOUNT_URL;
        }
        const redirectUri = sanitizeEnvValue(process.env.NEXT_PUBLIC_DERIV_REDIRECT_URI) || window.location.origin;
        const clientId = getAppId();
        if (!clientId) return '';

        const config: AuthConfig = {
            clientId,
            redirectUri,
            scopes: 'trade',
        };

        // Static referral link (fallback for direct visits without affiliate click)
        const referralLink = sanitizeEnvValue(process.env.NEXT_PUBLIC_DERIV_REFERRAL_LINK) || DERIV_CREATE_ACCOUNT_URL;
        if (referralLink) {
            const referral = parseReferralLink(referralLink);
            if (referral) {
                config.affiliateToken = referral.affiliateToken;
                config.affiliateTokenParam = referral.affiliateTokenParam;
                config.utmCampaign = referral.utmCampaign;
                if (referral.utmSource) config.utmSource = referral.utmSource;
                if (referral.utmMedium) config.utmMedium = referral.utmMedium;
            }
        }

        // Override with live per-click params from landing URL (e.g. Scaleo t= token)
        const landing = parseLandingParams();
        if (landing) {
            // Only override the token when the landing URL actually carries one
            // (t=). parseLandingParams returns non-null for any utm_* param, so an
            // unguarded write would clobber a valid env token with '' on generic
            // marketing links (e.g. ?utm_source=google with no t=).
            if (landing.affiliateToken) {
                config.affiliateToken = landing.affiliateToken;
                config.affiliateTokenParam = landing.affiliateTokenParam;
            }
            if (landing.utmSource) config.utmSource = landing.utmSource;
            if (landing.utmMedium) config.utmMedium = landing.utmMedium;
            if (landing.utmCampaign) config.utmCampaign = landing.utmCampaign;
        }

        // If we still have no token and the referral link is a Scaleo click link,
        // resolve a fresh per-user token via the BFF proxy. Cache the result so
        // repeat login/sign-up clicks don't block on the proxy every time.
        if (!config.affiliateToken && referralLink) {
            const resolved = getCachedReferral() ?? (await resolveReferralViaProxy(referralLink));
            if (resolved) {
                cacheReferral(resolved);
                config.affiliateToken = resolved.affiliateToken;
                config.affiliateTokenParam = resolved.affiliateTokenParam;
                if (resolved.utmSource) config.utmSource = resolved.utmSource;
                if (resolved.utmMedium) config.utmMedium = resolved.utmMedium;
                if (resolved.utmCampaign) config.utmCampaign = resolved.utmCampaign;
            }
        }

        if (prompt === 'registration') {
            return await buildSignUpUrl(config);
        }
        return await buildAuthorizationUrl(config);
    } catch (error) {
        console.error('Error generating OAuth URL:', error);
        return '';
    }
};
