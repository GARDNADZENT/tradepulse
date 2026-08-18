-- Supabase journeys and journey_days tables migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/zvbeggqktvkwvpupjgfk/sql

-- Create journeys table if it doesn't exist
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

-- Create journey_days table if it doesn't exist
create table if not exists public.journey_days (
    id uuid not null default gen_random_uuid(),
    journey_id uuid not null,
    day_number integer not null,
    date date not null,
    expected_start numeric not null,
    expected_end numeric not null,
    actual_balance numeric null,
    status text not null default 'pending'::text,
    created_at timestamptz not null default now(),
    constraint journey_days_pkey primary key (id),
    constraint journey_days_journey_id_day_number_key unique (journey_id, day_number),
    constraint journey_days_journey_id_fkey foreign KEY (journey_id) references journeys (id) on delete CASCADE,
    constraint journey_days_day_number_check check ((day_number > 0)),
    constraint journey_days_status_check check (
        (
            status = any (
                array[
                    'pending'::text,
                    'completed'::text,
                    'missed'::text
                ]
            )
        )
    )
);

-- Create indexes
create index if not exists idx_journeys_loginid on public.journeys(loginid);
create index if not exists idx_journeys_updated_at on public.journeys(updated_at desc);
create index if not exists journey_days_journey_day_idx on public.journey_days using btree (journey_id, day_number);

-- Migrate existing journeys table if needed
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
