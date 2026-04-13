-- ═══════════════════════════════════════════════════════════════════════════
-- Sentinel – Reporter Submission System Schema
-- Run this in the Supabase SQL Editor once to provision the backend.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. profiles table (user roles) ────────────────────────────────────────
-- Every auth.users row gets a matching profiles row via a trigger.
-- Default role: "reporter". Admins must be promoted manually by an existing
-- admin (or via the SQL console).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  role        text not null default 'reporter'
                check (role in ('reporter','admin')),
  created_at  timestamptz not null default now()
);

-- Helper: is the current auth user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Auto-create a profile row for every new signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'reporter')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ─── 2. fire_reports table ─────────────────────────────────────────────────
create table if not exists public.fire_reports (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text not null,
  latitude    double precision not null,
  longitude   double precision not null,
  status      text not null default 'approved'
                check (status in ('pending','approved','rejected')),
  created_at  timestamptz not null default now(),
  user_id     uuid not null references auth.users(id) on delete cascade
);

create index if not exists fire_reports_status_idx
  on public.fire_reports(status);

create index if not exists fire_reports_user_idx
  on public.fire_reports(user_id);


-- ─── 3. Row Level Security ─────────────────────────────────────────────────
alter table public.profiles     enable row level security;
alter table public.fire_reports enable row level security;

-- profiles: user can read their own profile; admins can read all
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());


-- fire_reports policies
-- Anyone (even anonymous visitors) can SELECT approved reports so the public
-- map can render them.
drop policy if exists "reports public read approved" on public.fire_reports;
create policy "reports public read approved"
  on public.fire_reports for select
  using (status = 'approved');

-- Logged-in users can read their own submissions (any status)
drop policy if exists "reports read own" on public.fire_reports;
create policy "reports read own"
  on public.fire_reports for select
  using (auth.uid() = user_id);

-- Admins can read everything
drop policy if exists "reports admin read all" on public.fire_reports;
create policy "reports admin read all"
  on public.fire_reports for select
  using (public.is_admin());

-- Logged-in users can insert their OWN reports
drop policy if exists "reports insert own" on public.fire_reports;
create policy "reports insert own"
  on public.fire_reports for insert
  with check (auth.uid() = user_id and status in ('approved','pending'));

-- Only admins can change status (approve / reject)
drop policy if exists "reports admin update" on public.fire_reports;
create policy "reports admin update"
  on public.fire_reports for update
  using (public.is_admin())
  with check (public.is_admin());

-- Reporters can update details for their own fires (description/title/location),
-- but cannot reassign ownership.
drop policy if exists "reports update own details" on public.fire_reports;
create policy "reports update own details"
  on public.fire_reports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ─── 4. Realtime ───────────────────────────────────────────────────────────
-- Enable realtime on fire_reports so map clients receive approval events.
alter publication supabase_realtime add table public.fire_reports;
