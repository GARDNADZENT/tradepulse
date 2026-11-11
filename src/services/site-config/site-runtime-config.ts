import { TAB_IDS } from '@/constants/bot-contents';
import {
    DERIV_CREATE_ACCOUNT_URL,
    SOCIAL_LINKS,
    TSocialAccountConfig,
    TSocialPlatformId,
} from '@/constants/social-links';
import { supabase } from '@/services/supabase/client';
import { applyPrimaryColor } from '@/utils/apply-branding';
import { getTradersPulseLogoSrc } from '@/utils/branding';
import { setFaviconHref } from '@/utils/document-branding';
import { setPreviewAppName, setPreviewLogo } from '@/utils/live-branding-store';
import { installTenantCommissionTracker } from './site-commission-tracker';

export interface TenantCustomBot {
    id: string;
    name: string;
    strategy: string;
    description: string;
    categories: Array<'special' | 'virtual-hook' | 'turbo-ai'>;
    xml_content: string;
    sort_order: number;
    is_active: boolean;
}

export interface TenantSiteConfig {
    id: string;
    owner_id?: string;
    slug: string;
    vercel_domain?: string;
    custom_domain: string;
    domain_status: 'live' | 'verify_dns' | 'ssl_pending';
    status: 'active' | 'maintenance' | 'suspended';
    brand_name: string;
    tagline: string;
    logo_url: string;
    primary_color: string;
    secondary_color: string;
    deriv_app_id: string;
    use_pooled_oauth: boolean;
    pooled_deriv_app_id?: string;
    oauth_callback_hub_url?: string;
    deriv_referral_link: string;
    announcement_text: string;
    enabled_tabs: string[];
    social_links: Partial<Record<TSocialPlatformId, string>>;
    include_default_bots: boolean;
    commission_share_pct?: number;
    custom_bots: TenantCustomBot[];
}

const TENANT_CACHE_PREFIX = 'tp_tenant_runtime_cache_v1:';
const STICKY_SITE_SLUG_KEY = 'tp_active_tenant_slug';

const MASTER_UNTENANTED_HOSTS = new Set([
    'localhost',
    '127.0.0.1',
    'tradepulse-lovat.vercel.app',
    'tradepulse-tracker2.vercel.app',
]);

type Listener = (config: TenantSiteConfig | null) => void;

let activeTenantConfig: TenantSiteConfig | null = null;
const listeners = new Set<Listener>();

const notifyListeners = () => {
    listeners.forEach(fn => fn(activeTenantConfig));
};

const getRegisteredCallbackHostname = (): string => {
    const raw = (process.env.NEXT_PUBLIC_DERIV_REDIRECT_URI || '').trim();
    if (!raw || raw === '🔒') return '';
    try {
        return new URL(raw).hostname.toLowerCase();
    } catch {
        return '';
    }
};

export function isMasterUntenantedHost(hostname: string): boolean {
    const lower = (hostname || '').trim().toLowerCase();
    if (!lower) return true;
    if (MASTER_UNTENANTED_HOSTS.has(lower)) return true;
    if (lower.endsWith('.e2b.app')) return true;
    if (lower.endsWith('.vercel.app') && lower.includes('-git-')) return true;

    const registeredHost = getRegisteredCallbackHostname();
    if (registeredHost && lower === registeredHost) return true;

    return false;
}

export function getActiveTenantConfig(): TenantSiteConfig | null {
    return activeTenantConfig;
}

