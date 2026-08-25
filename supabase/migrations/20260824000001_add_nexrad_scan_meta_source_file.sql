-- Switched ingestion source from Unidata's real-time S3 chunk bucket to
-- tgftp.nws.noaa.gov (see scripts/nexrad-radar-sync.mjs for why: the S3
-- bucket's volume-scan-number folders cycle 0-999 with no reliable way to
-- find "current" via prefix listing alone, whereas tgftp serves complete,
-- chronologically-named single files per volume). source_file (the upstream
-- filename, e.g. "KTLX_20260824_200114.bz2") replaces volume_scan_number as
-- the per-site dedup/high-water-mark key; volume_scan_number is left in
-- place unused rather than dropped.
alter table public.nexrad_scan_meta
  add column if not exists source_file text;
