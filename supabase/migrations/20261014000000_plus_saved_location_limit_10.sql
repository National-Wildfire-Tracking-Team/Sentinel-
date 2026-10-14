-- ── Sentinel Plus: 10 saved locations (was 15) ──────────────────────────────
-- Matches PLANS.plus.savedLocationsLimit in src/shared/hooks/usePlan.js.
-- saved_location_limit drives both the insert cap (enforce_saved_location_limit)
-- and which slots get notifications (get_monitored_saved_locations). Existing
-- rows are kept: a Plus user already above 10 can't add more, and only their
-- oldest 10 locations are monitored, the same as any other over-limit user.

create or replace function public.saved_location_limit(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'pro' then 999999
    when 'team' then 100
    when 'plus' then 10
    else 4
  end;
$$;
