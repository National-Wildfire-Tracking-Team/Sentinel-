-- ── ORS routing quota ───────────────────────────────────────────────────────
-- cloud/ors-routing calls this, with the caller's own JWT, before every
-- OpenRouteService request. The ORS plan limits are account-wide
-- (Directions 2,000/day + 40/min, Matrix 500/day + 40/min), so besides
-- per-user caps there is a 'global' subject shared by everyone. Caps keep
-- ~10% headroom under ORS's own limits.
--
-- The function also re-checks the Pro/Team entitlement (see below): it is
-- reachable directly through Supabase REST, not only via the Lambda.
--
-- consume_edge_rate_limit isn't reused: it only has one-minute windows and
-- increments before checking, so refused calls would eat the global budget.

create table if not exists public.routing_quota_counters (
  endpoint      text not null check (endpoint in ('directions', 'matrix')),
  subject       text not null,            -- auth.uid()::text or 'global'
  window_kind   text not null check (window_kind in ('minute', 'day')),
  window_start  timestamptz not null,
  request_count integer not null default 0,
  primary key (endpoint, subject, window_kind, window_start)
);

create index if not exists routing_quota_counters_window_idx
  on public.routing_quota_counters(window_start);

alter table public.routing_quota_counters enable row level security;
revoke all on public.routing_quota_counters from anon, authenticated;

create or replace function public.consume_routing_quota(p_endpoint text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid          uuid := auth.uid();
  now_ts       timestamptz := clock_timestamp();
  minute_start timestamptz := date_trunc('minute', now_ts);
  day_start    timestamptz := date_trunc('day', now_ts at time zone 'utc') at time zone 'utc';
  minute_retry integer := greatest(1, ceil(extract(epoch from (minute_start + interval '1 minute' - now_ts)))::int);
  day_retry    integer := greatest(1, ceil(extract(epoch from (day_start + interval '24 hours' - now_ts)))::int);
  caps         jsonb := '{
    "directions": {"user_minute": 6, "user_day": 20, "global_minute": 36, "global_day": 1800},
    "matrix":     {"user_minute": 3, "user_day": 10, "global_minute": 36, "global_day": 450}
  }';
  c            jsonb;
  b            record;
  used         integer;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if p_endpoint is null or p_endpoint not in ('directions', 'matrix') then
    raise exception 'unknown routing endpoint %', p_endpoint using errcode = '22023';
  end if;
  -- This RPC is callable straight through Supabase REST by any signed-in
  -- user, so it must enforce Pro itself — otherwise free accounts could
  -- drain the shared ORS budget. Must match usePlan.js / ors-routing auth.mjs.
  if not exists (
    select 1 from public.subscriptions
     where user_id = uid
       and plan in ('pro', 'team')
       and status in ('active', 'trialing', 'past_due')
  ) then
    raise exception 'routing requires an active Pro or Team plan' using errcode = '42501';
  end if;
  c := caps -> p_endpoint;

  -- Serialize check-then-increment per endpoint (ORS caps it at ~40/min anyway).
  perform pg_advisory_xact_lock(hashtext('routing_quota:' || p_endpoint));

  for b in
    select * from (values
      ('user',   'minute', uid::text, minute_start, (c->>'user_minute')::int,   minute_retry, 1),
      ('user',   'day',    uid::text, day_start,    (c->>'user_day')::int,      day_retry,    2),
      ('global', 'minute', 'global',  minute_start, (c->>'global_minute')::int, minute_retry, 3),
      ('global', 'day',    'global',  day_start,    (c->>'global_day')::int,    day_retry,    4)
    ) as v(scope, kind, subject, wstart, cap, retry, ord)
    order by ord
  loop
    select request_count into used
      from public.routing_quota_counters
     where endpoint = p_endpoint and subject = b.subject
       and window_kind = b.kind and window_start = b.wstart;
    if coalesce(used, 0) >= b.cap then
      return jsonb_build_object('ok', false, 'scope', b.scope, 'window', b.kind, 'retry_after_sec', b.retry);
    end if;
  end loop;

  insert into public.routing_quota_counters (endpoint, subject, window_kind, window_start, request_count)
  values
    (p_endpoint, uid::text, 'minute', minute_start, 1),
    (p_endpoint, uid::text, 'day',    day_start,    1),
    (p_endpoint, 'global',  'minute', minute_start, 1),
    (p_endpoint, 'global',  'day',    day_start,    1)
  on conflict (endpoint, subject, window_kind, window_start)
  do update set request_count = public.routing_quota_counters.request_count + 1;

  -- Bounded table without a cleanup job.
  delete from public.routing_quota_counters where window_start < now_ts - interval '2 days';

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.consume_routing_quota(text) from public, anon;
grant execute on function public.consume_routing_quota(text) to authenticated;
