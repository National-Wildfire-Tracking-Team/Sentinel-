-- ─── Migration: Add 'public' as a valid profile role ──────────────────────
-- New users are now assigned role='public' by default instead of 'reporter'.
-- Reporters register via /reporter-register, which passes intended_role=
-- 'reporter' in signup metadata so the trigger assigns the correct role.
-- Existing 'reporter' users are unaffected.

-- 1. Drop the old CHECK constraint and add the new one that includes 'public'
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
    check (role in ('public', 'reporter', 'admin'));

-- 2. Change the column default from 'reporter' to 'public'
alter table public.profiles
  alter column role set default 'public';

-- 3. Replace the trigger function to read intended_role from signup metadata
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  v_role := coalesce(new.raw_user_meta_data->>'intended_role', 'public');
  if v_role not in ('public', 'reporter') then
    v_role := 'public';
  end if;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, v_role)
  on conflict (id) do nothing;
  return new;
end;
$$;
