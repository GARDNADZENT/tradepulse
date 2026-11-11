import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ALL_13_TABS,
  ManagedBotItem,
  ManagedSite,
  PlatformSettings,
  SAMPLE_UPLOADED_BOT_XML,
  StudioRole,
  StudioUser,
} from '../types';

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const studioSupabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const LOCAL_SITES_KEY = 'tp_studio_published_sites_v1';
const LOCAL_USER_KEY = 'tp_studio_sandbox_user_v1';
const LOCAL_PLATFORM_KEY = 'tp_studio_platform_settings_v1';

const DEFAULT_REFERRAL =
  'https://track.deriv.com/_1mHiO0UpCX6NhxmBqQyZL2Nd7ZgqdRLk/1/';

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  pooled_deriv_app_id: process.env.STUDIO_POOLED_DERIV_APP_ID || '',
  default_commission_pct: 20,
  base_domain: process.env.STUDIO_BASE_DOMAIN || 'traderspulse.site',
  allow_public_signups: true,
};

const SEED_SANDBOX_SITES: ManagedSite[] = [
  {
    id: 'site-alpha-digits',
    owner_id: 'op-demo-1',
    owner_email: 'operator@alphadigits.site',
    slug: 'alphadigits',
    custom_domain: 'alphadigits.site',
    domain_status: 'live',
    status: 'active',
    brand_name: 'AlphaDigits Pro',
    tagline: 'ALGO DIGITS & AI SUITE',
    logo_url: '/traderpulse-logo.jpg',
    primary_color: '#0066FF',
    secondary_color: '#050914',
    deriv_app_id: '',
    use_pooled_oauth: true,
    pooled_deriv_app_id: '36544',
    deriv_referral_link: DEFAULT_REFERRAL,
    announcement_text: '',
    enabled_tabs: ALL_13_TABS.map(t => t.id),
    social_links: {
      telegram: 'https://t.me/traderspulse_official',
      whatsapp: 'https://whatsapp.com/channel/0029Vb7Jc2f90x2u27c7A32R',
    },
    include_default_bots: true,
    commission_share_pct: 20,
    monthly_volume_usd: 48250,
    custom_bots: [
      {
        id: 'bot-alpha-1',
        name: 'AlphaDigits 1s Parity Sniper',
        strategy: '1-Tick Digit Even Burst',
        description: 'Custom operator XML strategy uploaded via TradersPulse Site Studio.',
        categories: ['special', 'turbo-ai'],
        xml_content: SAMPLE_UPLOADED_BOT_XML,
        sort_order: 1,
        is_active: true,
      },
    ],
  },
  {
    id: 'site-nairobi-traders',
    owner_id: 'op-demo-1',
    owner_email: 'operator@alphadigits.site',
    slug: 'nairobitraders',
    custom_domain: 'nairobitraders.co.ke',
    domain_status: 'live',
    status: 'active',
    brand_name: 'Nairobi Traders Hub',
    tagline: 'EAST AFRICA DERIV DESK',
    logo_url: '/traderpulse-logo.jpg',
    primary_color: '#10B981',
    secondary_color: '#050914',
    deriv_app_id: '',
    use_pooled_oauth: true,
    pooled_deriv_app_id: '36544',
    deriv_referral_link: DEFAULT_REFERRAL,
    announcement_text: 'Live Nairobi Volatility Session — Copy Trading Desk Open',
    enabled_tabs: [
      'id-dbot-dashboard',
      'id-bot-builder',
      'id-trading-bots',
      'id-ai-bots',
      'id-analysis-tool',
      'id-dtrader',
      'id-copy-trading',
    ],
    social_links: {
      telegram: 'https://t.me/nairobitradershub',
    },
    include_default_bots: true,
    commission_share_pct: 20,
    monthly_volume_usd: 31900,
    custom_bots: [],
  },
  {
    id: 'site-quant-pulse',
    owner_id: 'op-partner-2',
    owner_email: 'desk@quantpulse.io',
    slug: 'quantpulse',
    custom_domain: 'quantpulse.io',
    domain_status: 'verify_dns',
    status: 'active',
    brand_name: 'QuantPulse Terminal',
    tagline: 'INSTITUTIONAL BOT ENGINE',
    logo_url: '/traderpulse-logo.jpg',
    primary_color: '#8B5CF6',
    secondary_color: '#050914',
    deriv_app_id: '62819',
    use_pooled_oauth: false,
    pooled_deriv_app_id: '36544',
    deriv_referral_link: DEFAULT_REFERRAL,
    announcement_text: '',
    enabled_tabs: ALL_13_TABS.map(t => t.id),
    social_links: {},
    include_default_bots: true,
    commission_share_pct: 15,
    monthly_volume_usd: 19400,
    custom_bots: [],
  },
];

