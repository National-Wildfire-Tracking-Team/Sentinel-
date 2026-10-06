-- ── incident_follows ────────────────────────────────────────────────────────
-- Per-incident follow ("Follow Incident" in the detail panel). Separate from
-- saved-location notifications, which are radius based. A user's follows are
-- private to them; notification-sync (service role) reads them via the
-- incident_id index to fan out updates.

-- incident_name: captured at follow time so emails can name the incident
--   (official incidents have no row of their own to look it up from).
-- alias_ids: the fire's other ids at follow time (IRWIN vs CAL FIRE vs
--   reporter report; see src/app/utils/incidentAliases.js), so updates posted
--   under any of them reach the follower.
-- notified_through / last_notified_at: maintained by notification-sync —
--   created_at of the newest update already emailed, and when that email
--   went out (for the per-incident send interval).
create table if not exists public.incident_follows (
  user_id          uuid not null references auth.users(id) on delete cascade,
  incident_id      text not null,
  incident_name    text check (incident_name is null or length(incident_name) <= 200),
  alias_ids        text[] not null default '{}' check (cardinality(alias_ids) <= 20),
  notified_through timestamptz,
  last_notified_at timestamptz,
  created_at       timestamptz not null default now(),
  primary key (user_id, incident_id)
);

create index if not exists incident_follows_incident_idx
  on public.incident_follows(incident_id);

alter table public.incident_follows enable row level security;

drop policy if exists "follows own read" on public.incident_follows;
create policy "follows own read"
  on public.incident_follows for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "follows own insert" on public.incident_follows;
create policy "follows own insert"
  on public.incident_follows for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "follows own delete" on public.incident_follows;
create policy "follows own delete"
  on public.incident_follows for delete
  to authenticated
  using ((select auth.uid()) = user_id);
