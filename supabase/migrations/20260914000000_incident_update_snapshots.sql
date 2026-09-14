-- ═══════════════════════════════════════════════════════════════════════════
-- Automated incident_updates entries (new-fire notices, containment/acreage/
-- status/personnel change notices) used to be generated client-side, by
-- useIncidents.js/useCalFireIncidents.js diffing each 5-minute poll against
-- an in-memory snapshot kept in the browser tab. That only worked while some
-- tab stayed open and foregrounded; once it closed, the automated feed went
-- silent for every incident, new or existing.
--
-- scripts/incident-updates-sync.mjs replaces this with a server-side cron
-- (see .github/workflows/incident-updates-sync.yml) that runs independently
-- of any browser. Since it's a stateless script invoked fresh every 5
-- minutes, it needs its own durable snapshot to diff against — this table
-- holds the last-seen field values per incident/source.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.incident_source_snapshot (
  source        text not null check (source in ('wfigs', 'calfire')),
  incident_id   text not null,
  incident_name text,
  contained     numeric,
  acres         numeric,
  status        text,
  personnel     integer,
  updated_at    timestamptz not null default now(),
  primary key (source, incident_id)
);

-- Internal sync state, not app data — only the service role (which bypasses
-- RLS) needs access, so RLS is enabled with no policies at all.
alter table public.incident_source_snapshot enable row level security;
