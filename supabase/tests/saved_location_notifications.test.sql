-- Database tests for saved locations + notifications
-- (migration 20261004000000_saved_location_notifications.sql).
--
-- Self-contained and non-destructive: creates throwaway users, runs every
-- assertion, then ALWAYS ends by raising an exception so the whole statement
-- rolls back. Success is the error message "SAVED_LOCATION_TESTS_PASSED: …";
-- anything else is a failure. Run after the migration (or concatenated after
-- it, so the migration is rolled back too) as a superuser, e.g. in the
-- Supabase SQL editor.

do $test$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  ids uuid[];
  n integer;
  passed text[] := '{}';
begin
  insert into auth.users (id, email) values (a, a || '@test.invalid'), (b, b || '@test.invalid');
  insert into public.profiles (id, email) values (a, a || '@test.invalid'), (b, b || '@test.invalid')
    on conflict (id) do update set email = excluded.email;

  -- ── As user A ──
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.saved_locations (user_id, name, latitude, longitude)
  select a, 'Loc ' || i, 43.6 + i * 0.01, -116.2 from generate_series(1, 4) i;
  select array_agg(id order by created_at, id) into ids from public.saved_locations where user_id = a;
  if array_length(ids, 1) <> 4 then raise exception 'create: expected 4 rows'; end if;
  if (select notify_radius_miles from public.saved_locations where id = ids[1]) <> 25 then
    raise exception 'create: radius default is not 25';
  end if;
  passed := passed || 'create+defaults';

  begin
    insert into public.saved_locations (user_id, name, latitude, longitude) values (a, 'Fifth', 43, -116);
    raise exception 'limit: 5th insert succeeded';
  exception when check_violation then
    if sqlerrm not like 'Your plan allows up to 4 saved locations.' then raise; end if;
  end;
  passed := passed || 'free limit 4';

  begin
    update public.saved_locations set latitude = 95 where id = ids[1];
    raise exception 'constraint: bad latitude accepted';
  exception when check_violation then null; end;
  begin
    update public.saved_locations set notify_radius_miles = 0 where id = ids[1];
    raise exception 'constraint: radius 0 accepted';
  exception when check_violation then null; end;
  begin
    update public.saved_locations set name = '   ' where id = ids[1];
    raise exception 'constraint: blank name accepted';
  exception when check_violation then null; end;
  passed := passed || 'constraints';

  update public.saved_locations set name = 'Home', notify_radius_miles = 50, alerts_enabled = false where id = ids[1];
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'update own: % rows', n; end if;
  passed := passed || 'update own';

  begin
    update public.saved_locations set user_id = b where id = ids[2];
    raise exception 'rls: moved a row to another user';
  exception when insufficient_privilege then null; end;
  passed := passed || 'cannot reassign owner';

  begin
    perform public.get_monitored_saved_locations();
    raise exception 'rpc: authenticated user could call get_monitored_saved_locations';
  exception when insufficient_privilege then null; end;
  begin
    perform public.user_plan_for(b);
    raise exception 'rpc: authenticated user could call user_plan_for';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.notification_log (user_id, kind, subject_key, title) values (a, 'new_fire', 'fire:x', 'x');
    raise exception 'rls: user inserted into notification_log';
  exception when insufficient_privilege then null; end;
  passed := passed || 'service-only rpc + log';

  -- ── As user B ──
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  select count(*) into n from public.saved_locations where user_id = a;
  if n <> 0 then raise exception 'rls: B can read A''s locations'; end if;
  update public.saved_locations set name = 'pwned' where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'rls: B updated A''s locations'; end if;
  delete from public.saved_locations where user_id = a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'rls: B deleted A''s locations'; end if;
  begin
    insert into public.saved_locations (user_id, name, latitude, longitude) values (a, 'Spoof', 43, -116);
    raise exception 'rls: B inserted a location for A';
  exception when insufficient_privilege then null; end;
  passed := passed || 'cross-user isolation';

  -- ── As service (eligibility + dedup) ──
  execute 'reset role';

  -- ids[1] is disabled → 3 monitored, radius carried through.
  select count(*) into n from public.get_monitored_saved_locations() m where m.user_id = a;
  if n <> 3 then raise exception 'eligibility: expected 3 monitored, got %', n; end if;
  if exists (select 1 from public.get_monitored_saved_locations() m where m.id = ids[1]) then
    raise exception 'eligibility: disabled location monitored';
  end if;
  passed := passed || 'disabled not monitored';

  -- Plus allows a 5th; after downgrade only the oldest 4 slots are monitored.
  insert into public.subscriptions (user_id, plan, status) values (a, 'plus', 'active');
  insert into public.saved_locations (user_id, name, latitude, longitude) values (a, 'Fifth', 43, -116);
  update public.subscriptions set status = 'canceled' where user_id = a;
  if exists (select 1 from public.get_monitored_saved_locations() m where m.user_id = a and m.name = 'Fifth') then
    raise exception 'eligibility: over-limit location monitored after downgrade';
  end if;
  passed := passed || 'plan eligibility after downgrade';

  update public.profiles set email = null where id = a;
  if exists (select 1 from public.get_monitored_saved_locations() m where m.user_id = a) then
    raise exception 'eligibility: user without email monitored';
  end if;
  passed := passed || 'no email → not monitored';

  insert into public.notification_log (user_id, saved_location_id, kind, subject_key, title)
  values (a, ids[2], 'new_fire', 'fire:1', 't'), (a, ids[3], 'new_fire', 'fire:1', 't');
  insert into public.notification_log (user_id, saved_location_id, kind, subject_key, title)
  values (a, ids[2], 'new_fire', 'fire:1', 't')
  on conflict (user_id, saved_location_id, kind, subject_key) do nothing;
  select count(*) into n from public.notification_log where user_id = a;
  if n <> 2 then raise exception 'dedup: expected 2 log rows, got %', n; end if;
  passed := passed || 'dedup per location';

  delete from public.saved_locations where id = ids[2];
  if exists (select 1 from public.get_monitored_saved_locations() m where m.id = ids[2]) then
    raise exception 'delete: deleted location still monitored';
  end if;
  passed := passed || 'delete stops monitoring';

  delete from auth.users where id = b;
  if exists (select 1 from public.saved_locations where user_id = b) then
    raise exception 'delete user: locations remain';
  end if;
  passed := passed || 'deleted user cascades';

  raise exception 'SAVED_LOCATION_TESTS_PASSED: %', array_to_string(passed, ', ');
end
$test$;
