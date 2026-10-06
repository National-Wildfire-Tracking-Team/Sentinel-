-- ── incident_updates.update_type ────────────────────────────────────────────
-- The incident detail panel labels each timeline entry ("Evacuation Order",
-- "Fire Growth", ...) and derives the "current situation" line from the
-- latest actionable entry. Neither is possible from free text, so every
-- update now carries a type.
--
-- Default is the neutral 'incident_update' so existing writers that don't
-- send a type (older clients, the incident-updates-sync job until it is
-- redeployed) keep working unchanged.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'incident_update_type') then
    create type public.incident_update_type as enum (
      'fire_growth',
      'threat',
      'resource_request',
      'evacuation',
      'road_closure',
      'location',
      'field_report',
      'incident_update'
    );
  end if;
end
$$;

alter table public.incident_updates
  add column if not exists update_type public.incident_update_type
    not null default 'incident_update';

-- Backfill: reporter posts are field reports; automated diffs where acreage
-- grew are fire growth. Everything else keeps the neutral default.
update public.incident_updates
   set update_type = 'field_report'
 where source_type = 'reporter'
   and update_type = 'incident_update';

update public.incident_updates
   set update_type = 'fire_growth'
 where source_type = 'automated'
   and update_type = 'incident_update'
   and content ~ 'Acres: [0-9][0-9,]*(\.[0-9]+)? → [0-9][0-9,]*(\.[0-9]+)?'
   and replace((regexp_match(content, 'Acres: ([0-9][0-9,]*(?:\.[0-9]+)?) → ([0-9][0-9,]*(?:\.[0-9]+)?)'))[2], ',', '')::numeric
     > replace((regexp_match(content, 'Acres: ([0-9][0-9,]*(?:\.[0-9]+)?) → ([0-9][0-9,]*(?:\.[0-9]+)?)'))[1], ',', '')::numeric;
