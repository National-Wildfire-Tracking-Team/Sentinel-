-- ═══════════════════════════════════════════════════════════════════════════
-- Reporter-drawn evacuation zones
-- Allows reporters (and admins) to draw and publish polygon evacuation zones
-- directly on the map. Zones are stored as GeoJSON geometry.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.reporter_evac_zones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  zone_type    text not null default 'Evacuation Order'
                 check (zone_type in ('Evacuation Order', 'Evacuation Warning', 'Evacuation Watch')),
  geometry     jsonb not null,           -- GeoJSON Polygon or MultiPolygon
  incident_name text,                    -- Optional: linked fire/incident name
  county       text,
  state        text,
  status       text not null default 'active'
                 check (status in ('active', 'lifted', 'expired')),
  effective_at timestamptz not null default now(),
  expires_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists reporter_evac_zones_user_idx
  on public.reporter_evac_zones(user_id);

create index if not exists reporter_evac_zones_status_idx
  on public.reporter_evac_zones(status);

create index if not exists reporter_evac_zones_created_idx
  on public.reporter_evac_zones(created_at desc);

-- Keep updated_at current automatically
create or replace function public.touch_reporter_evac_zones()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_reporter_evac_zones_updated on public.reporter_evac_zones;
create trigger trg_reporter_evac_zones_updated
  before update on public.reporter_evac_zones
  for each row execute function public.touch_reporter_evac_zones();

-- ─── Row Level Security ─────────────────────────────────────────────────────
alter table public.reporter_evac_zones enable row level security;

-- Anyone (including anonymous) can read active zones for the public map
drop policy if exists "evac_zones public read active" on public.reporter_evac_zones;
create policy "evac_zones public read active"
  on public.reporter_evac_zones for select
  using (status = 'active');

-- Reporters and admins can read all their own zones (any status)
drop policy if exists "evac_zones read own" on public.reporter_evac_zones;
create policy "evac_zones read own"
  on public.reporter_evac_zones for select
  using (auth.uid() = user_id);

-- Admins can read every zone
drop policy if exists "evac_zones admin read all" on public.reporter_evac_zones;
create policy "evac_zones admin read all"
  on public.reporter_evac_zones for select
  using (public.is_admin());

-- Only reporters and admins may insert (checked by profile role)
drop policy if exists "evac_zones reporter insert" on public.reporter_evac_zones;
create policy "evac_zones reporter insert"
  on public.reporter_evac_zones for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('reporter', 'admin')
    )
  );

-- Reporters can update/delete only their own zones
drop policy if exists "evac_zones update own" on public.reporter_evac_zones;
create policy "evac_zones update own"
  on public.reporter_evac_zones for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "evac_zones delete own" on public.reporter_evac_zones;
create policy "evac_zones delete own"
  on public.reporter_evac_zones for delete
  using (auth.uid() = user_id);

-- Admins can manage all zones
drop policy if exists "evac_zones admin all" on public.reporter_evac_zones;
create policy "evac_zones admin all"
  on public.reporter_evac_zones for all
  using (public.is_admin())
  with check (public.is_admin());

-- Enable realtime so the live map updates instantly when zones are published
alter publication supabase_realtime add table public.reporter_evac_zones;
