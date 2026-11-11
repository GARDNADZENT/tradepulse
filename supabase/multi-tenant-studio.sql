-- =============================================================================
-- TradersPulse Site Studio — Multi-Tenant SaaS Control Plane Schema (Supabase)
-- Paste this ENTIRE script into the Supabase SQL Editor and click "Run".
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

-- Security-definer helper so RLS policies can check super_admin without recursion
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

-- Auto-provision operator profile on Supabase Auth sign-up (Email or Google OAuth)
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
        -- First registered user automatically becomes super_admin if none exists yet
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

-- Backfill any existing users already in auth.users (earliest user gets super_admin if none exists)
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

-- 2. Managed Trading Sites (Multi-Tenant Configuration)
create table if not exists public.managed_sites (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null references auth.users(id) on delete cascade,
    owner_email text,
    slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$'),
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
    commission_share_pct numeric not null default 20,
    monthly_visits integer not null default 0,
    monthly_bot_runs integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_managed_sites_owner on public.managed_sites(owner_id);
create index if not exists idx_managed_sites_domain on public.managed_sites(lower(custom_domain));
create index if not exists idx_managed_sites_slug on public.managed_sites(lower(slug));

alter table public.managed_sites enable row level security;

drop policy if exists "managed_sites_public_read" on public.managed_sites;
create policy "managed_sites_public_read"
    on public.managed_sites for select
    using (true);

drop policy if exists "managed_sites_operator_insert" on public.managed_sites;
create policy "managed_sites_operator_insert"
    on public.managed_sites for insert
    with check (
        public.is_studio_super_admin()
        or (
            auth.uid() = owner_id
            and status in ('active', 'maintenance')
        )
    );

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

-- 4. Platform-Wide Super-Admin Settings
create table if not exists public.studio_platform_settings (
    id integer primary key default 1 check (id = 1),
    pooled_deriv_app_id text not null default '',
    default_commission_share_pct numeric not null default 20,
    base_domain text not null default 'traderspulse.site',
    allow_public_signups boolean not null default true,
    tenant_template_base_url text not null default 'https://tradepulse-lovat.vercel.app',
    updated_at timestamptz not null default now()
);

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
    default_commission_share_pct,
    base_domain,
    allow_public_signups,
    tenant_template_base_url
)
values (
    1,
    '',
    20,
    'traderspulse.site',
    true,
    'https://tradepulse-lovat.vercel.app'
)
on conflict (id) do update
set tenant_template_base_url = case
    when public.studio_platform_settings.tenant_template_base_url = ''
        then excluded.tenant_template_base_url
    else public.studio_platform_settings.tenant_template_base_url
end;

-- 5. Supabase Storage Bucket & Policies for Tenant Logos (`studio-assets`)
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

-- 6. Explicit API Role Grants & PostgREST Schema Cache Reload
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.studio_profiles to anon, authenticated;
grant select, insert, update, delete on public.managed_sites to anon, authenticated;
grant select, insert, update, delete on public.managed_site_bots to anon, authenticated;
grant select, insert, update, delete on public.studio_platform_settings to anon, authenticated;

notify pgrst, 'reload schema';
