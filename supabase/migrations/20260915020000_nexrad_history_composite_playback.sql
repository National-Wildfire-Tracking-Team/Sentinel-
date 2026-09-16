-- ═══════════════════════════════════════════════════════════════════════════
-- Composite Radar playback now covers 24 hours (up from ~2h15m), sourced
-- from every site's reflectivity history rather than one national MRMS
-- frame — see scripts/nexrad-radar-sync.mjs's HISTORY_RETENTION_BY_PRODUCT
-- and src/app/hooks/useNexradComposite.js.
--
-- nexrad_scan_history's original index, (site_id, product, scan_time desc),
-- was built for the single-site radar popup's per-site query. Composite
-- Radar's bulk query has no site_id filter at all — it wants "every site's
-- reflectivity newer than this cursor" — so it needs its own index led by
-- product, not site_id, to stay fast now that reflectivity alone holds
-- roughly 10x the rows it used to (24h vs 2h15m retention, across ~200
-- continuously-synced sites instead of a handful of actively-viewed ones).
-- ═══════════════════════════════════════════════════════════════════════════

create index if not exists nexrad_scan_history_product_scan_time_idx
  on public.nexrad_scan_history(product, scan_time);
