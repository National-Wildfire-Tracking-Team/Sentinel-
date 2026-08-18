-- ═══════════════════════════════════════════════════════════════════════════
-- Hazard events (generic incident dots)
-- Reporter/admin-submitted point events across hazard categories — wildfire,
-- flooding, hazmat, and other. Rendered on the map as category-colored dots.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.hazard_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category     text not null
                 check (category in ('wildfire', 'flooding', 'hazmat', 'other')),
  title        text not null,
  description  text not null default '',
  severity     text not null default 'moderate'
                 check (severity in ('low', 'moderate', 'high', 'critical')),
  latitude     double precision not null,
  longitude    double precision not null,
  status       text not null default 'active'
                 check (status in ('active', 'resolved')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists hazard_events_category_idx
  on public.hazard_events(category);

create index if not exists hazard_events_status_idx
  on public.hazard_events(status);

create index if not exists hazard_events_user_idx
  on public.hazard_events(user_id);

create index if not exists hazard_events_created_idx
  on public.hazard_events(created_at desc);

-- Keep updated_at current automatically
create or replace function public.touch_hazard_events()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_hazard_events_updated on public.hazard_events;
create trigger trg_hazard_events_updated
  before update on public.hazard_events
  for each row execute function public.touch_hazard_events();

-- ─── Row Level Security ─────────────────────────────────────────────────────
alter table public.hazard_events enable row level security;

-- Anyone (including anonymous) can read active events for the public map
drop policy if exists "hazard_events public read active" on public.hazard_events;
create policy "hazard_events public read active"
  on public.hazard_events for select
  using (status = 'active');

-- Reporters and admins can read all their own events (any status)
drop policy if exists "hazard_events read own" on public.hazard_events;
create policy "hazard_events read own"
  on public.hazard_events for select
  using (auth.uid() = user_id);

-- Admins can read every event
drop policy if exists "hazard_events admin read all" on public.hazard_events;
create policy "hazard_events admin read all"
  on public.hazard_events for select
  using (public.is_admin());

-- Only reporters and admins may insert (checked by profile role)
drop policy if exists "hazard_events reporter insert" on public.hazard_events;
create policy "hazard_events reporter insert"
  on public.hazard_events for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- Reporters can update/delete only their own events
drop policy if exists "hazard_events update own" on public.hazard_events;
create policy "hazard_events update own"
  on public.hazard_events for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "hazard_events delete own" on public.hazard_events;
create policy "hazard_events delete own"
  on public.hazard_events for delete
  using (auth.uid() = user_id);

-- Admins can manage all events
drop policy if exists "hazard_events admin all" on public.hazard_events;
create policy "hazard_events admin all"
  on public.hazard_events for all
  using (public.is_admin())
  with check (public.is_admin());

-- Enable realtime so the live map updates instantly when events are published
alter publication supabase_realtime add table public.hazard_events;
