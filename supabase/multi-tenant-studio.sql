-- =============================================================================
-- TradersPulse Site Studio — Multi-Tenant SaaS Control Plane & Commission Engine
-- Paste this ENTIRE script into the Supabase SQL Editor and click "Run".
-- Safe & idempotent: can be run on a fresh DB or re-run to upgrade existing tables.
-- =============================================================================

-- 1. Operator & Super-Admin Profiles
create table if not exists public.studio_profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    email text not null,
    display_name text,
    full_name text,
    role text not null default 'operator' check (role in ('operator', 'super_admin')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.studio_profiles enable row level security;

create or replace function public.is_studio_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1
        from public.studio_profiles
        where id = auth.uid()
          and role = 'super_admin'
    );
$$;

drop policy if exists "studio_profiles_select_own_or_admin" on public.studio_profiles;
create policy "studio_profiles_select_own_or_admin"
    on public.studio_profiles for select
    using (auth.uid() = id or public.is_studio_super_admin());

drop policy if exists "studio_profiles_update_own_or_admin" on public.studio_profiles;
create policy "studio_profiles_update_own_or_admin"
    on public.studio_profiles for update
    using (auth.uid() = id or public.is_studio_super_admin())
    with check (
        public.is_studio_super_admin()
        or (auth.uid() = id and role = 'operator')
    );

create or replace function public.handle_new_studio_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    resolved_name text;
begin
    resolved_name := coalesce(
        new.raw_user_meta_data->>'full_name',
        split_part(coalesce(new.email, 'operator'), '@', 1)
    );
    insert into public.studio_profiles (id, email, display_name, full_name, role)
    values (
        new.id,
        coalesce(new.email, ''),
        resolved_name,
        resolved_name,
        case
            when not exists (select 1 from public.studio_profiles where role = 'super_admin')
                then 'super_admin'
            else 'operator'
        end
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_studio_user_created on auth.users;
create trigger on_auth_studio_user_created
    after insert on auth.users
    for each row execute function public.handle_new_studio_user();

insert into public.studio_profiles (id, email, display_name, full_name, role)
select
    u.id,
    coalesce(u.email, ''),
    coalesce(u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email, 'operator'), '@', 1)),
    coalesce(u.raw_user_meta_data->>'full_name', split_part(coalesce(u.email, 'operator'), '@', 1)),
    case
        when row_number() over (order by u.created_at asc) = 1
             and not exists (select 1 from public.studio_profiles where role = 'super_admin')
            then 'super_admin'
        else 'operator'
    end
from auth.users u
on conflict (id) do nothing;

