-- Supabase journeys table migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/zvbeggqktvkwvpupjgfk/sql

-- Create table if it doesn't exist
create table if not exists public.journeys (
    id uuid primary key default gen_random_uuid(),
    loginid text not null unique,
    initial_balance numeric not null default 0,
    daily_target_pct numeric not null default 5,
    cycle_length_days integer not null default 30,
    start_date text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

-- If the table already exists but with different columns, add missing ones
do $$
begin
    -- Add loginid column if it doesn't exist
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'journeys'
        and column_name = 'loginid'
    ) then
        alter table public.journeys add column loginid text;
    end if;

    -- Add initial_balance column if it doesn't exist
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'journeys'
        and column_name = 'initial_balance'
    ) then
        alter table public.journeys add column initial_balance numeric not null default 0;
    end if;

    -- Add daily_target_pct column if it doesn't exist
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'journeys'
        and column_name = 'daily_target_pct'
    ) then
        alter table public.journeys add column daily_target_pct numeric not null default 5;
    end if;

    -- Add cycle_length_days column if it doesn't exist
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'journeys'
        and column_name = 'cycle_length_days'
    ) then
        alter table public.journeys add column cycle_length_days integer not null default 30;
    end if;

    -- Add start_date column if it doesn't exist
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'journeys'
        and column_name = 'start_date'
    ) then
        alter table public.journeys add column start_date text not null default '';
    end if;

    -- Add created_at column if it doesn't exist
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'journeys'
        and column_name = 'created_at'
    ) then
        alter table public.journeys add column created_at timestamptz not null default now();
    end if;

    -- Add updated_at column if it doesn't exist
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'journeys'
        and column_name = 'updated_at'
    ) then
        alter table public.journeys add column updated_at timestamptz not null default now();
    end if;

    -- Make loginid unique if it's not already
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
        and table_name = 'journeys'
        and column_name = 'loginid'
    ) then
        begin
            create unique index if not exists idx_journeys_loginid on public.journeys(loginid);
        exception
            when duplicate_table then null;
            when duplicate_object then null;
        end;
    end if;

    -- Create updated_at index if it doesn't exist
    create index if not exists idx_journeys_updated_at on public.journeys(updated_at desc);
end $$;
