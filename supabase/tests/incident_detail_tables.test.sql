-- Database tests for the incident detail panel tables
-- (migrations 20261005000000 … 20261005000300).
--
-- Same convention as saved_location_notifications.test.sql: creates throwaway
-- users, runs every assertion, then ALWAYS raises so everything rolls back.
-- Success is the error message "INCIDENT_DETAIL_TESTS_PASSED: …".

do $test$
declare
  pub uuid := gen_random_uuid();
  rep uuid := gen_random_uuid();
  inc text := 'test-incident-' || gen_random_uuid();
  n integer;
  t public.incident_update_type;
  claim1 uuid;
  claim2 uuid;
  d record;
  passed text[] := '{}';
begin
  insert into auth.users (id, email) values (pub, pub || '@test.invalid'), (rep, rep || '@test.invalid');
  insert into public.profiles (id, email, role) values
    (pub, pub || '@test.invalid', 'public'),
    (rep, rep || '@test.invalid', 'reporter')
    on conflict (id) do update set role = excluded.role;

  -- ── update_type default ──
  insert into public.incident_updates (incident_id, content, source_type, source_name)
    values (inc, 'x', 'automated', 'Test') returning update_type into t;
  if t <> 'incident_update' then raise exception 'update_type default: got %', t; end if;
  passed := passed || 'update_type default';

  -- ── Reporter can write evacuations/shelters ──
  perform set_config('request.jwt.claims', json_build_object('sub', rep, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  insert into public.incident_evacuations (incident_id, level, zones, links)
    values (inc, 'order', '{RIV-E1042}', '[{"label":"Map","url":"https://example.com"}]');
  insert into public.incident_shelters (incident_id, kind, name) values (inc, 'large_animals', 'Rodeo Grounds');
  passed := passed || 'reporter writes';

  begin
    insert into public.incident_evacuations (incident_id, level) values (inc, 'order');
    raise exception 'duplicate level allowed';
  exception when unique_violation then null;
  end;
  passed := passed || 'one row per level';

  -- ── Public user: read yes, write no; follows own only ──
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', pub, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into n from public.incident_shelters where incident_id = inc;
  if n <> 1 then raise exception 'public read shelters: %', n; end if;

  begin
    insert into public.incident_shelters (incident_id, name) values (inc, 'Nope');
    raise exception 'public user wrote a shelter';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'public read-only';

  insert into public.incident_follows (user_id, incident_id) values (pub, inc);
  begin
    insert into public.incident_follows (user_id, incident_id) values (rep, inc);
    raise exception 'followed as another user';
  exception when insufficient_privilege then null;
  end;
  passed := passed || 'follows own insert only';

  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', rep, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.incident_follows where incident_id = inc;
  if n <> 0 then raise exception 'saw another user''s follow'; end if;
  passed := passed || 'follows private';

  execute 'reset role';

  -- ── Follow digests (service-role functions, run here as superuser) ──
  -- pub follows inc (above). rep posts one update; pub posts one (excluded).
  -- The follow also knows the fire by an alias id (IRWIN vs CAL FIRE).
  update public.incident_follows
     set created_at = now() - interval '1 minute', alias_ids = array[inc || '-alias']
   where user_id = pub;
  insert into public.incident_updates (incident_id, content, source_type, source_name, user_id, update_type)
    values (inc, 'Evacuation order issued.', 'reporter', 'rep', rep, 'evacuation'),
           (inc, 'My own post.', 'reporter', 'pub', pub, 'field_report'),
           (inc || '-alias', 'Road closed.', 'reporter', 'rep', rep, 'road_closure'),
           (inc || '-alias', 'Acres: 1 → 2', 'automated', 'Other feed', null, 'fire_growth');
  select * into d from public.get_pending_follow_digests() g where g.user_id = pub and g.incident_id = inc;
  if d is null then raise exception 'follow digest missing'; end if;
  -- automated (primary) + rep (primary) + rep (alias); not own, not alias automated
  if d.update_count <> 3 then raise exception 'digest count: % (expected 3)', d.update_count; end if;
  if d.updates::text like '%My own post%' then raise exception 'digest included follower''s own post'; end if;
  if d.updates::text not like '%Road closed%' then raise exception 'digest missed alias reporter update'; end if;
  if d.updates::text like '%Other feed%' then raise exception 'digest included alias automated diff'; end if;
  passed := passed || 'follow digest';

  claim1 := public.claim_follow_notification(pub, 'incident:' || inc || ':update:x', 'title');
  claim2 := public.claim_follow_notification(pub, 'incident:' || inc || ':update:x', 'title');
  if claim1 is null or claim2 is not null then raise exception 'follow claim dedup: % %', claim1, claim2; end if;
  passed := passed || 'follow claim dedup';

  perform public.mark_follow_notified(pub, inc, d.through);
  if exists (select 1 from public.get_pending_follow_digests() g where g.user_id = pub and g.incident_id = inc) then
    raise exception 'digest still pending after mark';
  end if;
  passed := passed || 'follow watermark';

  raise exception 'INCIDENT_DETAIL_TESTS_PASSED: %', array_to_string(passed, ', ');
end
$test$;
