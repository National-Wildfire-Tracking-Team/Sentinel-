-- ── Evacuations and shelters per incident ───────────────────────────────────
-- Structured evacuation levels and shelters for the incident detail panel,
-- so users can see zones, notes and where to go without leaving the sidebar.
-- incident_id is text to match incident_updates (fire_reports uuid, IRWIN id,
-- or CAL FIRE id). Public read; reporters/admins write (same model as
-- incident_updates). Both tables are on the realtime publication so the
-- panel updates live.

-- ── incident_evacuations ────────────────────────────────────────────────────
-- At most one row per (incident, level): the Order card and the Warning card.
-- links: [{ "label": "Genasys evacuation map", "url": "https://..." }, ...]
create table if not exists public.incident_evacuations (
  id          uuid primary key default gen_random_uuid(),
  incident_id text not null,
  level       text not null check (level in ('order', 'warning')),
  zones       text[] not null default '{}',
  notes       text,
  links       jsonb not null default '[]'::jsonb
                check (jsonb_typeof(links) = 'array'),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (incident_id, level)
);

create index if not exists incident_evacuations_created_by_idx
  on public.incident_evacuations(created_by);

drop trigger if exists incident_evacuations_updated_at on public.incident_evacuations;
create trigger incident_evacuations_updated_at
  before update on public.incident_evacuations
  for each row execute function public.set_updated_at();

alter table public.incident_evacuations enable row level security;

drop policy if exists "evacuations public read" on public.incident_evacuations;
create policy "evacuations public read"
  on public.incident_evacuations for select
  using (true);

drop policy if exists "evacuations reporter insert" on public.incident_evacuations;
create policy "evacuations reporter insert"
  on public.incident_evacuations for insert
  to authenticated
  with check ((select public.is_reporter_or_admin()));

drop policy if exists "evacuations reporter update" on public.incident_evacuations;
create policy "evacuations reporter update"
  on public.incident_evacuations for update
  to authenticated
  using ((select public.is_reporter_or_admin()))
  with check ((select public.is_reporter_or_admin()));

drop policy if exists "evacuations reporter delete" on public.incident_evacuations;
create policy "evacuations reporter delete"
  on public.incident_evacuations for delete
  to authenticated
  using ((select public.is_reporter_or_admin()));


-- ── incident_shelters ───────────────────────────────────────────────────────
create table if not exists public.incident_shelters (
  id          uuid primary key default gen_random_uuid(),
  incident_id text not null,
  kind        text not null default 'evacuation_center'
                check (kind in ('evacuation_center', 'large_animals', 'small_animals', 'other')),
  name        text not null check (length(btrim(name)) between 1 and 200),
  address     text,
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  status_note text,
  sort_order  integer not null default 0,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists incident_shelters_incident_idx
  on public.incident_shelters(incident_id, sort_order);

create index if not exists incident_shelters_created_by_idx
  on public.incident_shelters(created_by);

drop trigger if exists incident_shelters_updated_at on public.incident_shelters;
create trigger incident_shelters_updated_at
  before update on public.incident_shelters
  for each row execute function public.set_updated_at();

alter table public.incident_shelters enable row level security;

drop policy if exists "shelters public read" on public.incident_shelters;
create policy "shelters public read"
  on public.incident_shelters for select
  using (true);

drop policy if exists "shelters reporter insert" on public.incident_shelters;
create policy "shelters reporter insert"
  on public.incident_shelters for insert
  to authenticated
  with check ((select public.is_reporter_or_admin()));

drop policy if exists "shelters reporter update" on public.incident_shelters;
create policy "shelters reporter update"
  on public.incident_shelters for update
  to authenticated
  using ((select public.is_reporter_or_admin()))
  with check ((select public.is_reporter_or_admin()));

drop policy if exists "shelters reporter delete" on public.incident_shelters;
create policy "shelters reporter delete"
  on public.incident_shelters for delete
  to authenticated
  using ((select public.is_reporter_or_admin()));


-- ── Realtime ────────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incident_evacuations'
  ) then
    alter publication supabase_realtime add table public.incident_evacuations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'incident_shelters'
  ) then
    alter publication supabase_realtime add table public.incident_shelters;
  end if;
end
$$;
