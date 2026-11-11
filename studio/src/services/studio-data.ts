import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ALL_13_TABS,
  CommissionRecord,
  ManagedBotItem,
  ManagedSite,
  PayoutRecord,
  PlatformSettings,
  SocialPlatformKey,
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

if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('tp_studio_published_sites_v1');
    window.localStorage.removeItem('tp_studio_sandbox_user_v1');
    window.localStorage.removeItem('tp_studio_platform_settings_v1');
  } catch {}
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  pooled_deriv_app_id: process.env.STUDIO_POOLED_DERIV_APP_ID || '',
  platform_markup_pct: 2.0,
  default_commission_pct: 50,
  base_domain: 'vercel.app',
  allow_public_signups: true,
  oauth_callback_hub_url: '',
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
    platform_markup_pct: Number(data.platform_markup_pct ?? 2.0),
    default_commission_pct: Number(
      data.default_commission_share_pct ?? data.default_commission_pct ?? 50
    ),
    base_domain: String(data.base_domain || 'vercel.app'),
    allow_public_signups: data.allow_public_signups !== false,
    oauth_callback_hub_url: String(data.oauth_callback_hub_url || ''),
  };
}

export async function savePlatformSettings(next: PlatformSettings): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('studio_platform_settings').upsert({
    id: 1,
    pooled_deriv_app_id: next.pooled_deriv_app_id.trim(),
    platform_markup_pct: Number(next.platform_markup_pct || 2.0),
    default_commission_share_pct: Number(next.default_commission_pct || 50),
    base_domain: next.base_domain.trim() || 'vercel.app',
    allow_public_signups: next.allow_public_signups,
    oauth_callback_hub_url: next.oauth_callback_hub_url.trim(),
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
      throw new Error(
        'Account created — check your email inbox to confirm your address, then sign in.'
      );
    }
    if (!data.session) {
      throw new Error(
        'Account created — check your email inbox to confirm your address before signing in.'
      );
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

  try {
    const settingsResp = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: supabaseKey },
    });
    if (settingsResp.ok) {
      const settings = await settingsResp.json();
      if (settings?.external && settings.external.google === false) {
        const callbackUrl = `${supabaseUrl.replace(/\/$/, '')}/auth/v1/callback`;
        throw new Error(
          `Google Sign-In is not enabled in your Supabase project yet. Enable it in Supabase Dashboard → Authentication → Providers → Google (Callback URL: ${callbackUrl}), or sign in with Email & Password below.`
        );
      }
    }
  } catch (err: any) {
    if (err?.message?.includes('Google Sign-In is not enabled')) {
      throw err;
    }
  }

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

  return (rows || []).map((r: any) => {
    const slug = String(r.slug);
    return {
      id: String(r.id),
      owner_id: String(r.owner_id),
      owner_email: String(r.owner_email || ''),
      slug,
      vercel_domain: String(r.vercel_domain || `${slug}.vercel.app`),
      vercel_domain_status: r.vercel_domain_status || 'pending',
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
      commission_share_pct: Number(r.commission_share_pct ?? platform.default_commission_pct),
      payout_method: String(r.payout_method || ''),
      payout_wallet: String(r.payout_wallet || ''),
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
    };
  });
}

