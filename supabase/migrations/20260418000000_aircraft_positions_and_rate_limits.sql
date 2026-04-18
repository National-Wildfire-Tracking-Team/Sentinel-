-- ─── aircraft_positions ──────────────────────────────────────────────────────
-- Stores the latest snapshot of airborne aircraft fetched from OpenSky Network.
-- Upserted by the opensky-proxy edge function; read by the frontend map layer.
create table if not exists public.aircraft_positions (
  icao24          text primary key,
  callsign        text,
  origin_country  text,
  longitude       double precision,
  latitude        double precision,
  baro_altitude   double precision,
  on_ground       boolean,
  velocity        double precision,
  true_track      double precision default 0,
  vertical_rate   double precision,
  squawk          text,
  category        integer,
  fetched_at      timestamptz not null default now()
);

create index if not exists aircraft_positions_fetched_at_idx
  on public.aircraft_positions (fetched_at desc);

alter table public.aircraft_positions enable row level security;

-- Public (anon) can read – same as other map data layers
drop policy if exists "aircraft public read" on public.aircraft_positions;
create policy "aircraft public read"
  on public.aircraft_positions for select
  using (true);

-- Only the service role (edge function) may write
drop policy if exists "aircraft service write" on public.aircraft_positions;
create policy "aircraft service write"
  on public.aircraft_positions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Enable realtime so frontend receives live push updates
alter publication supabase_realtime add table public.aircraft_positions;


-- ─── api_rate_limits ─────────────────────────────────────────────────────────
-- Persists sliding-window timestamps for each external API so the rate limit
-- is enforced globally across all edge function instances.
create table if not exists public.api_rate_limits (
  id          text primary key,          -- e.g. 'opensky'
  requests    jsonb not null default '[]'::jsonb,  -- array of epoch-ms timestamps
  updated_at  timestamptz not null default now()
);

alter table public.api_rate_limits enable row level security;

-- Only the service role may access rate limit records
drop policy if exists "rate limits service only" on public.api_rate_limits;
create policy "rate limits service only"
  on public.api_rate_limits for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

-- Seed the opensky row so the edge function can always SELECT it
insert into public.api_rate_limits (id, requests)
values ('opensky', '[]'::jsonb)
on conflict (id) do nothing;
