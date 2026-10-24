-- Fire danger notifications for saved locations (notification-sync).
--
-- Per saved location, both off by default:
--   notify_fire_potential_min   NWCG 7-day Significant Fire Potential level to
--                               alert at: 3 moderate risk, 4 high risk (any
--                               trigger), 5 high risk from lightning or
--                               recreation (red). NULL = off.
--   notify_fire_potential_days  how many forecast days (1-7) to watch.
--   notify_fm100_below          alert when the nearest current FEMS NFDRS
--                               station (within 40 km) reports 100-hour dead
--                               fuel moisture below this % (1-30). Set by the
--                               user for their own fuels; there is no default
--                               threshold. NULL = off.
--
-- notification_log gains kind 'fire_danger'; get_monitored_saved_locations
-- returns the three columns (its return type changes, so it is dropped and
-- recreated with the same body and grants).

alter table public.saved_locations
  add column if not exists notify_fire_potential_min smallint,
  add column if not exists notify_fire_potential_days smallint not null default 2,
  add column if not exists notify_fm100_below numeric(4, 1);

alter table public.saved_locations
  drop constraint if exists saved_locations_fire_potential_min_check,
  drop constraint if exists saved_locations_fire_potential_days_check,
  drop constraint if exists saved_locations_fm100_below_check;

alter table public.saved_locations
  add constraint saved_locations_fire_potential_min_check
    check (notify_fire_potential_min is null or notify_fire_potential_min between 3 and 5),
  add constraint saved_locations_fire_potential_days_check
    check (notify_fire_potential_days between 1 and 7),
  add constraint saved_locations_fm100_below_check
    check (notify_fm100_below is null or notify_fm100_below between 1 and 30);

alter table public.notification_log
  drop constraint if exists notification_log_kind_check;
alter table public.notification_log
  add constraint notification_log_kind_check
    check (kind in ('new_fire', 'nws_alert', 'incident_update', 'fire_danger'));

drop function if exists public.get_monitored_saved_locations();

create function public.get_monitored_saved_locations()
returns table (
  id                          uuid,
  user_id                     uuid,
  name                        text,
  latitude                    double precision,
  longitude                   double precision,
  notify_radius_miles         integer,
  notify_new_fires            boolean,
  email                       text,
  nws_alert_types             text[],
  notify_fire_potential_min   smallint,
  notify_fire_potential_days  smallint,
  notify_fm100_below          numeric
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
         r.notify_new_fires, p.email, coalesce(np.nws_alert_types, '{}'),
         r.notify_fire_potential_min, r.notify_fire_potential_days, r.notify_fm100_below
    from ranked r
    join public.profiles p on p.id = r.user_id
    left join public.notification_preferences np on np.user_id = r.user_id
   where r.alerts_enabled
     and nullif(btrim(p.email), '') is not null
     and r.slot <= public.saved_location_limit(public.user_plan_for(r.user_id));
$$;

revoke execute on function public.get_monitored_saved_locations() from public, anon, authenticated;
grant execute on function public.get_monitored_saved_locations() to service_role;
