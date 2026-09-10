-- ═══════════════════════════════════════════════════════════════════════════
-- NOAA MRMS composite radar — frame metadata + rolling history.
-- Fully independent of the NEXRAD Level II tables (nexrad_scan_meta,
-- nexrad_scan_history) and storage bucket (nexrad-scans) — separate source,
-- separate decoder, separate geometry (regular lat/lon grid, not polar
-- radials), so kept as its own storage/schema per Sentinel's radar
-- architecture (Composite Radar and NEXRAD Level II are permanently
-- independent layers).
--
-- Actual decoded frame bytes live in Supabase Storage (bucket "mrms-scans");
-- these tables only point at them. Writes come exclusively from the
-- service-role ingestion script (scripts/mrms-radar-sync.mjs) — never
-- directly from the browser.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.mrms_frame_meta (
  product             text primary key,
  source_time         timestamptz,
  ingested_at         timestamptz,
  source_file         text,
  storage_path        text,
  byte_size           integer,
  grid_width          integer,
  grid_height         integer,
  west                numeric,
  east                numeric,
  south               numeric,
  north               numeric,
  processing_version  integer,
  decoder_version     text,
  status              text not null default 'ok' check (status in ('ok', 'error')),
  error_detail        text,
  last_attempt_at      timestamptz
);

alter table public.mrms_frame_meta enable row level security;

-- Public map data — anyone (including anonymous) can read the latest frame pointer
drop policy if exists "mrms_frame_meta public read" on public.mrms_frame_meta;
create policy "mrms_frame_meta public read"
  on public.mrms_frame_meta for select
  using (true);

-- No insert/update/delete policies: only the service-role key (used by the
-- ingestion script) can write here.

-- ─── Rolling frame history ───────────────────────────────────────────────────
-- Powers a future Composite Radar timeline/scrub UI (not built in this phase —
-- this table just accumulates real data so that's straightforward to add
-- later). Every successfully-published frame is appended here; rows past the
-- retention count (HISTORY_RETENTION_COUNT in the ingestion script) are
-- pruned by that same script on each run.

create table if not exists public.mrms_frame_history (
  id            bigint generated always as identity primary key,
  product       text not null,
  source_time   timestamptz not null,
  storage_path  text not null,
  byte_size     integer,
  created_at    timestamptz not null default now(),
  unique (product, source_time)
);

-- Powers "give me the N most recent frames for this product" and history-by-timestamp lookups.
create index if not exists mrms_frame_history_lookup_idx
  on public.mrms_frame_history(product, source_time desc);

alter table public.mrms_frame_history enable row level security;

-- Public map data — anyone (including anonymous) can read frame history
drop policy if exists "mrms_frame_history public read" on public.mrms_frame_history;
create policy "mrms_frame_history public read"
  on public.mrms_frame_history for select
  using (true);

-- No insert/update/delete policies: only the service-role key (used by the
-- ingestion script) can write here, including pruning stale rows.

-- ─── Storage bucket for encoded MRMS frame payloads ─────────────────────────
-- Public bucket: NOAA MRMS data is not sensitive, and public buckets serve
-- objects via a public URL without an RLS check, which is what the frontend
-- needs for repeated polling. Only the service-role sync script ever writes
-- to it (service role bypasses storage RLS entirely). Separate from the
-- "nexrad-scans" bucket per Sentinel's radar architecture.
insert into storage.buckets (id, name, public)
values ('mrms-scans', 'mrms-scans', true)
on conflict (id) do nothing;