export async function persistManagedSite(site: ManagedSite): Promise<ManagedSite> {
  const client = requireSupabase();

  const cleanSlug = site.slug.toLowerCase().trim();
  const vercelDomain = (site.vercel_domain || `${cleanSlug}.vercel.app`).toLowerCase().trim();

  const payload = {
    slug: cleanSlug,
    vercel_domain: vercelDomain,
    vercel_domain_status: site.vercel_domain_status || 'pending',
    custom_domain: site.custom_domain.trim().toLowerCase() || null,
    domain_status: site.domain_status,
    status: site.status,
    brand_name: site.brand_name,
    tagline: site.tagline,
    logo_url: site.logo_url,
    primary_color: site.primary_color,
    secondary_color: site.secondary_color,
    deriv_app_id: '',
    use_pooled_oauth: true,
    deriv_referral_link: site.deriv_referral_link,
    announcement_text: site.announcement_text,
    enabled_tabs: site.enabled_tabs,
    social_links: site.social_links,
    include_default_bots: site.include_default_bots,
    commission_share_pct: site.commission_share_pct,
    payout_method: site.payout_method.trim(),
    payout_wallet: site.payout_wallet.trim(),
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

  return {
    ...site,
    id: savedSiteId,
    slug: cleanSlug,
    vercel_domain: vercelDomain,
    use_pooled_oauth: true,
    deriv_app_id: '',
    updated_at: updatedAt,
  };
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

export async function checkVercelSubdomainAvailability(slug: string): Promise<{
  available: boolean;
  vercel_domain: string;
  url: string;
  error?: string;
  env_missing?: boolean;
}> {
  const clean = slug
    .trim()
    .toLowerCase()
    .replace(/\.vercel\.app$/i, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const vercelDomain = `${clean}.vercel.app`;
  if (clean.length < 2) {
    return {
      available: false,
      vercel_domain: vercelDomain,
      url: `https://${vercelDomain}`,
      error: 'Enter at least 2 characters.',
    };
  }
  if (clean.includes('deriv') || clean.includes('binary')) {
    return {
      available: false,
      vercel_domain: vercelDomain,
      url: `https://${vercelDomain}`,
      error: 'Names containing "deriv" or "binary" are restricted.',
    };
  }

  // Check Supabase managed_sites first so duplicate slugs are caught immediately
  if (studioSupabase) {
    const { data: existing } = await studioSupabase
      .from('managed_sites')
      .select('id')
      .or(`slug.eq.${clean},vercel_domain.eq.${vercelDomain}`)
      .maybeSingle();
    if (existing?.id) {
      return {
        available: false,
        vercel_domain: vercelDomain,
        url: `https://${vercelDomain}`,
        error: `${vercelDomain} is already registered.`,
      };
    }
  }

  try {
    const resp = await fetch('/api/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_vercel_subdomain', slug: clean }),
    });
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await resp.json();
      return {
        available: Boolean(data.available),
        vercel_domain: data.vercel_domain || vercelDomain,
        url: data.url || `https://${vercelDomain}`,
        error: data.error,
        env_missing: Boolean(data.env_missing),
      };
    }
  } catch {
    // Local dev server without /api/domains serverless function
  }

  return {
    available: true,
    vercel_domain: vercelDomain,
    url: `https://${vercelDomain}`,
  };
}

export async function provisionVercelSubdomain(slug: string): Promise<{
  ok: boolean;
  vercel_domain: string;
  vercel_domain_status: 'live' | 'pending';
  url: string;
  error?: string;
}> {
  const clean = slug.trim().toLowerCase();
  const vercelDomain = `${clean}.vercel.app`;

  try {
    const resp = await fetch('/api/domains', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'provision_vercel_subdomain', slug: clean }),
    });
    const ct = resp.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await resp.json();
      if (resp.ok && data.ok) {
        return {
          ok: true,
          vercel_domain: data.vercel_domain || vercelDomain,
          vercel_domain_status: 'live',
          url: data.url || `https://${vercelDomain}`,
        };
      }
      return {
        ok: false,
        vercel_domain: data.vercel_domain || vercelDomain,
        vercel_domain_status: 'pending',
        url: `https://${vercelDomain}`,
        error: data.error,
      };
    }
  } catch {
    // Local dev fallback
  }

  return {
    ok: false,
    vercel_domain: vercelDomain,
    vercel_domain_status: 'pending',
    url: `https://${vercelDomain}`,
    error: 'Deploy Studio to Vercel with VERCEL_API_TOKEN + VERCEL_TENANT_PROJECT_ID to activate .vercel.app domains.',
  };
}