function broadcastLocalSites(sites: ManagedSite[]) {
  try {
    localStorage.setItem(LOCAL_SITES_KEY, JSON.stringify(sites));
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel('tp_studio_live_sync');
      ch.postMessage({ sites });
      ch.close();
    }
  } catch {}
}

export function loadPlatformSettingsLocal(): PlatformSettings {
  try {
    const raw = localStorage.getItem(LOCAL_PLATFORM_KEY);
    if (raw) return { ...DEFAULT_PLATFORM_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_PLATFORM_SETTINGS;
}

export async function fetchPlatformSettings(): Promise<PlatformSettings> {
  if (!studioSupabase) return loadPlatformSettingsLocal();
  const { data } = await studioSupabase
    .from('studio_platform_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (!data) return DEFAULT_PLATFORM_SETTINGS;
  return {
    pooled_deriv_app_id: String(data.pooled_deriv_app_id || DEFAULT_PLATFORM_SETTINGS.pooled_deriv_app_id || ''),
    default_commission_pct: Number(data.default_commission_share_pct ?? data.default_commission_pct ?? 20),
    base_domain: String(data.base_domain || 'traderspulse.site'),
    allow_public_signups: data.allow_public_signups !== false,
  };
}

export async function savePlatformSettings(next: PlatformSettings): Promise<void> {
  try {
    localStorage.setItem(LOCAL_PLATFORM_KEY, JSON.stringify(next));
  } catch {}
  if (!studioSupabase) return;
  await studioSupabase.from('studio_platform_settings').upsert({
    id: 1,
    pooled_deriv_app_id: next.pooled_deriv_app_id,
    default_commission_share_pct: next.default_commission_pct,
    base_domain: next.base_domain,
    allow_public_signups: next.allow_public_signups,
  });
}

export async function getInitialStudioSession(): Promise<StudioUser | null> {
  if (!studioSupabase) {
    try {
      const raw = localStorage.getItem(LOCAL_USER_KEY);
      if (raw) return JSON.parse(raw) as StudioUser;
    } catch {}
    // Boot directly into interactive Operator session in Sandbox mode while still allowing Sign Out -> Auth Screen
    const defaultUser: StudioUser = {
      id: 'op-demo-1',
      email: 'operator@alphadigits.site',
      display_name: 'Partner Operator',
      role: 'super_admin',
      is_sandbox: true,
    };
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(defaultUser));
    return defaultUser;
  }

  const { data } = await studioSupabase.auth.getSession();
  const authUser = data.session?.user;
  if (!authUser) return null;

  const { data: profile } = await studioSupabase
    .from('studio_profiles')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();

  return {
    id: authUser.id,
    email: authUser.email || '',
    display_name:
      profile?.display_name ||
      authUser.user_metadata?.full_name ||
      (authUser.email ? authUser.email.split('@')[0] : 'Operator'),
    role: (profile?.role as StudioRole) || 'operator',
  };
}

export async function signInWithEmail(
  email: string,
  password: string,
  isSignUp: boolean,
  displayName?: string
): Promise<StudioUser> {
  if (!studioSupabase) {
    const role: StudioRole = email.toLowerCase().includes('admin') ? 'super_admin' : 'operator';
    const sandboxUser: StudioUser = {
      id: role === 'super_admin' ? 'super-admin-1' : 'op-demo-1',
      email: email.trim() || 'operator@alphadigits.site',
      display_name: displayName?.trim() || email.split('@')[0] || 'Operator',
      role,
      is_sandbox: true,
    };
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(sandboxUser));
    return sandboxUser;
  }

  if (isSignUp) {
    const { data, error } = await studioSupabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: displayName || email.split('@')[0] } },
    });
    if (error) throw error;
    if (!data.user) throw new Error('Check your email inbox to confirm your operator account.');
    return {
      id: data.user.id,
      email: data.user.email || email,
      display_name: displayName || email.split('@')[0],
      role: 'operator',
    };
  }

  const { data, error } = await studioSupabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const sessionUser = await getInitialStudioSession();
  if (!sessionUser) {
    return {
      id: data.user.id,
      email: data.user.email || email,
      display_name: email.split('@')[0],
      role: 'operator',
    };
  }
  return sessionUser;
}

