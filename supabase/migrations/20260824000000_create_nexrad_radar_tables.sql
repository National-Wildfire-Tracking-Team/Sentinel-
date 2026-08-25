-- ═══════════════════════════════════════════════════════════════════════════
-- NEXRAD Level II live radar — scan cache metadata + active-site tracking
-- Actual decoded scan bytes live in Supabase Storage (bucket "nexrad-scans");
-- this table only points at the latest object per site+product. Writes come
-- exclusively from the service-role ingestion script (scripts/nexrad-radar-sync.mjs)
-- and the nexrad-heartbeat edge function — never directly from the browser.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.nexrad_scan_meta (
  site_id             text not null,
  product             text not null check (product in ('reflectivity', 'velocity')),
  scan_time           timestamptz not null,
  elevation_deg       numeric not null,
  volume_scan_number  integer,
  storage_path        text not null,
  byte_size           integer,
  gate_count          integer,
  radial_count        integer,
  updated_at          timestamptz not null default now(),
  primary key (site_id, product)
);

create index if not exists nexrad_scan_meta_scan_time_idx
  on public.nexrad_scan_meta(scan_time desc);

alter table public.nexrad_scan_meta enable row level security;

-- Public map data — anyone (including anonymous) can read the latest scan pointer
drop policy if exists "nexrad_scan_meta public read" on public.nexrad_scan_meta;
create policy "nexrad_scan_meta public read"
  on public.nexrad_scan_meta for select
  using (true);

-- No insert/update/delete policies: only the service-role key (used by the
-- ingestion script) can write here.

-- ─── Active-site heartbeat tracking ─────────────────────────────────────────
-- Internal bookkeeping only — which sites a viewer currently has open, so the
-- ingestion cron only processes actively-viewed sites instead of all ~208.
-- Carries no information of value to end users, so it is not exposed via any
-- RLS policy at all (no public read, no public write).

create table if not exists public.nexrad_active_sites (
  site_id       text primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

alter table public.nexrad_active_sites enable row level security;
-- Intentionally zero policies: only the service role (heartbeat edge function
-- writes, sync script reads) can touch this table.

-- ─── Storage bucket for decoded scan payloads ───────────────────────────────
-- Public bucket: NWS radar data is not sensitive, and public buckets serve
-- objects via a public URL without an RLS check, which is what the frontend
-- needs for repeated polling. Only the service-role sync script ever writes
-- to it (service role bypasses storage RLS entirely).
insert into storage.buckets (id, name, public)
values ('nexrad-scans', 'nexrad-scans', true)
on conflict (id) do nothing;