export async function loadCommissionLedger(user: StudioUser): Promise<{
  commissions: CommissionRecord[];
  payouts: PayoutRecord[];
}> {
  const client = requireSupabase();

  let commQuery = client
    .from('managed_site_commissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);

  let payQuery = client
    .from('managed_site_payouts')
    .select('*')
    .order('paid_at', { ascending: false })
    .limit(200);

  if (user.role !== 'super_admin') {
    commQuery = commQuery.eq('owner_id', user.id);
    payQuery = payQuery.eq('owner_id', user.id);
  }

  const [{ data: commRows }, { data: payRows }] = await Promise.all([commQuery, payQuery]);

  const commissions: CommissionRecord[] = (commRows || []).map((r: any) => ({
    id: String(r.id),
    site_id: String(r.site_id),
    owner_id: String(r.owner_id),
    site_slug: String(r.site_slug || ''),
    contract_id: String(r.contract_id || ''),
    transaction_id: String(r.transaction_id || ''),
    trader_loginid: String(r.trader_loginid || ''),
    currency: String(r.currency || 'USD'),
    contract_type: String(r.contract_type || ''),
    symbol: String(r.symbol || ''),
    stake_amount: Number(r.stake_amount || 0),
    markup_pct: Number(r.markup_pct || 0),
    operator_share_pct: Number(r.operator_share_pct || 0),
    gross_markup_usd: Number(r.gross_markup_usd || 0),
    operator_commission_usd: Number(r.operator_commission_usd || 0),
    admin_net_usd: Number(r.admin_net_usd || 0),
    payout_status: r.payout_status === 'paid' ? 'paid' : 'unpaid',
    payout_id: r.payout_id ? String(r.payout_id) : null,
    created_at: String(r.created_at || ''),
  }));

  const payouts: PayoutRecord[] = (payRows || []).map((p: any) => ({
    id: String(p.id),
    site_id: String(p.site_id),
    owner_id: String(p.owner_id),
    owner_email: String(p.owner_email || ''),
    site_url: String(p.site_url || ''),
    payout_method: String(p.payout_method || ''),
    payout_wallet: String(p.payout_wallet || ''),
    amount_usd: Number(p.amount_usd || 0),
    trades_count: Number(p.trades_count || 0),
    reference_note: String(p.reference_note || ''),
    paid_at: String(p.paid_at || ''),
  }));

  return { commissions, payouts };
}

export async function markSiteCommissionsPaid(params: {
  site: ManagedSite;
  unpaidAmountUsd: number;
  tradesCount: number;
  referenceNote?: string;
}): Promise<PayoutRecord> {
  const client = requireSupabase();
  const siteUrl = buildLiveTenantUrl(params.site);

  const { data: payoutRow, error: payErr } = await client
    .from('managed_site_payouts')
    .insert({
      site_id: params.site.id,
      owner_id: params.site.owner_id,
      owner_email: params.site.owner_email || '',
      site_url: siteUrl,
      payout_method: params.site.payout_method || '',
      payout_wallet: params.site.payout_wallet || '',
      amount_usd: Number(params.unpaidAmountUsd.toFixed(2)),
      trades_count: params.tradesCount,
      reference_note: (params.referenceNote || '').trim(),
    })
    .select('*')
    .single();

  if (payErr) throw payErr;

  const { error: updErr } = await client
    .from('managed_site_commissions')
    .update({
      payout_status: 'paid',
      payout_id: payoutRow.id,
    })
    .eq('site_id', params.site.id)
    .eq('payout_status', 'unpaid');

  if (updErr) throw updErr;

  return {
    id: String(payoutRow.id),
    site_id: String(payoutRow.site_id),
    owner_id: String(payoutRow.owner_id),
    owner_email: String(payoutRow.owner_email || ''),
    site_url: String(payoutRow.site_url || siteUrl),
    payout_method: String(payoutRow.payout_method || ''),
    payout_wallet: String(payoutRow.payout_wallet || ''),
    amount_usd: Number(payoutRow.amount_usd || 0),
    trades_count: Number(payoutRow.trades_count || 0),
    reference_note: String(payoutRow.reference_note || ''),
    paid_at: String(payoutRow.paid_at || new Date().toISOString()),
  };
}

/**
 * Public-facing clean URL for a created site — ALWAYS https://<slug>.vercel.app
 * (or https://<custom_domain> once custom domain SSL is live).
 * Never exposes any internal template project name or ?site= query string.
 */
export function buildLiveTenantUrl(site: ManagedSite): string {
  if (site.custom_domain && site.domain_status === 'live') {
    return `https://${site.custom_domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  }
  const vDom = (site.vercel_domain || `${site.slug}.vercel.app`)
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  return `https://${vDom}`;
}

/**
 * Live iframe preview URL inside Site Studio.
 */
export function buildPreviewTenantUrl(site: ManagedSite): string {
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;

    const e2bMatch = hostname.match(/^4004-(.+)\.e2b\.app$/i);
    if (e2bMatch) {
      return `${protocol}//4003-${e2bMatch[1]}.e2b.app/?site=${encodeURIComponent(site.slug)}`;
    }

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `${protocol}//${hostname}:4003/?site=${encodeURIComponent(site.slug)}`;
    }
  }

  if (site.vercel_domain_status === 'live') {
    return buildLiveTenantUrl(site);
  }

  const fallbackRuntime = (process.env.STUDIO_TENANT_RUNTIME_URL || '').trim().replace(/\/$/, '');
  if (fallbackRuntime) {
    return `${fallbackRuntime}/?site=${encodeURIComponent(site.slug)}`;
  }

  return buildLiveTenantUrl(site);
}

