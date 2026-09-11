-- Enforce saved-location plan limits in the database and provide an atomic,
-- service-role-only rate limiter for API-backed Edge Functions.

create or replace function public.get_user_plan()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select plan from public.subscriptions
     where user_id = auth.uid()
       and status in ('active', 'trialing', 'past_due')
     limit 1),
    'free'
  );
$$;

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
  -- Serialize inserts for one user so concurrent requests cannot exceed the cap.
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
    when 'team' then 100
    when 'pro' then 25
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

drop trigger if exists enforce_saved_location_limit on public.saved_locations;
create trigger enforce_saved_location_limit
  before insert on public.saved_locations
  for each row execute function public.enforce_saved_location_limit();

create table if not exists public.edge_rate_limits (
  function_name text not null,
  subject text not null,
  window_start timestamptz not null,
  request_count integer not null default 1,
  primary key (function_name, subject, window_start)
);

create index if not exists edge_rate_limits_window_idx
  on public.edge_rate_limits(window_start);

alter table public.edge_rate_limits enable row level security;

create or replace function public.consume_edge_rate_limit(
  p_function_name text,
  p_subject text,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_count integer;
  current_window timestamptz := date_trunc('minute', clock_timestamp());
begin
  if p_limit < 1 or p_subject = '' or p_function_name = '' then
    return false;
  end if;

  insert into public.edge_rate_limits (function_name, subject, window_start, request_count)
  values (p_function_name, p_subject, current_window, 1)
  on conflict (function_name, subject, window_start)
  do update set request_count = public.edge_rate_limits.request_count + 1
  returning request_count into current_count;

  -- Keep the table bounded without requiring a separate cleanup job.
  delete from public.edge_rate_limits
   where window_start < current_window - interval '1 day';

  return current_count <= p_limit;
end;
$$;

revoke all on public.edge_rate_limits from anon, authenticated;
revoke all on function public.consume_edge_rate_limit(text, text, integer) from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(text, text, integer) to service_role;
