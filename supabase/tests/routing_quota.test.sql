-- Database tests for the ORS routing quota
-- (migration 20261009000000_routing_quota.sql).
--
-- Same convention as saved_location_notifications.test.sql: throwaway users,
-- every assertion, then ALWAYS raise so everything rolls back. Success is the
-- error message "ROUTING_QUOTA_TESTS_PASSED: …". Run as a superuser after the
-- migration (e.g. in the Supabase SQL editor).

do $test$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  f uuid := gen_random_uuid();   -- free plan
  l uuid := gen_random_uuid();   -- lapsed (canceled) pro
  who uuid;
  r jsonb;
  n integer;
  i integer;
  day_start timestamptz := date_trunc('day', clock_timestamp() at time zone 'utc') at time zone 'utc';
  prev_minute timestamptz;
  passed text[] := '{}';
begin
  insert into auth.users (id, email) values
    (a, a || '@test.invalid'), (b, b || '@test.invalid'), (c, c || '@test.invalid'),
    (f, f || '@test.invalid'), (l, l || '@test.invalid');
  insert into public.subscriptions (user_id, plan, status) values
    (a, 'pro', 'active'), (b, 'team', 'trialing'), (c, 'pro', 'past_due'),
    (f, 'free', 'active'), (l, 'pro', 'canceled')
  on conflict (user_id) do update set plan = excluded.plan, status = excluded.status;
  -- Deterministic start: no counters in the current windows.
  delete from public.routing_quota_counters;

  -- ── free and lapsed accounts are refused and nothing is counted ──
  foreach who in array array[f, l] loop
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform public.consume_routing_quota('directions');
      raise exception 'non-entitled user % was allowed', who;
    exception when insufficient_privilege then null;
    end;
    execute 'reset role';
  end loop;
  select count(*) into n from public.routing_quota_counters;
  if n <> 0 then raise exception 'refused non-entitled calls were counted: % rows', n; end if;
  passed := passed || 'free/lapsed denied without counting';

  -- ── anon cannot call ──
  execute 'set local role anon';
  begin
    perform public.consume_routing_quota('directions');
    raise exception 'anon was allowed';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  passed := passed || 'anon denied';

  -- ── user A: 6 directions per minute, 7th refused without counting ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  for i in 1..6 loop
    r := public.consume_routing_quota('directions');
    if not (r->>'ok')::boolean then raise exception 'call % refused early: %', i, r; end if;
  end loop;
  r := public.consume_routing_quota('directions');
  if (r->>'ok')::boolean or r->>'scope' <> 'user' or r->>'window' <> 'minute' then
    raise exception 'expected user/minute refusal, got %', r;
  end if;
  if (r->>'retry_after_sec')::int not between 1 and 60 then raise exception 'bad retry_after_sec %', r; end if;
  execute 'reset role';
  select request_count into n from public.routing_quota_counters
   where endpoint = 'directions' and subject = a::text and window_kind = 'minute';
  if n <> 6 then raise exception 'refused call was counted: %', n; end if;
  select request_count into n from public.routing_quota_counters
   where endpoint = 'directions' and subject = 'global' and window_kind = 'minute';
  if n <> 6 then raise exception 'global minute count %, expected 6', n; end if;
  passed := passed || 'user minute cap';

  -- ── user A day cap (20) ──
  delete from public.routing_quota_counters where subject = a::text and window_kind = 'minute';
  update public.routing_quota_counters set request_count = 20
   where endpoint = 'directions' and subject = a::text and window_kind = 'day';
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.consume_routing_quota('directions');
  if (r->>'ok')::boolean or r->>'scope' <> 'user' or r->>'window' <> 'day' then
    raise exception 'expected user/day refusal, got %', r;
  end if;
  -- user B is unaffected
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  r := public.consume_routing_quota('directions');
  if not (r->>'ok')::boolean then raise exception 'user B refused: %', r; end if;
  execute 'reset role';
  passed := passed || 'user day cap';

  -- ── global day cap (1800 directions) ──
  delete from public.routing_quota_counters where window_kind = 'minute';
  insert into public.routing_quota_counters (endpoint, subject, window_kind, window_start, request_count)
  values ('directions', 'global', 'day', day_start, 1800)
  on conflict (endpoint, subject, window_kind, window_start) do update set request_count = 1800;
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.consume_routing_quota('directions');
  if (r->>'ok')::boolean or r->>'scope' <> 'global' or r->>'window' <> 'day' then
    raise exception 'expected global/day refusal, got %', r;
  end if;
  -- matrix has its own buckets
  for i in 1..3 loop
    r := public.consume_routing_quota('matrix');
    if not (r->>'ok')::boolean then raise exception 'matrix call % refused: %', i, r; end if;
  end loop;
  r := public.consume_routing_quota('matrix');
  if (r->>'ok')::boolean or r->>'scope' <> 'user' or r->>'window' <> 'minute' then
    raise exception 'expected matrix user/minute refusal, got %', r;
  end if;
  execute 'reset role';
  passed := passed || 'global day cap' || 'matrix buckets';

  -- ── global matrix day cap (450) ──
  delete from public.routing_quota_counters where window_kind = 'minute';
  insert into public.routing_quota_counters (endpoint, subject, window_kind, window_start, request_count)
  values ('matrix', 'global', 'day', day_start, 450)
  on conflict (endpoint, subject, window_kind, window_start) do update set request_count = 450;
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.consume_routing_quota('matrix');
  if (r->>'ok')::boolean or r->>'scope' <> 'global' or r->>'window' <> 'day' then
    raise exception 'expected matrix global/day refusal, got %', r;
  end if;

  -- ── unknown endpoint ──
  begin
    perform public.consume_routing_quota('isochrones');
    raise exception 'unknown endpoint accepted';
  exception when invalid_parameter_value then null;
  end;
  execute 'reset role';
  passed := passed || 'matrix global day cap' || 'unknown endpoint';

  -- ── window rollover: full counters from the previous minute/day don't count ──
  -- Deterministic: the seeded windows are strictly older than any window the
  -- function can compute now (if the clock ticks over meanwhile they're just older still).
  delete from public.routing_quota_counters;
  prev_minute := date_trunc('minute', clock_timestamp()) - interval '1 minute';
  insert into public.routing_quota_counters (endpoint, subject, window_kind, window_start, request_count) values
    ('directions', c::text,   'minute', prev_minute,                6),
    ('directions', c::text,   'day',    day_start - interval '1 day', 20),
    ('directions', 'global',  'minute', prev_minute,                36),
    ('directions', 'global',  'day',    day_start - interval '1 day', 1800);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  r := public.consume_routing_quota('directions');
  if not (r->>'ok')::boolean then raise exception 'previous-window counters were counted: %', r; end if;
  execute 'reset role';
  select request_count into n from public.routing_quota_counters
   where endpoint = 'directions' and subject = c::text and window_kind = 'minute' and window_start > prev_minute;
  if n is distinct from 1 then raise exception 'new minute window count %, expected 1', n; end if;
  select request_count into n from public.routing_quota_counters
   where endpoint = 'directions' and subject = c::text and window_kind = 'minute' and window_start = prev_minute;
  if n is distinct from 6 then raise exception 'previous minute row changed: %', n; end if;
  passed := passed || 'window rollover';

  raise exception 'ROUTING_QUOTA_TESTS_PASSED: %', array_to_string(passed, ', ');
end
$test$;
