-- ═══════════════════════════════════════════════════════════════════════════
-- Hazard events: replace the catch-all 'other' category with 'hazard'
-- The four supported incident types are now wildfire, hazmat, hazard, and
-- flooding. Existing 'other' rows are migrated to 'hazard'.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.hazard_events
  drop constraint if exists hazard_events_category_check;

update public.hazard_events
  set category = 'hazard'
  where category = 'other';

alter table public.hazard_events
  add constraint hazard_events_category_check
  check (category in ('wildfire', 'hazmat', 'hazard', 'flooding'));
