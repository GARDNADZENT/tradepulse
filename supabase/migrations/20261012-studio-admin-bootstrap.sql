-- Apply as a trusted database administrator after verifying the account email.
-- Signup never assigns elevated privileges. Existing other admins are not revoked.
create or replace function public.handle_new_studio_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare resolved_name text;
begin
    resolved_name := coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'operator'), '@', 1));
    insert into public.studio_profiles (id, email, display_name, full_name, role)
    values (new.id, coalesce(new.email, ''), resolved_name, resolved_name, 'operator')
    on conflict (id) do nothing;
    return new;
end;
$$;

-- This does nothing if the account has not registered and confirmed its email.
update public.studio_profiles p
set role = 'super_admin', updated_at = now()
from auth.users u
where p.id = u.id and lower(u.email) = 'gadnadolo19@gmail.com'
  and u.email_confirmed_at is not null;