export function subscribeActiveTenantConfig(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getTenantBrandName(): string {
    return activeTenantConfig?.brand_name?.trim() || 'TradersPulse';
}

export function getTenantTagline(): string {
    return activeTenantConfig?.tagline?.trim() || 'SMART DERIV TOOLS';
}

export function getTenantLogoSrc(): string {
    return activeTenantConfig?.logo_url?.trim() || getTradersPulseLogoSrc();
}

export function getTenantDerivAppId(): string {
    if (!activeTenantConfig) return '';
    // Only use an explicit custom deriv_app_id when use_pooled_oauth is explicitly false;
    // otherwise all sites share the main TradersPulse Deriv App ID for unified commission tracking.
    if (!activeTenantConfig.use_pooled_oauth && activeTenantConfig.deriv_app_id?.trim()) {
        return activeTenantConfig.deriv_app_id.trim();
    }
    if (activeTenantConfig.pooled_deriv_app_id?.trim()) {
        return activeTenantConfig.pooled_deriv_app_id.trim();
    }
    return '';
}

export function getTenantReferralLink(): string {
    return activeTenantConfig?.deriv_referral_link?.trim() || DERIV_CREATE_ACCOUNT_URL;
}

export function getTenantSocialLinks(): TSocialAccountConfig[] {
    if (!activeTenantConfig?.social_links) return SOCIAL_LINKS;
    const overrides = activeTenantConfig.social_links;
    const hasAnyOverride = Object.values(overrides).some(v => typeof v === 'string' && v.trim() !== '');
    if (!hasAnyOverride) return SOCIAL_LINKS;

    return SOCIAL_LINKS.map(item => ({
        ...item,
        url:
            typeof overrides[item.id] === 'string'
                ? (overrides[item.id] || '').trim()
                : item.url,
    }));
}

export function applyTenantDomEffects(config: TenantSiteConfig | null): void {
    if (typeof document === 'undefined') return;

    const existingStyle = document.getElementById('tp-tenant-tabs-css');

    if (!config) {
        if (existingStyle) existingStyle.remove();
        return;
    }

    if (config.primary_color) {
        applyPrimaryColor(config.primary_color);
    }
    if (config.secondary_color) {
        document.documentElement.style.setProperty('--tp-tenant-bg', config.secondary_color);
    }

    const resolvedName = config.brand_name?.trim() || 'TradersPulse';
    setPreviewAppName(resolvedName);
    document.title = resolvedName;

    const resolvedLogo = config.logo_url?.trim() || getTradersPulseLogoSrc();
    setPreviewLogo(resolvedLogo);
    setFaviconHref(resolvedLogo);

    const enabledSet = new Set(
        Array.isArray(config.enabled_tabs) && config.enabled_tabs.length > 0
            ? config.enabled_tabs
            : TAB_IDS
    );
    const hiddenTabIds = TAB_IDS.filter(id => !enabledSet.has(id));

    if (hiddenTabIds.length === 0) {
        if (existingStyle) existingStyle.remove();
    } else {
        const styleEl = existingStyle || document.createElement('style');
        styleEl.id = 'tp-tenant-tabs-css';
        const selectors = hiddenTabIds.map(id => `#${id}`).join(', ');
        styleEl.textContent = `${selectors} { display: none !important; }`;
        if (!existingStyle) {
            document.head.appendChild(styleEl);
        }
    }
}

export function setActiveTenantConfig(config: TenantSiteConfig | null): void {
    activeTenantConfig = config;
    applyTenantDomEffects(config);
    notifyListeners();
}

const resolveRequestedTenantKey = (): { slug: string | null; hostname: string } => {
    if (typeof window === 'undefined') return { slug: null, hostname: '' };
    const params = new URLSearchParams(window.location.search);
    const paramSlug = params.get('site')?.trim().toLowerCase() || null;
    if (paramSlug) {
        try {
            sessionStorage.setItem(STICKY_SITE_SLUG_KEY, paramSlug);
        } catch {}
        return { slug: paramSlug, hostname: window.location.hostname.toLowerCase() };
    }

    let stickySlug: string | null = null;
    try {
        stickySlug = sessionStorage.getItem(STICKY_SITE_SLUG_KEY);
    } catch {}

    return {
        slug: stickySlug,
        hostname: window.location.hostname.toLowerCase(),
    };
};

async function fetchSupabaseTenantSite(
    slug: string | null,
    hostname: string
): Promise<TenantSiteConfig | null> {
    if (!supabase) return null;

    const isMasterHost = isMasterUntenantedHost(hostname);
    if (!slug && isMasterHost) {
        return null;
    }

    try {
        const client: any = supabase;
        let siteRow: any = null;

        if (slug) {
            const { data } = await client
                .from('managed_sites')
                .select('*')
                .eq('slug', slug)
                .maybeSingle();
            siteRow = data;
        }

        if (!siteRow && hostname && !isMasterHost) {
            const cleanHost = hostname.replace(/^www\./, '');

            if (cleanHost.endsWith('.vercel.app')) {
                const { data: byVercelDom } = await client
                    .from('managed_sites')
                    .select('*')
                    .eq('vercel_domain', cleanHost)
                    .maybeSingle();
                siteRow = byVercelDom;

                if (!siteRow) {
                    const vercelSlug = cleanHost.replace(/\.vercel\.app$/i, '');
                    const { data: bySlug } = await client
                        .from('managed_sites')
                        .select('*')
                        .eq('slug', vercelSlug)
                        .maybeSingle();
                    siteRow = bySlug;
                }
            } else {
                const { data: byCustomDom } = await client
                    .from('managed_sites')
                    .select('*')
                    .in('custom_domain', [hostname, cleanHost])
                    .maybeSingle();
                siteRow = byCustomDom;

                if (!siteRow && cleanHost.split('.').length >= 3) {
                    const sub = cleanHost.split('.')[0];
                    const { data: bySub } = await client
                        .from('managed_sites')
                        .select('*')
                        .eq('slug', sub)
                        .maybeSingle();
                    siteRow = bySub;
                }
            }
        }

        if (!siteRow) return null;

        const [{ data: botRows }, { data: platformRow }] = await Promise.all([
            client
                .from('managed_site_bots')
                .select('*')
                .eq('site_id', siteRow.id)
                .eq('is_active', true)
                .order('sort_order', { ascending: true }),
            client.from('studio_platform_settings').select('*').eq('id', 1).maybeSingle(),
        ]);

        const config: TenantSiteConfig = {
            id: String(siteRow.id),
            owner_id: String(siteRow.owner_id || ''),
            slug: String(siteRow.slug),
            vercel_domain: String(siteRow.vercel_domain || `${siteRow.slug}.vercel.app`),
            custom_domain: String(siteRow.custom_domain || ''),
            domain_status: siteRow.domain_status || 'live',
            status: siteRow.status || 'active',
            brand_name: String(siteRow.brand_name || 'TradersPulse'),
            tagline: String(siteRow.tagline || 'SMART DERIV TOOLS'),
            logo_url: String(siteRow.logo_url || ''),
            primary_color: String(siteRow.primary_color || '#0066FF'),
            secondary_color: String(siteRow.secondary_color || '#050914'),
            deriv_app_id: String(siteRow.deriv_app_id || ''),
            use_pooled_oauth: siteRow.use_pooled_oauth !== false,
            pooled_deriv_app_id: String(platformRow?.pooled_deriv_app_id || ''),
            oauth_callback_hub_url: String(platformRow?.oauth_callback_hub_url || ''),
            deriv_referral_link: String(siteRow.deriv_referral_link || ''),
            announcement_text: String(siteRow.announcement_text || ''),
            enabled_tabs: Array.isArray(siteRow.enabled_tabs) ? siteRow.enabled_tabs : TAB_IDS,
            social_links: (siteRow.social_links as Record<string, string>) || {},
            include_default_bots: siteRow.include_default_bots !== false,
            commission_share_pct: Number(siteRow.commission_share_pct ?? 50),
            custom_bots: Array.isArray(botRows)
                ? botRows.map((b: any) => ({
                      id: String(b.id),
                      name: String(b.name),
                      strategy: String(b.strategy || 'Custom Strategy'),
                      description: String(b.description || ''),
                      categories: Array.isArray(b.categories) ? b.categories : ['special'],
                      xml_content: String(b.xml_content || ''),
                      sort_order: Number(b.sort_order || 1),
                      is_active: b.is_active !== false,
                  }))
                : [],
        };

        try {
            localStorage.setItem(
                `${TENANT_CACHE_PREFIX}${slug || hostname}`,
                JSON.stringify(config)
            );
        } catch {}

        return config;
    } catch {
        return null;
    }
}

/**
 * Validates that a Central OAuth Callback Relay `return_to` origin belongs to an
 * active site registered in `public.managed_sites`. Prevents open-redirect abuse.
 */
export async function verifyAuthorizedRelayReturnOrigin(returnTo: string): Promise<string | null> {
    if (!returnTo || !supabase) return null;

    let parsed: URL;
    try {
        parsed = new URL(returnTo);
    } catch {
        return null;
    }

    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
        return null;
    }

    const host = parsed.hostname.toLowerCase();
    const cleanHost = host.replace(/^www\./, '');

    try {
        const client: any = supabase;

        if (cleanHost.endsWith('.vercel.app')) {
            const vercelSlug = cleanHost.replace(/\.vercel\.app$/i, '');
            const { data } = await client
                .from('managed_sites')
                .select('id, status')
                .or(`vercel_domain.eq.${cleanHost},slug.eq.${vercelSlug}`)
                .eq('status', 'active')
                .limit(1)
                .maybeSingle();
            return data?.id ? parsed.origin : null;
        }

        const { data } = await client
            .from('managed_sites')
            .select('id, status')
            .in('custom_domain', [host, cleanHost])
            .eq('status', 'active')
            .limit(1)
            .maybeSingle();

        return data?.id ? parsed.origin : null;
    } catch {
        return null;
    }
}

