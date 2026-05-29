import { LocalStorageConstants, LocalStorageUtils } from '@deriv-com/utils';
import { isStaging } from '../url/helpers';

export const APP_IDS = {
    LOCALHOST: 127021,
    TMP_STAGING: 64584,
    STAGING: 29934,
    STAGING_BE: 29934,
    STAGING_ME: 29934,
    PRODUCTION: 65555,
    PRODUCTION_BE: 65556,
    PRODUCTION_ME: 65557,
};

/** TradePulse fixed Deriv app id for all non-Deriv hosts in this project. */
export const PROJECT_APP_ID = APP_IDS.LOCALHOST;

export const livechat_license_id = 12049137;
export const livechat_client_id = '66aa088aad5a414484c1fd1fa8a5ace7';

export const domain_app_ids = {
    'master.bot-standalone.pages.dev': APP_IDS.TMP_STAGING,
    'staging-dbot.deriv.com': APP_IDS.STAGING,
    'staging-dbot.deriv.be': APP_IDS.STAGING_BE,
    'staging-dbot.deriv.me': APP_IDS.STAGING_ME,
    'dbot.deriv.com': APP_IDS.PRODUCTION,
    'dbot.deriv.be': APP_IDS.PRODUCTION_BE,
    'dbot.deriv.me': APP_IDS.PRODUCTION_ME,
    'tradepulse.sytes.net': APP_IDS.LOCALHOST,
};

export const getCurrentProductionDomain = () =>
    !/^staging\./.test(window.location.hostname) &&
    Object.keys(domain_app_ids).find(domain => window.location.hostname === domain);

export const isProduction = () => {
    const all_domains = Object.keys(domain_app_ids).map(domain => `(www\\.)?${domain.replace('.', '\\.')}`);
    return new RegExp(`^(${all_domains.join('|')})$`, 'i').test(window.location.hostname);
};

export const isNgrokHost = () =>
    /\.ngrok-free\.app$/i.test(window.location.hostname) ||
    /\.ngrok\.io$/i.test(window.location.hostname) ||
    /\.ngrok\.app$/i.test(window.location.hostname);

export const isTestLink = () => {
    return (
        window.location.origin?.includes('.binary.sx') ||
        window.location.origin?.includes('bot-65f.pages.dev') ||
        isLocal() ||
        isNgrokHost()
    );
};

export const isLocal = () =>
    /^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.hostname) || window.location.hostname === '0.0.0.0';

/** True when running on dbot.deriv.com (or .me / .be) production/staging hosts. */
export const isDbotProductionHost = () => Boolean(getCurrentProductionDomain());

export const isSytesHost = () => /\.sytes\.net$/i.test(window.location.hostname);

/** Dev / tunnel / TradePulse hosts that use app_id 127021 and oauth.deriv.com (not home.deriv.com). */
export const isCustomOAuthHost = () => isTestLink() || isNgrokHost() || isSytesHost();

/**
 * TradePulse OAuth mode: every host except official dbot.deriv.com staging/production domains.
 * Covers localhost, ngrok, sytes, Vercel, GitHub Pages, LAN IPs, etc.
 */
export const shouldUseProjectOAuth = () => !getCurrentProductionDomain();

/** Ensure TradePulse app id and disable TMB/OIDC overrides on white-label hosts. */
export const ensureCustomAppIdConfigured = () => {
    if (!shouldUseProjectOAuth()) return;

    localStorage.setItem('config.app_id', String(PROJECT_APP_ID));
    localStorage.setItem('is_tmb_enabled', 'false');
    window.is_tmb_enabled = false;

    // Stale OIDC redirect targets send users to app.deriv.com / home.deriv.com
    localStorage.removeItem('config.post_login_redirect_uri');
    localStorage.removeItem('config.post_logout_redirect_uri');
};

const getDefaultServerURL = () => {
    if (isTestLink()) {
        return 'ws.derivws.com';
    }

    let active_loginid_from_url;
    const search = window.location.search;
    if (search) {
        const params = new URLSearchParams(document.location.search.substring(1));
        active_loginid_from_url = params.get('acct1');
    }

    const loginid = window.localStorage.getItem('active_loginid') ?? active_loginid_from_url;
    const is_real = loginid && !/^(VRT|VRW)/.test(loginid);

    const server = is_real ? 'green' : 'blue';
    const server_url = `${server}.derivws.com`;

    return server_url;
};

