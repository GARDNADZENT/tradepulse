import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ALL_13_TABS,
  ManagedSite,
  PlatformSettings,
  StudioRole,
  StudioUser,
} from '../types';

const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
const supabaseKey = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const connectedSupabaseHost: string = (() => {
  if (!supabaseUrl) return '';
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return supabaseUrl;
  }
})();

export const studioSupabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// Purge any legacy sandbox keys that may have been stored in earlier browser sessions
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('tp_studio_published_sites_v1');
    window.localStorage.removeItem('tp_studio_sandbox_user_v1');
    window.localStorage.removeItem('tp_studio_platform_settings_v1');
  } catch {}
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  pooled_deriv_app_id: process.env.STUDIO_POOLED_DERIV_APP_ID || '',
  default_commission_pct: 20,
  base_domain: process.env.STUDIO_BASE_DOMAIN || 'traderspulse.site',
  allow_public_signups: true,
};

function requireSupabase(): SupabaseClient {
  if (!studioSupabase) {
    throw new Error(
      'Supabase is not configured. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in your Studio environment variables and redeploy.'
    );
  }
  return studioSupabase;
}

export async function fetchPlatformSettings(): Promise<PlatformSettings> {
  const client = requireSupabase();
  const { data } = await client
    .from('studio_platform_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (!data) return DEFAULT_PLATFORM_SETTINGS;
  return {
    pooled_deriv_app_id: String(
      data.pooled_deriv_app_id || DEFAULT_PLATFORM_SETTINGS.pooled_deriv_app_id || ''
    ),
    default_commission_pct: Number(
      data.default_commission_share_pct ?? data.default_commission_pct ?? 20
    ),
    base_domain: String(data.base_domain || DEFAULT_PLATFORM_SETTINGS.base_domain),
    allow_public_signups: data.allow_public_signups !== false,
  };
}

export async function savePlatformSettings(next: PlatformSettings): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('studio_platform_settings').upsert({
    id: 1,
    pooled_deriv_app_id: next.pooled_deriv_app_id,
    default_commission_share_pct: next.default_commission_pct,
    base_domain: next.base_domain,
    allow_public_signups: next.allow_public_signups,
  });
  if (error) throw error;
}

export async function getInitialStudioSession(): Promise<StudioUser | null> {
  if (!studioSupabase) return null;

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
      profile?.full_name ||
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
  const client = requireSupabase();

  if (isSignUp) {
    const resolvedName = displayName?.trim() || email.split('@')[0];
    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: resolvedName },
      },
    });
    if (error) throw error;
    if (!data.user) {
      throw new Error('Account created — check your email inbox to confirm your address, then sign in.');
    }
    if (!data.session) {
      throw new Error('Account created — check your email inbox to confirm your address before signing in.');
    }
    const sessionUser = await getInitialStudioSession();
    return (
      sessionUser || {
        id: data.user.id,
        email: data.user.email || email.trim(),
        display_name: resolvedName,
        role: 'operator',
      }
    );
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;

  const sessionUser = await getInitialStudioSession();
  if (!sessionUser) {
    return {
      id: data.user.id,
      email: data.user.email || email.trim(),
      display_name: email.split('@')[0],
      role: 'operator',
    };
  }
  return sessionUser;
}

export async function resendConfirmationEmail(email: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: {
      emailRedirectTo: window.location.origin,
    },
  });
  if (error) throw error;
}

export async function signInWithGoogleOAuth(): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signOutStudio(): Promise<void> {
  if (studioSupabase) {
    await studioSupabase.auth.signOut();
  }
}

export async function loadManagedSites(user: StudioUser): Promise<ManagedSite[]> {
  const client = requireSupabase();

  let query = client
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
      ? await client
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
    deriv_referral_link: String(r.deriv_referral_link || ''),
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
  const client = requireSupabase();

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
    updated_at: new Date().toISOString(),
  };

  let savedSiteId = site.id;
  let updatedAt = payload.updated_at;

  if (site.id.startsWith('new-')) {
    const { data, error } = await client
      .from('managed_sites')
      .insert({ ...payload, owner_id: site.owner_id, owner_email: site.owner_email || '' })
      .select('*')
      .single();
    if (error) throw error;
    savedSiteId = String(data.id);
    updatedAt = data.updated_at;
  } else {
    const { error } = await client.from('managed_sites').update(payload).eq('id', site.id);
    if (error) throw error;
  }

  const { error: delBotsErr } = await client
    .from('managed_site_bots')
    .delete()
    .eq('site_id', savedSiteId);
  if (delBotsErr) throw delBotsErr;

  if (site.custom_bots.length > 0) {
    const { error: insBotsErr } = await client.from('managed_site_bots').insert(
      site.custom_bots.map((b, idx) => ({
        site_id: savedSiteId,
        name: b.name,
        strategy: b.strategy,
        description: b.description,
        categories: b.categories,
        xml_content: b.xml_content,
        sort_order: idx + 1,
        is_active: b.is_active,
      }))
    );
    if (insBotsErr) throw insBotsErr;
  }

  return { ...site, id: savedSiteId, updated_at: updatedAt };
}

export async function deleteManagedSite(siteId: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('managed_sites').delete().eq('id', siteId);
  if (error) throw error;
}

export async function uploadLogoAsset(file: File, userId: string): Promise<string> {
  const client = requireSupabase();
  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await client.storage
    .from('studio-assets')
    .upload(path, file, { upsert: true });
  if (error) throw error;

  const { data } = client.storage.from('studio-assets').getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('Unable to resolve public URL from studio-assets bucket.');
  }
  return data.publicUrl;
}

export function resolveTenantRuntimeBaseUrl(): string {
  const configured = (process.env.STUDIO_TENANT_RUNTIME_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');

  if (typeof window === 'undefined') return 'http://localhost:4003';
  const { protocol, hostname } = window.location;

  const e2bMatch = hostname.match(/^4004-(.+)\.e2b\.app$/i);
  if (e2bMatch) {
    return `${protocol}//4003-${e2bMatch[1]}.e2b.app`;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:4003`;
  }

  return `${protocol}//${hostname}`;
}

export function buildLiveTenantUrl(site: ManagedSite): string {
  const base = resolveTenantRuntimeBaseUrl();
  return `${base}/?site=${encodeURIComponent(site.slug)}`;
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
    deriv_referral_link: params.deriv_referral_link.trim(),
    announcement_text: '',
    enabled_tabs: tabsByPreset[params.preset],
    social_links: {},
    include_default_bots: true,
    commission_share_pct: platform.default_commission_pct,
    custom_bots: [],
  };
}
