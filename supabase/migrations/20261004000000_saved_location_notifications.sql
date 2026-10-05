-- Wire saved locations into notification-sync end to end:
--   * per-location notification radius (previously a hard-coded 25 mi in the
--     sync job) and updated_at
--   * data constraints the sync job relies on (valid coordinates, a name)
--   * one place in the database for plan → saved-location limit, shared by
--     the insert trigger and the sync job's eligibility check
--   * per-location de-duplication in notification_log, so one fire that
--     threatens Home and Property produces one email for each
--   * get_monitored_saved_locations(): the single service-role query
--     notification-sync uses to decide which locations to evaluate

-- ── saved_locations columns and constraints ─────────────────────────────────
-- 25 mi matches the radius the sync job used before it was configurable, so
-- existing locations keep their current behavior.
alter table public.saved_locations
  add column if not exists notify_radius_miles integer not null default 25,
  add column if not exists updated_at timestamptz not null default now();

alter table public.saved_locations
  drop constraint if exists saved_locations_radius_check,
  drop constraint if exists saved_locations_coordinates_check,
  drop constraint if exists saved_locations_name_check;

alter table public.saved_locations
  add constraint saved_locations_radius_check
    check (notify_radius_miles between 1 and 100),
  add constraint saved_locations_coordinates_check
    check (latitude between -90 and 90 and longitude between -180 and 180),
  add constraint saved_locations_name_check
    check (length(btrim(name)) between 1 and 120);

drop trigger if exists saved_locations_updated_at on public.saved_locations;
create trigger saved_locations_updated_at
  before update on public.saved_locations
  for each row execute function public.set_updated_at();

-- ── Plan limits: one definition for the trigger and the sync job ────────────
-- Mirrors PLANS[*].savedLocationsLimit in src/shared/hooks/usePlan.js (pro is
-- Infinity there); Tests/Vitest/savedLocationLimits.test.js keeps them equal.
create or replace function public.saved_location_limit(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'pro' then 999999
    when 'team' then 100
    when 'plus' then 15
    else 4
  end;
$$;

-- Plan for an arbitrary user. Internal only: get_user_plan() remains the
-- client-callable version scoped to auth.uid().
create or replace function public.user_plan_for(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select plan
       from public.subscriptions
      where user_id = p_user_id
        and status in ('active', 'trialing', 'past_due')
      limit 1),
    'free'
  );
$$;

revoke execute on function public.user_plan_for(uuid) from public, anon, authenticated;
grant execute on function public.user_plan_for(uuid) to service_role;

create or replace function public.enforce_saved_location_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  location_limit integer;
  location_count integer;
begin
  -- Serialize inserts for one user so concurrent requests cannot exceed the cap.
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  location_limit := public.saved_location_limit(public.user_plan_for(new.user_id));

  select count(*) into location_count
    from public.saved_locations
   where user_id = new.user_id;

  if location_count >= location_limit then
    raise exception 'Your plan allows up to % saved locations.', location_limit
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ── notification_log: de-duplicate per saved location ───────────────────────
-- Was unique per (user, kind, subject), which sent one email for a fire near
-- both Home and Property. A deleted location's rows keep their history with
-- saved_location_id = null and no longer block anything.
drop index if exists public.notification_log_dedup_idx;
create unique index if not exists notification_log_location_dedup_idx
  on public.notification_log(user_id, saved_location_id, kind, subject_key);

-- ── Monitored locations for notification-sync ───────────────────────────────
-- A location is monitored when its notifications are on, its owner still has
-- an email, and it is within the owner's plan limit. A downgraded user keeps
-- every location visible, but only the oldest `limit` are monitored (the same
-- order the app lists them in).
create or replace function public.get_monitored_saved_locations()
returns table (
  id                  uuid,
  user_id             uuid,
  name                text,
  latitude            double precision,
  longitude           double precision,
  notify_radius_miles integer,
  notify_new_fires    boolean,
  email               text,
  nws_alert_types     text[]
)
language sql
stable
security definer
set search_path = public
as $$
  with ranked as (
    select sl.*,
           row_number() over (partition by sl.user_id order by sl.created_at, sl.id) as slot
      from public.saved_locations sl
  )
  select r.id, r.user_id, r.name, r.latitude, r.longitude, r.notify_radius_miles,
         r.notify_new_fires, p.email, coalesce(np.nws_alert_types, '{}')
    from ranked r
    join public.profiles p on p.id = r.user_id
    left join public.notification_preferences np on np.user_id = r.user_id
   where r.alerts_enabled
     and nullif(btrim(p.email), '') is not null
     and r.slot <= public.saved_location_limit(public.user_plan_for(r.user_id));
$$;

revoke execute on function public.get_monitored_saved_locations() from public, anon, authenticated;
grant execute on function public.get_monitored_saved_locations() to service_role;
