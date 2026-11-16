-- Server-only, atomic usage limits. Store keyed IP hashes, never raw addresses.
create table if not exists public.ai_developer_quota (
  bucket text primary key,
  window_start timestamptz not null,
  count integer not null check (count >= 0)
);
alter table public.ai_developer_quota enable row level security;
revoke all on public.ai_developer_quota from public, anon, authenticated;

create or replace function public.consume_ai_developer_quota(client_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare
  now_time timestamptz := clock_timestamp();
  global_row public.ai_developer_quota%rowtype;
  client_row public.ai_developer_quota%rowtype;
  client_key text;
begin
  if client_hash is null or client_hash !~ '^[0-9a-f]{64}$' then return false; end if;
  client_key := 'client:' || client_hash;
  insert into public.ai_developer_quota values ('global', now_time, 0) on conflict do nothing;
  insert into public.ai_developer_quota values (client_key, now_time, 0) on conflict do nothing;
  select * into global_row from public.ai_developer_quota where bucket = 'global' for update;
  select * into client_row from public.ai_developer_quota where bucket = client_key for update;
  if global_row.window_start <= now_time - interval '1 day' then global_row.window_start := now_time; global_row.count := 0; end if;
  if client_row.window_start <= now_time - interval '1 minute' then client_row.window_start := now_time; client_row.count := 0; end if;
  if global_row.count >= 100 or client_row.count >= 5 then return false; end if;
  update public.ai_developer_quota set window_start = global_row.window_start, count = global_row.count + 1 where bucket = 'global';
  update public.ai_developer_quota set window_start = client_row.window_start, count = client_row.count + 1 where bucket = client_key;
  return true;
end;
$$;
revoke all on function public.consume_ai_developer_quota(text) from public, anon, authenticated;
grant execute on function public.consume_ai_developer_quota(text) to service_role;
