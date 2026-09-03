-- ═══════════════════════════════════════════════════════════════════════════
-- NEXRAD Level II radar — rolling scan history (up to ~2 hours) per
-- site+product, powering the site radar popup's history scrub bar.
-- Complements nexrad_scan_meta (which only ever holds the single latest scan,
-- used for the live view) — every scan the ingestion script
-- (scripts/nexrad-radar-sync.mjs) publishes is also appended here, and rows
-- past the retention window are pruned by that same script on each run.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.nexrad_scan_history (
  id                  bigint generated always as identity primary key,
  site_id             text not null,
  product             text not null check (product in ('reflectivity', 'velocity')),
  scan_time           timestamptz not null,
  elevation_deg       numeric not null,
  storage_path        text not null,
  byte_size           integer,
  gate_count          integer,
  radial_count        integer,
  created_at          timestamptz not null default now(),
  unique (site_id, product, scan_time)
);

-- Powers "give me every scan for this site+product in the last 2 hours".
create index if not exists nexrad_scan_history_lookup_idx
  on public.nexrad_scan_history(site_id, product, scan_time desc);

-- Powers the ingestion script's prune-by-age pass.
create index if not exists nexrad_scan_history_scan_time_idx
  on public.nexrad_scan_history(scan_time);

alter table public.nexrad_scan_history enable row level security;

-- Public map data — anyone (including anonymous) can read scan history
drop policy if exists "nexrad_scan_history public read" on public.nexrad_scan_history;
create policy "nexrad_scan_history public read"
  on public.nexrad_scan_history for select
  using (true);

-- No insert/update/delete policies: only the service-role key (used by the
-- ingestion script) can write here, including pruning stale rows.