export async function initializeTenantRuntime(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
        localStorage.removeItem('tp_studio_published_sites_v1');
    } catch {}

    // Install passive real-account commission observer for tenant sites
    installTenantCommissionTracker();

    // 1. Live Studio iframe preview listener (`postMessage`)
    window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data;
        if (data && typeof data === 'object' && data.type === 'TP_STUDIO_PREVIEW_SYNC') {
            if (data.site && typeof data.site === 'object') {
                setActiveTenantConfig(data.site as TenantSiteConfig);
            }
        }
    });

    if (window.parent && window.parent !== window) {
        try {
            window.parent.postMessage({ type: 'TP_TENANT_READY' }, '*');
        } catch {}
    }

    const { slug, hostname } = resolveRequestedTenantKey();

    // 2. Instant zero-flicker hydration from cached Supabase config
    if (slug || !isMasterUntenantedHost(hostname)) {
        try {
            const cachedRaw = localStorage.getItem(`${TENANT_CACHE_PREFIX}${slug || hostname}`);
            if (cachedRaw) {
                setActiveTenantConfig(JSON.parse(cachedRaw) as TenantSiteConfig);
            }
        } catch {}
    }

    // 3. Authoritative background refresh from Supabase multi-tenant tables
    const remoteMatch = await fetchSupabaseTenantSite(slug, hostname);
    if (remoteMatch) {
        setActiveTenantConfig(remoteMatch);
    }
}