export async function signInWithGoogleOAuth(): Promise<void> {
  if (!studioSupabase) {
    const googleSandbox: StudioUser = {
      id: 'op-demo-1',
      email: 'partner@gmail.com',
      display_name: 'Google Partner',
      role: 'operator',
      is_sandbox: true,
    };
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(googleSandbox));
    window.location.reload();
    return;
  }
  const { error } = await studioSupabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export function switchSandboxRole(user: StudioUser, nextRole: StudioRole): StudioUser {
  const updated: StudioUser = {
    ...user,
    role: nextRole,
    id: nextRole === 'super_admin' ? 'super-admin-1' : 'op-demo-1',
  };
  try {
    localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(updated));
  } catch {}
  return updated;
}

export async function signOutStudio(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_USER_KEY);
  } catch {}
  if (studioSupabase) {
    await studioSupabase.auth.signOut();
  }
}

export async function loadManagedSites(user: StudioUser): Promise<ManagedSite[]> {
  if (!studioSupabase) {
    let allSites = SEED_SANDBOX_SITES;
    try {
      const raw = localStorage.getItem(LOCAL_SITES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          allSites = parsed;
        }
      } else {
        broadcastLocalSites(SEED_SANDBOX_SITES);
      }
    } catch {}

    if (user.role === 'super_admin') return allSites;
    return allSites.filter(s => s.owner_id === user.id);
  }

  let query = studioSupabase
    .from('managed_sites')
    .select('*')
    .order('created_at', { ascending: false });

  if (user.role !== 'super_admin') {
    query = query.eq('owner_id', user.id);
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  const siteIds = (rows || []).map((r: any) => r.id);
  const { data: botRows } =
    siteIds.length > 0
      ? await studioSupabase
          .from('managed_site_bots')
          .select('*')
          .in('site_id', siteIds)
          .order('sort_order', { ascending: true })
      : { data: [] };

  const platform = await fetchPlatformSettings();

  return (rows || []).map((r: any) => ({
    id: String(r.id),
    owner_id: String(r.owner_id),
    owner_email: String(r.owner_email || ''),
    slug: String(r.slug),
    custom_domain: String(r.custom_domain || ''),
    domain_status: r.domain_status || 'verify_dns',
    status: r.status || 'active',
    brand_name: String(r.brand_name || 'TradersPulse'),
    tagline: String(r.tagline || 'SMART DERIV TOOLS'),
    logo_url: String(r.logo_url || '/traderpulse-logo.jpg'),
    primary_color: String(r.primary_color || '#0066FF'),
    secondary_color: String(r.secondary_color || '#050914'),
    deriv_app_id: String(r.deriv_app_id || ''),
    use_pooled_oauth: r.use_pooled_oauth !== false,
    pooled_deriv_app_id: platform.pooled_deriv_app_id,
    deriv_referral_link: String(r.deriv_referral_link || DEFAULT_REFERRAL),
    announcement_text: String(r.announcement_text || ''),
    enabled_tabs: Array.isArray(r.enabled_tabs) ? r.enabled_tabs : ALL_13_TABS.map(t => t.id),
    social_links: r.social_links || {},
    include_default_bots: r.include_default_bots !== false,
    commission_share_pct: Number(r.commission_share_pct ?? 20),
    custom_bots: (botRows || [])
      .filter((b: any) => b.site_id === r.id)
      .map((b: any) => ({
        id: String(b.id),
        name: String(b.name),
        strategy: String(b.strategy || 'Custom Strategy'),
        description: String(b.description || ''),
        categories: Array.isArray(b.categories) ? b.categories : ['special'],
        xml_content: String(b.xml_content || ''),
        sort_order: Number(b.sort_order || 1),
        is_active: b.is_active !== false,
      })),
    updated_at: r.updated_at,
  }));
}

