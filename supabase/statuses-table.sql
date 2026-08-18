-- Supabase table for storing app status
-- Run this in Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

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

-- Optional: enable Row Level Security if needed
-- alter table public.statuses enable row level security;

-- Optional: allow public access for demo purposes (replace with proper auth in production)
-- create policy "Enable read access for all users" on public.statuses for select using (true);
-- create policy "Enable insert for all users" on public.statuses for insert with check (true);
-- create policy "Enable update for all users" on public.statuses for update using (true);