export function createConfiguredManagedSite(
  user: StudioUser,
  params: {
    brand_name: string;
    tagline: string;
    slug: string;
    logo_url: string;
    custom_domain: string;
    primary_color: string;
    deriv_referral_link: string;
    enabled_tabs: string[];
    include_default_bots: boolean;
    custom_bots: ManagedBotItem[];
    social_links: Partial<Record<SocialPlatformKey, string>>;
    payout_method: string;
    payout_wallet: string;
    vercel_domain_status: 'live' | 'pending';
  },
  platform: PlatformSettings
): ManagedSite {
  const cleanSlug = params.slug
    .toLowerCase()
    .replace(/\.vercel\.app$/i, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return {
    id: `new-${Date.now()}`,
    owner_id: user.id,
    owner_email: user.email,
    slug: cleanSlug,
    vercel_domain: `${cleanSlug}.vercel.app`,
    vercel_domain_status: params.vercel_domain_status,
    custom_domain: params.custom_domain.trim().toLowerCase(),
    domain_status: params.custom_domain.trim() ? 'verify_dns' : 'live',
    status: 'active',
    brand_name: params.brand_name.trim(),
    tagline: params.tagline.trim() || 'SMART DERIV TOOLS',
    logo_url: params.logo_url || '/traderpulse-logo.jpg',
    primary_color: params.primary_color || '#0066FF',
    secondary_color: '#050914',
    deriv_app_id: '',
    use_pooled_oauth: true,
    pooled_deriv_app_id: platform.pooled_deriv_app_id,
    deriv_referral_link: params.deriv_referral_link.trim(),
    announcement_text: '',
    enabled_tabs:
      params.enabled_tabs.length > 0 ? params.enabled_tabs : ALL_13_TABS.map(t => t.id),
    social_links: params.social_links || {},
    include_default_bots: params.include_default_bots,
    commission_share_pct: platform.default_commission_pct,
    payout_method: params.payout_method.trim(),
    payout_wallet: params.payout_wallet.trim(),
    custom_bots: params.custom_bots,
  };
}
