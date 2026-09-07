-- ═══════════════════════════════════════════════════════════════════════════
-- Disaster Response volunteer program: volunteer profiles, deployments,
-- and deployment sign-ups. Replaces the standalone nwttdisasterops.org site —
-- "volunteer" is not a profiles.role tier, it's simply any authenticated user
-- who has filled out a volunteer_profiles row.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. volunteer_profiles ─────────────────────────────────────────────────
-- One row per user. Its existence is what makes a user a "volunteer" —
-- required before they can sign up for a deployment.
create table if not exists public.volunteer_profiles (
  user_id                 uuid primary key references auth.users(id) on delete cascade,
  full_name               text not null,
  phone                   text not null,
  date_of_birth           date,
  age_confirmed           boolean not null default false,
  skills                  text not null default '',
  availability            text not null default '',
  emergency_contact_name  text not null default '',
  emergency_contact_phone text not null default '',
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

alter table public.volunteer_profiles enable row level security;

-- Users manage only their own volunteer profile.
drop policy if exists "volunteer_profiles own" on public.volunteer_profiles;
create policy "volunteer_profiles own"
  on public.volunteer_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can read every volunteer profile (coordination/roster).
drop policy if exists "volunteer_profiles admin read" on public.volunteer_profiles;
create policy "volunteer_profiles admin read"
  on public.volunteer_profiles for select
  using (public.is_admin());


-- ─── 2. deployments ────────────────────────────────────────────────────────
-- Admin-managed listing of disaster-response deployment opportunities.
create table if not exists public.deployments (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  hazard_type  text not null default 'General Deployment',
  description  text not null default '',
  location     text not null default '',
  start_date   date not null,
  start_time   text not null default '',
  end_date     date,
  capacity     integer,
  status       text not null default 'upcoming'
                 check (status in ('upcoming','active','completed','cancelled')),
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists deployments_status_idx     on public.deployments(status);
create index if not exists deployments_start_date_idx on public.deployments(start_date);

alter table public.deployments enable row level security;

-- Anyone (even signed-out visitors) can browse deployments.
drop policy if exists "deployments public read" on public.deployments;
create policy "deployments public read"
  on public.deployments for select
  using (true);

-- Only admins create/edit/cancel deployments.
drop policy if exists "deployments admin write" on public.deployments;
create policy "deployments admin write"
  on public.deployments for all
  using (public.is_admin())
  with check (public.is_admin());


-- ─── 3. deployment_signups ─────────────────────────────────────────────────
-- A volunteer signing up for a deployment. Referencing volunteer_profiles
-- (rather than auth.users directly) enforces "must have a volunteer profile
-- before signing up" at the database level, and gives us a real FK for
-- PostgREST to embed volunteer details in admin queries.
create table if not exists public.deployment_signups (
  id             uuid primary key default gen_random_uuid(),
  deployment_id  uuid not null references public.deployments(id) on delete cascade,
  user_id        uuid not null references public.volunteer_profiles(user_id) on delete cascade,
  role_interest  text not null default '',
  notes          text not null default '',
  created_at     timestamptz not null default now(),
  unique (deployment_id, user_id)
);

create index if not exists deployment_signups_deployment_idx on public.deployment_signups(deployment_id);
create index if not exists deployment_signups_user_idx       on public.deployment_signups(user_id);

alter table public.deployment_signups enable row level security;

-- Volunteers manage only their own sign-ups.
drop policy if exists "deployment_signups own" on public.deployment_signups;
create policy "deployment_signups own"
  on public.deployment_signups for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Admins can read every sign-up (deployment rosters).
drop policy if exists "deployment_signups admin read" on public.deployment_signups;
create policy "deployment_signups admin read"
  on public.deployment_signups for select
  using (public.is_admin());
