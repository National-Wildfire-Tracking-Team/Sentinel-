-- ═══════════════════════════════════════════════════════════════════════════
-- Prevent duplicate automated "Status Update" timeline entries (e.g. WildCAD's
-- "New fire reported by WildCAD at ..." notice re-appearing every time the
-- client-side poller re-detects an incident it already reported). Each
-- automated update that should only ever exist once per incident now carries
-- a stable dedup_key; a partial unique index rejects re-inserts for the same
-- key, and the client upserts with ignoreDuplicates instead of a plain insert.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.incident_updates
  add column if not exists dedup_key text;

create unique index if not exists incident_updates_dedup_key_idx
  on public.incident_updates(dedup_key)
  where dedup_key is not null;
