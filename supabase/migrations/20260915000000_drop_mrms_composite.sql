-- ═══════════════════════════════════════════════════════════════════════════
-- Drop the NOAA MRMS composite radar pipeline entirely.
--
-- Composite Radar no longer renders a national MRMS mosaic (see
-- scripts/mrms-radar-sync.mjs, now deleted) — it renders every NEXRAD site's
-- own reflectivity sweep as its own layer instead (see
-- src/app/hooks/useNexradComposite.js), reusing the existing
-- nexrad_scan_meta / nexrad_scan_history tables and nexrad-scans bucket.
-- Nothing reads mrms_frame_meta/mrms_radar_archive or the mrms-scans bucket
-- anymore, so this permanently deletes all historical MRMS frame data.
-- ═══════════════════════════════════════════════════════════════════════════

drop table if exists public.mrms_frame_meta;
drop table if exists public.mrms_radar_archive;

delete from storage.objects where bucket_id = 'mrms-scans';
delete from storage.buckets where id = 'mrms-scans';