export async function persistManagedSite(site: ManagedSite): Promise<ManagedSite> {
  // Always keep local storage synced so instant preview tabs reflect changes immediately
  try {
    const raw = localStorage.getItem(LOCAL_SITES_KEY);
    const existing: ManagedSite[] = raw ? JSON.parse(raw) : SEED_SANDBOX_SITES;
    const exists = existing.some(s => s.id === site.id);
    const next = exists ? existing.map(s => (s.id === site.id ? site : s)) : [site, ...existing];
    broadcastLocalSites(next);
  } catch {}

  if (!studioSupabase) {
    return { ...site, updated_at: new Date().toISOString() };
  }

  const payload = {
    slug: site.slug.toLowerCase().trim(),
    custom_domain: site.custom_domain.trim().toLowerCase() || null,
    domain_status: site.domain_status,
    status: site.status,
    brand_name: site.brand_name,
    tagline: site.tagline,
    logo_url: site.logo_url,
    primary_color: site.primary_color,
    secondary_color: site.secondary_color,
    deriv_app_id: site.deriv_app_id,
    use_pooled_oauth: site.use_pooled_oauth,
    deriv_referral_link: site.deriv_referral_link,
    announcement_text: site.announcement_text,
    enabled_tabs: site.enabled_tabs,
    social_links: site.social_links,
    include_default_bots: site.include_default_bots,
    commission_share_pct: site.commission_share_pct,
  };

  if (site.id.startsWith('new-')) {
    const { data, error } = await studioSupabase
      .from('managed_sites')
      .insert({ ...payload, owner_id: site.owner_id, owner_email: site.owner_email || '' })
      .select('*')
      .single();
    if (error) throw error;
    return { ...site, id: String(data.id), updated_at: data.updated_at };
  }

  const { error } = await studioSupabase.from('managed_sites').update(payload).eq('id', site.id);
  if (error) throw error;

  // Sync custom bots in Supabase
  await studioSupabase.from('managed_site_bots').delete().eq('site_id', site.id);
  if (site.custom_bots.length > 0) {
    await studioSupabase.from('managed_site_bots').insert(
      site.custom_bots.map((b, idx) => ({
        site_id: site.id,
        name: b.name,
        strategy: b.strategy,
        description: b.description,
        categories: b.categories,
        xml_content: b.xml_content,
        sort_order: idx + 1,
        is_active: b.is_active,
      }))
    );
  }

  return { ...site, updated_at: new Date().toISOString() };
}

export async function deleteManagedSite(siteId: string): Promise<void> {
  try {
    const raw = localStorage.getItem(LOCAL_SITES_KEY);
    const existing: ManagedSite[] = raw ? JSON.parse(raw) : SEED_SANDBOX_SITES;
    broadcastLocalSites(existing.filter(s => s.id !== siteId));
  } catch {}
  if (studioSupabase) {
    await studioSupabase.from('managed_sites').delete().eq('id', siteId);
  }
}

