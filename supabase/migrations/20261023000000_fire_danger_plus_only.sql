-- Fire Danger & Fuels is Plus and above (PLANS.*.fireDangerFuels in
-- src/shared/hooks/usePlan.js). get_monitored_saved_locations() returns the
-- fire danger alert settings as NULL (off) for any other plan, so
-- notification-sync sends those users no fire danger emails. Their saved
-- settings are kept and apply again if they upgrade. Same return type,
-- body and grants as 20261020200000_fire_danger_notifications.sql otherwise.

create or replace function public.get_monitored_saved_locations()
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
           public.user_plan_for(sl.user_id) as plan,
           row_number() over (partition by sl.user_id order by sl.created_at, sl.id) as slot
      from public.saved_locations sl
  )
  select r.id, r.user_id, r.name, r.latitude, r.longitude, r.notify_radius_miles,
         r.notify_new_fires, p.email, coalesce(np.nws_alert_types, '{}'),
         case when r.plan in ('plus', 'pro', 'team') then r.notify_fire_potential_min end,
         r.notify_fire_potential_days,
         case when r.plan in ('plus', 'pro', 'team') then r.notify_fm100_below end
    from ranked r
    join public.profiles p on p.id = r.user_id
    left join public.notification_preferences np on np.user_id = r.user_id
   where r.alerts_enabled
     and nullif(btrim(p.email), '') is not null
     and r.slot <= public.saved_location_limit(r.plan);
$$;

revoke execute on function public.get_monitored_saved_locations() from public, anon, authenticated;
grant execute on function public.get_monitored_saved_locations() to service_role;
