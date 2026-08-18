-- Supabase journeys table migration
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/zvbeggqktvkwvpupjgfk/sql

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

create index if not exists idx_journeys_loginid on public.journeys(loginid);
create index if not exists idx_journeys_updated_at on public.journeys(updated_at desc);

-- Optional: enable Row Level Security
-- alter table public.journeys enable row level security;

-- Optional: allow public access for demo purposes
-- create policy "Enable read access for all users" on public.journeys for select using (true);
-- create policy "Enable insert for all users" on public.journeys for insert with check (true);
-- create policy "Enable update for all users" on public.journeys for update using (true);
-- create policy "Enable delete for all users" on public.journeys for delete using (true);
