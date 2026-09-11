-- Add the 'plus' subscription tier between 'free' and 'pro'.

alter table public.subscriptions
  drop constraint subscriptions_plan_check;
alter table public.subscriptions
  add constraint subscriptions_plan_check
  check (plan in ('free', 'plus', 'pro', 'team'));

-- Saved-location limits: free=4, plus=15, pro=unlimited (999999), team=100 (unchanged).
create or replace function public.enforce_saved_location_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_plan text;
  location_limit integer;
  location_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  select coalesce(
    (select plan
       from public.subscriptions
      where user_id = new.user_id
        and status in ('active', 'trialing', 'past_due')
      limit 1),
    'free'
  ) into current_plan;

  location_limit := case current_plan
    when 'pro' then 999999
    when 'team' then 100
    when 'plus' then 15
    else 4
  end;

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