export async function uploadLogoAsset(file: File, userId: string): Promise<string> {
  if (studioSupabase) {
    const ext = file.name.split('.').pop() || 'png';
    const path = `${userId}/${Date.now()}.${ext}`;
    const { error } = await studioSupabase.storage
      .from('studio-assets')
      .upload(path, file, { upsert: true });
    if (!error) {
      const { data } = studioSupabase.storage.from('studio-assets').getPublicUrl(path);
      if (data?.publicUrl) return data.publicUrl;
    }
  }

  // Fallback to compact DataURL so logo preview & persistence work immediately without bucket setup
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || '/traderpulse-logo.jpg'));
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

export function resolveTenantRuntimeBaseUrl(): string {
  const configured = (process.env.STUDIO_TENANT_RUNTIME_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return 'http://localhost:4003';
  const { protocol, hostname } = window.location;

  // Arena e2b preview automatic pairing (`4004-{sandbox}.e2b.app` -> `4003-{sandbox}.e2b.app`)
  const e2bMatch = hostname.match(/^4004-(.+)\.e2b\.app$/i);
  if (e2bMatch) {
    return `${protocol}//4003-${e2bMatch[1]}.e2b.app`;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:4003`;
  }

  return `${protocol}//${hostname}`;
}

export function buildLiveTenantUrl(site: ManagedSite, includeHashPayload = false): string {
  const base = resolveTenantRuntimeBaseUrl();
  const url = `${base}/?site=${encodeURIComponent(site.slug)}`;
  if (!includeHashPayload || isSupabaseConfigured) return url;

  try {
    // Strip bulky XML strings only if >48KB so hash stays crisp while keeping full branding/tabs/OAuth/bots
    const lightSite: ManagedSite = {
      ...site,
      logo_url: site.logo_url.startsWith('data:') && site.logo_url.length > 24000 ? '/traderpulse-logo.jpg' : site.logo_url,
    };
    const encoded = window.btoa(unescape(encodeURIComponent(JSON.stringify(lightSite))));
    return `${url}#tp_site=${encoded}`;
  } catch {
    return url;
  }
}

export function createBlankManagedSite(
  user: StudioUser,
  params: {
    brand_name: string;
    slug: string;
    custom_domain: string;
    primary_color: string;
    deriv_referral_link: string;
    preset: 'full' | 'bots_only' | 'pro_desk';
  },
  platform: PlatformSettings
): ManagedSite {
  const tabsByPreset: Record<'full' | 'bots_only' | 'pro_desk', string[]> = {
    full: ALL_13_TABS.map(t => t.id),
    bots_only: ['id-dbot-dashboard', 'id-bot-builder', 'id-ai-developer', 'id-trading-bots', 'id-ai-bots'],
    pro_desk: [
      'id-dbot-dashboard',
      'id-ai-bots',
      'id-trading-view',
      'id-analysis-tool',
      'id-digits-analysis',
      'id-dtrader',
      'id-copy-trading',
      'id-tradepulse',
    ],
  };

  return {
    id: `new-${Date.now()}`,
    owner_id: user.id,
    owner_email: user.email,
    slug: params.slug.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    custom_domain: params.custom_domain.trim().toLowerCase(),
    domain_status: params.custom_domain.trim() ? 'verify_dns' : 'live',
    status: 'active',
    brand_name: params.brand_name.trim(),
    tagline: 'SMART DERIV TOOLS',
    logo_url: '/traderpulse-logo.jpg',
    primary_color: params.primary_color,
    secondary_color: '#050914',
    deriv_app_id: '',
    use_pooled_oauth: true,
    pooled_deriv_app_id: platform.pooled_deriv_app_id,
    deriv_referral_link: params.deriv_referral_link.trim() || DEFAULT_REFERRAL,
    announcement_text: '',
    enabled_tabs: tabsByPreset[params.preset],
    social_links: {},
    include_default_bots: true,
    commission_share_pct: platform.default_commission_pct,
    monthly_volume_usd: 0,
    custom_bots: [],
  };
}
