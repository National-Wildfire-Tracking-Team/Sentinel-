-- Add incident_name to incident_updates so the sidebar feed can display
-- the fire name without a join to the external IRWIN API.
alter table public.incident_updates
  add column if not exists incident_name text;
