-- ═══════════════════════════════════════════════════════════════════════════
-- Rename mrms_frame_history -> mrms_radar_archive.
--
-- Same table, same rows, same constraint/index — this is a rename, not a new
-- table (Phase 6A explicitly requires not duplicating payload/metadata).
-- The semantic shift: this table is no longer a short-lived "history" that
-- gets aggressively pruned every ingestion run (see the removal of
-- pruneHistory()/HISTORY_RETENTION_COUNT in scripts/mrms-radar-sync.mjs) —
-- it's now the persistent long-term archive. The "100 most recent frames"
-- playback window is just a query (ORDER BY source_time DESC LIMIT 100)
-- against this same table, not a separate hot-storage structure.
-- ═══════════════════════════════════════════════════════════════════════════

alter table if exists public.mrms_frame_history
  rename to mrms_radar_archive;

alter index if exists public.mrms_frame_history_lookup_idx
  rename to mrms_radar_archive_lookup_idx;

alter policy if exists "mrms_frame_history public read"
  on public.mrms_radar_archive
  rename to "mrms_radar_archive public read";