export const getDefaultAppIdAndUrl = () => {
    const server_url = getDefaultServerURL();

    if (shouldUseProjectOAuth()) {
        return { app_id: PROJECT_APP_ID, server_url };
    }

    const current_domain = getCurrentProductionDomain() ?? '';
    const app_id = domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? APP_IDS.PRODUCTION;

    return { app_id, server_url };
};

export const getAppId = () => {
    const current_domain = getCurrentProductionDomain() ?? '';

    // Keep white-label app_id permanent on all non-dbot.deriv.com hosts.
    if (shouldUseProjectOAuth()) {
        return String(PROJECT_APP_ID);
    }

    if (isStaging()) {
        return String(APP_IDS.STAGING);
    }

    return String(domain_app_ids[current_domain as keyof typeof domain_app_ids] ?? APP_IDS.PRODUCTION);
};

export const getSocketURL = () => {
    const local_storage_server_url = window.localStorage.getItem('config.server_url');
    if (local_storage_server_url) return local_storage_server_url;

    const server_url = getDefaultServerURL();

    return server_url;
};

export const checkAndSetEndpointFromUrl = () => {
    if (isTestLink()) {
        const url_params = new URLSearchParams(location.search.slice(1));

        if (url_params.has('qa_server') && url_params.has('app_id')) {
            const qa_server = url_params.get('qa_server') || '';
            const app_id = url_params.get('app_id') || '';

            url_params.delete('qa_server');
            url_params.delete('app_id');

            if (/^(^(www\.)?qa[0-9]{1,4}\.deriv.dev|(.*)\.derivws\.com)$/.test(qa_server) && /^[0-9]+$/.test(app_id)) {
                localStorage.setItem('config.app_id', app_id);
                localStorage.setItem('config.server_url', qa_server.replace(/"/g, ''));
            }

            const params = url_params.toString();
            const hash = location.hash;

            location.href = `${location.protocol}//${location.hostname}${location.pathname}${
                params ? `?${params}` : ''
            }${hash || ''}`;

            return true;
        }
    }

    return false;
};

export const getDebugServiceWorker = () => {
    const debug_service_worker_flag = window.localStorage.getItem('debug_service_worker');
    if (debug_service_worker_flag) return !!parseInt(debug_service_worker_flag);

    return false;
};

/** Random OAuth state (base64url), e.g. qX4ckfTGCC-dn84FRNIOgj9Lcth3O-PZ */
export const generateOAuthState = (): string => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/**
 * Legacy Deriv OAuth authorize URL (oauth.deriv.com), e.g.:
 * https://oauth.deriv.com/oauth2/authorize?app_id=127021&brand=deriv&redirect=home&state=…
 */
export const generateOAuthURL = (language?: string) => {
    const hostname = window.location.hostname;
    const original_url = new URL('https://oauth.deriv.com/oauth2/authorize');

    // First priority: Check for configured server URLs (for QA/testing environments)
    const configured_server_url = (LocalStorageUtils.getValue(LocalStorageConstants.configServerURL) ||
        localStorage.getItem('config.server_url')) as string;

    const valid_server_urls = ['green.derivws.com', 'red.derivws.com', 'blue.derivws.com', 'canary.derivws.com'];

    if (
        configured_server_url &&
        (typeof configured_server_url === 'string'
            ? !valid_server_urls.includes(configured_server_url)
            : !valid_server_urls.includes(JSON.stringify(configured_server_url)))
    ) {
        original_url.hostname = configured_server_url;
    } else if (hostname.includes('.deriv.me')) {
        original_url.hostname = 'oauth.deriv.me';
    } else if (hostname.includes('.deriv.be')) {
        original_url.hostname = 'oauth.deriv.be';
    } else {
        const current_domain = getCurrentProductionDomain();
        if (current_domain) {
            const domain_suffix = current_domain.replace(/^[^.]+\./, '');
            original_url.hostname = `oauth.${domain_suffix}`;
        }
    }

    ensureCustomAppIdConfigured();

    const state = generateOAuthState();
    sessionStorage.setItem('oauth.state', state);
    original_url.searchParams.set('app_id', String(getAppId()));
    original_url.searchParams.set('brand', 'deriv');
    // Must match working Deriv OAuth URLs — `l=EN` alone routes to home.deriv.com/dashboard/login.
    original_url.searchParams.set('redirect', 'home');
    original_url.searchParams.set('state', state);
    if (language) {
        original_url.searchParams.set('l', language);
    }

    return original_url.toString();
};
