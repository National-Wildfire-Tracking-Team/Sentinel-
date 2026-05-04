-- ═══════════════════════════════════════════════════════════════════════════
-- Sentinel – Reporter Submission System Schema
-- Run this in the Supabase SQL Editor once to provision the backend.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. profiles table (user roles) ────────────────────────────────────────
-- Every auth.users row gets a matching profiles row via a trigger.
-- Default role: "public". Reporters register via /reporter-register and get
-- role='reporter' set at signup via user metadata. Admins must be promoted
-- manually by an existing admin (or via the SQL console).
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  role        text not null default 'public'
                check (role in ('public','reporter','admin')),
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

-- Auto-create a profile row for every new signup.
-- Reads `intended_role` from signup metadata so the reporter registration page
-- can request role='reporter' at creation time. Only 'public' and 'reporter'
-- are accepted via metadata — 'admin' must always be promoted manually.
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

-- Only reporters and admins can insert their OWN reports
drop policy if exists "reports insert own" on public.fire_reports;
create policy "reports insert own"
  on public.fire_reports for insert
  with check (
    auth.uid() = user_id
    and status in ('approved','pending')
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- Only admins can change status (approve / reject)
drop policy if exists "reports admin update" on public.fire_reports;
create policy "reports admin update"
  on public.fire_reports for update
  using (public.is_admin())
  with check (public.is_admin());

-- Reporters and admins can update details for their own fires (description/title/location),
-- but cannot reassign ownership. Users with role='public' have no write access.
drop policy if exists "reports update own details" on public.fire_reports;
create policy "reports update own details"
  on public.fire_reports for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- Reporters and admins can delete their own fire report entries.
drop policy if exists "reports delete own" on public.fire_reports;
create policy "reports delete own"
  on public.fire_reports for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );


-- ─── 4. incident_updates table (timeline feed) ────────────────────────────
create table if not exists public.incident_updates (
  id            uuid primary key default gen_random_uuid(),
  incident_id   text not null,
  incident_name text,
  content       text not null,
  source_type   text not null default 'reporter'
                  check (source_type in ('reporter','automated')),
  source_name   text not null,
  user_id       uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists incident_updates_incident_idx
  on public.incident_updates(incident_id);

create index if not exists incident_updates_created_idx
  on public.incident_updates(created_at desc);

-- RLS for incident_updates
alter table public.incident_updates enable row level security;

-- Anyone can read updates (public timeline)
drop policy if exists "updates public read" on public.incident_updates;
create policy "updates public read"
  on public.incident_updates for select
  using (true);

-- Only reporters and admins can insert their own updates
drop policy if exists "updates insert own" on public.incident_updates;
create policy "updates insert own"
  on public.incident_updates for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- Reporters and admins can update their own updates
drop policy if exists "updates update own" on public.incident_updates;
create policy "updates update own"
  on public.incident_updates for update
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- Reporters and admins can delete their own updates
drop policy if exists "updates delete own" on public.incident_updates;
create policy "updates delete own"
  on public.incident_updates for delete
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- Admins can manage all updates
drop policy if exists "updates admin all" on public.incident_updates;
create policy "updates admin all"
  on public.incident_updates for all
  using (public.is_admin())
  with check (public.is_admin());

-- Automated sources can insert via service role (no user_id required)
drop policy if exists "updates automated insert" on public.incident_updates;
create policy "updates automated insert"
  on public.incident_updates for insert
  with check (source_type = 'automated' and user_id is null);


-- ─── 5. saved_locations table ─────────────────────────────────────────────────
-- Authenticated users can save up to FREE_LOCATION_LIMIT (4) named locations
-- and receive fire/weather alert summaries for each.
create table if not exists public.saved_locations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  address        text not null default '',
  latitude       double precision not null,
  longitude      double precision not null,
  alerts_enabled boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists saved_locations_user_idx
  on public.saved_locations(user_id);

alter table public.saved_locations enable row level security;

-- Users can only read, insert, update, and delete their own saved locations.
drop policy if exists "saved_locations own" on public.saved_locations;
create policy "saved_locations own"
  on public.saved_locations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- ─── 6. Realtime ───────────────────────────────────────────────────────────
-- Enable realtime on fire_reports so map clients receive approval events.
alter publication supabase_realtime add table public.fire_reports;

-- Enable realtime on incident_updates for live timeline feeds.
alter publication supabase_realtime add table public.incident_updates;
