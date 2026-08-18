-- Supabase statuses table migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/zvbeggqktvkwvpupjgfk/sql

create table if not exists public.statuses (
    id uuid primary key default gen_random_uuid(),
    user_id text,
    status text not null,
    details jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_statuses_user_id on public.statuses(user_id);
create index if not exists idx_statuses_updated_at on public.statuses(updated_at desc);

-- If the table already exists but with different columns, add missing ones
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'statuses'
        and column_name = 'user_id'
    ) then
        alter table public.statuses add column user_id text;
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'statuses'
        and column_name = 'details'
    ) then
        alter table public.statuses add column details jsonb;
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'statuses'
        and column_name = 'created_at'
    ) then
        alter table public.statuses add column created_at timestamptz not null default now();
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'statuses'
        and column_name = 'updated_at'
    ) then
        alter table public.statuses add column updated_at timestamptz not null default now();
    end if;
end $$;