-- 2. Managed Trading Sites (Each site gets its own <slug>.vercel.app + optional custom domain)
create table if not exists public.managed_sites (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    owner_email text,
    slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$'),
    vercel_domain text unique,
    vercel_domain_status text not null default 'pending' check (vercel_domain_status in ('live', 'pending', 'manual')),
    custom_domain text unique,
    domain_status text not null default 'verify_dns' check (domain_status in ('live', 'verify_dns', 'ssl_pending')),
    status text not null default 'active' check (status in ('active', 'maintenance', 'suspended')),
    brand_name text not null,
    tagline text not null default 'SMART DERIV TOOLS',
    logo_url text,
    primary_color text not null default '#0066FF',
    secondary_color text not null default '#050914',
    deriv_app_id text not null default '',
    use_pooled_oauth boolean not null default true,
    deriv_referral_link text not null default '',
    announcement_text text not null default '',
    enabled_tabs text[] not null default array[
        'id-dbot-dashboard',
        'id-bot-builder',
        'id-ai-developer',
        'id-trading-bots',
        'id-dtrader',
        'id-ai-bots',
        'id-auto-trades',
        'id-trading-view',
        'id-copy-trading',
        'id-calculator',
        'id-analysis-tool',
        'id-digits-analysis',
        'id-tradepulse'
    ],
    social_links jsonb not null default '{}'::jsonb,
    include_default_bots boolean not null default true,
    commission_share_pct numeric not null default 50,
    payout_method text not null default '',
    payout_wallet text not null default '',
    monthly_visits integer not null default 0,
    monthly_bot_runs integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- Ensure columns exist when upgrading an existing deployment
alter table public.managed_sites add column if not exists vercel_domain text unique;
alter table public.managed_sites add column if not exists vercel_domain_status text not null default 'pending';
alter table public.managed_sites add column if not exists payout_method text not null default '';
alter table public.managed_sites add column if not exists payout_wallet text not null default '';

update public.managed_sites
set vercel_domain = lower(slug) || '.vercel.app'
where vercel_domain is null or vercel_domain = '';

create index if not exists idx_managed_sites_owner on public.managed_sites(owner_id);
create index if not exists idx_managed_sites_vercel_domain on public.managed_sites(lower(vercel_domain));
create index if not exists idx_managed_sites_domain on public.managed_sites(lower(custom_domain));
create index if not exists idx_managed_sites_slug on public.managed_sites(lower(slug));

alter table public.managed_sites enable row level security;

drop policy if exists "managed_sites_public_read" on public.managed_sites;
create policy "managed_sites_public_read"
    on public.managed_sites for select
    using (true);

create or replace function public.operator_site_count(p_uid uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
    select count(*)::integer
    from public.managed_sites
    where owner_id = p_uid;
$$;

drop policy if exists "managed_sites_operator_insert" on public.managed_sites;
create policy "managed_sites_operator_insert"
    on public.managed_sites for insert
    with check (
        public.is_studio_super_admin()
        or (
            auth.uid() = owner_id
            and status in ('active', 'maintenance')
            and public.operator_site_count(auth.uid()) < 1
        )
    );

-- Seed flagship https://tradepulse-lovat.vercel.app/ for the super_admin if present
insert into public.managed_sites (
    owner_id,
    owner_email,
    slug,
    vercel_domain,
    vercel_domain_status,
    domain_status,
    status,
    brand_name,
    tagline,
    logo_url,
    primary_color,
    secondary_color,
    use_pooled_oauth,
    commission_share_pct
)
select
    p.id,
    p.email,
    'tradepulse-lovat',
    'tradepulse-lovat.vercel.app',
    'live',
    'live',
    'active',
    'TradersPulse',
    'SMART DERIV TOOLS',
    '/traderpulse-logo.jpg',
    '#0066FF',
    '#050914',
    true,
    0
from public.studio_profiles p
where p.role = 'super_admin'
order by p.created_at asc
limit 1
on conflict (slug) do nothing;

drop policy if exists "managed_sites_operator_or_admin_update" on public.managed_sites;
create policy "managed_sites_operator_or_admin_update"
    on public.managed_sites for update
    using (
        public.is_studio_super_admin()
        or (auth.uid() = owner_id and status <> 'suspended')
    )
    with check (
        public.is_studio_super_admin()
        or (auth.uid() = owner_id and status in ('active', 'maintenance'))
    );

drop policy if exists "managed_sites_operator_or_admin_delete" on public.managed_sites;
create policy "managed_sites_operator_or_admin_delete"
    on public.managed_sites for delete
    using (auth.uid() = owner_id or public.is_studio_super_admin());

-- 3. Per-Site XML Bot Library (`managed_site_bots`)
create table if not exists public.managed_site_bots (
    id uuid primary key default gen_random_uuid(),
    site_id uuid not null references public.managed_sites(id) on delete cascade,
    name text not null,
    strategy text not null default 'Custom Automated Strategy',
    description text not null default '',
    categories text[] not null default array['special'],
    xml_content text not null,
    sort_order integer not null default 1,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create index if not exists idx_managed_site_bots_site on public.managed_site_bots(site_id, sort_order);

alter table public.managed_site_bots enable row level security;

drop policy if exists "managed_site_bots_public_read" on public.managed_site_bots;
create policy "managed_site_bots_public_read"
    on public.managed_site_bots for select
    using (true);

drop policy if exists "managed_site_bots_owner_or_admin_write" on public.managed_site_bots;
create policy "managed_site_bots_owner_or_admin_write"
    on public.managed_site_bots for all
    using (
        public.is_studio_super_admin()
        or exists (
            select 1 from public.managed_sites s
            where s.id = managed_site_bots.site_id
              and s.owner_id = auth.uid()
        )
    )
    with check (
        public.is_studio_super_admin()
        or exists (
            select 1 from public.managed_sites s
            where s.id = managed_site_bots.site_id
              and s.owner_id = auth.uid()
        )
    );

-- 4. Platform-Wide Super-Admin Settings (Main Deriv App ID + Markup & Commission Share)
create table if not exists public.studio_platform_settings (
    id integer primary key default 1 check (id = 1),
    pooled_deriv_app_id text not null default '',
    platform_markup_pct numeric not null default 2.0,
    default_commission_share_pct numeric not null default 50,
    base_domain text not null default 'vercel.app',
    allow_public_signups boolean not null default true,
    oauth_callback_hub_url text not null default '',
    tenant_template_base_url text not null default '',
    updated_at timestamptz not null default now()
);

alter table public.studio_platform_settings add column if not exists platform_markup_pct numeric not null default 2.0;
alter table public.studio_platform_settings add column if not exists oauth_callback_hub_url text not null default '';

alter table public.studio_platform_settings enable row level security;

drop policy if exists "studio_platform_settings_public_read" on public.studio_platform_settings;
create policy "studio_platform_settings_public_read"
    on public.studio_platform_settings for select
    using (true);

drop policy if exists "studio_platform_settings_admin_write" on public.studio_platform_settings;
create policy "studio_platform_settings_admin_write"
    on public.studio_platform_settings for all
    using (public.is_studio_super_admin())
    with check (public.is_studio_super_admin());

insert into public.studio_platform_settings (
    id,
    pooled_deriv_app_id,
    platform_markup_pct,
    default_commission_share_pct,
    base_domain,
    allow_public_signups,
    oauth_callback_hub_url
)
values (1, '', 2.0, 50, 'vercel.app', true, '')
on conflict (id) do nothing;

-- 5. Operator Payout Audit History (`managed_site_payouts`)
create table if not exists public.managed_site_payouts (
    id uuid primary key default gen_random_uuid(),
    site_id uuid not null references public.managed_sites(id) on delete cascade,
    owner_id uuid not null references auth.users(id) on delete cascade,
    owner_email text not null default '',
    site_url text not null default '',
    payout_method text not null default '',
    payout_wallet text not null default '',
    amount_usd numeric not null default 0,
    trades_count integer not null default 0,
    reference_note text not null default '',
    paid_at timestamptz not null default now()
);

create index if not exists idx_managed_site_payouts_owner on public.managed_site_payouts(owner_id, paid_at desc);
create index if not exists idx_managed_site_payouts_site on public.managed_site_payouts(site_id, paid_at desc);

alter table public.managed_site_payouts enable row level security;

drop policy if exists "managed_site_payouts_select_owner_or_admin" on public.managed_site_payouts;
create policy "managed_site_payouts_select_owner_or_admin"
    on public.managed_site_payouts for select
    using (auth.uid() = owner_id or public.is_studio_super_admin());

drop policy if exists "managed_site_payouts_admin_write" on public.managed_site_payouts;
create policy "managed_site_payouts_admin_write"
    on public.managed_site_payouts for all
    using (public.is_studio_super_admin())
    with check (public.is_studio_super_admin());

-- 6. Real-Trade Commission Ledger (`managed_site_commissions`)
-- Server-side trigger calculates markup + operator share from authoritative DB settings
-- and rejects virtual/demo accounts (VRTC*).
create table if not exists public.managed_site_commissions (
    id uuid primary key default gen_random_uuid(),
    site_id uuid not null references public.managed_sites(id) on delete cascade,
    owner_id uuid not null references auth.users(id) on delete cascade,
    site_slug text not null,
    contract_id text not null unique,
    transaction_id text not null default '',
    trader_loginid text not null,
    currency text not null default 'USD',
    contract_type text not null default '',
    symbol text not null default '',
    stake_amount numeric not null check (stake_amount > 0),
    markup_pct numeric not null default 2.0,
    operator_share_pct numeric not null default 50.0,
    gross_markup_usd numeric not null default 0,
    operator_commission_usd numeric not null default 0,
    admin_net_usd numeric not null default 0,
    payout_status text not null default 'unpaid' check (payout_status in ('unpaid', 'paid')),
    payout_id uuid references public.managed_site_payouts(id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists idx_managed_site_commissions_site on public.managed_site_commissions(site_id, payout_status, created_at desc);
create index if not exists idx_managed_site_commissions_owner on public.managed_site_commissions(owner_id, payout_status, created_at desc);

create or replace function public.compute_managed_site_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_site record;
    v_markup numeric;
    v_share numeric;
begin
    -- Never record demo / virtual trades
    if new.trader_loginid is null or new.trader_loginid ~* '^(VRTC|VRT)' then
        raise exception 'Demo account trades are excluded from real commission ledger';
    end if;

    select id, owner_id, slug, commission_share_pct, status
    into v_site
    from public.managed_sites
    where id = new.site_id
    limit 1;

    if v_site.id is null or v_site.status <> 'active' then
        raise exception 'Inactive or unknown tenant site';
    end if;

    select coalesce(platform_markup_pct, 2.0)
    into v_markup
    from public.studio_platform_settings
    where id = 1;

    v_markup := coalesce(v_markup, 2.0);
    v_share := coalesce(v_site.commission_share_pct, 50.0);

    new.owner_id := v_site.owner_id;
    new.site_slug := v_site.slug;
    new.markup_pct := v_markup;
    new.operator_share_pct := v_share;
    new.gross_markup_usd := round((new.stake_amount * (v_markup / 100.0))::numeric, 4);
    new.operator_commission_usd := round((new.gross_markup_usd * (v_share / 100.0))::numeric, 4);
    new.admin_net_usd := round((new.gross_markup_usd - new.operator_commission_usd)::numeric, 4);
    new.payout_status := 'unpaid';
    new.payout_id := null;

    return new;
end;
$$;

drop trigger if exists trg_compute_managed_site_commission on public.managed_site_commissions;
create trigger trg_compute_managed_site_commission
    before insert on public.managed_site_commissions
    for each row execute function public.compute_managed_site_commission();

alter table public.managed_site_commissions enable row level security;

drop policy if exists "managed_site_commissions_public_insert" on public.managed_site_commissions;
create policy "managed_site_commissions_public_insert"
    on public.managed_site_commissions for insert
    with check (
        stake_amount > 0
        and trader_loginid !~* '^(VRTC|VRT)'
        and exists (
            select 1 from public.managed_sites s
            where s.id = site_id
              and s.status = 'active'
        )
    );

drop policy if exists "managed_site_commissions_select_owner_or_admin" on public.managed_site_commissions;
create policy "managed_site_commissions_select_owner_or_admin"
    on public.managed_site_commissions for select
    using (auth.uid() = owner_id or public.is_studio_super_admin());

drop policy if exists "managed_site_commissions_admin_update" on public.managed_site_commissions;
create policy "managed_site_commissions_admin_update"
    on public.managed_site_commissions for update
    using (public.is_studio_super_admin())
    with check (public.is_studio_super_admin());

drop policy if exists "managed_site_commissions_admin_delete" on public.managed_site_commissions;
create policy "managed_site_commissions_admin_delete"
    on public.managed_site_commissions for delete
    using (public.is_studio_super_admin());

-- 7. Supabase Storage Bucket & Policies for Tenant Logos (`studio-assets`)
insert into storage.buckets (id, name, public)
values ('studio-assets', 'studio-assets', true)
on conflict (id) do nothing;

do $$
begin
    drop policy if exists "studio_assets_public_read" on storage.objects;
    create policy "studio_assets_public_read"
        on storage.objects for select
        using (bucket_id = 'studio-assets');

    drop policy if exists "studio_assets_operator_upload" on storage.objects;
    create policy "studio_assets_operator_upload"
        on storage.objects for insert
        to authenticated
        with check (
            bucket_id = 'studio-assets'
            and (storage.foldername(name))[1] = auth.uid()::text
        );

    drop policy if exists "studio_assets_operator_update" on storage.objects;
    create policy "studio_assets_operator_update"
        on storage.objects for update
        to authenticated
        using (
            bucket_id = 'studio-assets'
            and (storage.foldername(name))[1] = auth.uid()::text
        );
exception
    when others then
        raise notice 'Skipped storage.objects policies: %', sqlerrm;
end;
$$;

-- 8. Explicit API Role Grants & PostgREST Schema Cache Reload
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.studio_profiles to anon, authenticated;
grant select, insert, update, delete on public.managed_sites to anon, authenticated;
grant select, insert, update, delete on public.managed_site_bots to anon, authenticated;
grant select, insert, update, delete on public.studio_platform_settings to anon, authenticated;
grant select, insert, update, delete on public.managed_site_commissions to anon, authenticated;
grant select, insert, update, delete on public.managed_site_payouts to anon, authenticated;

notify pgrst, 'reload schema';
