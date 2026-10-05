-- ── Email followers of an incident when it gets new updates ─────────────────
-- notification-sync (and scripts/notification-sync.mjs) sends each follower
-- one digest per incident covering every update since the last email, at
-- most once per p_min_interval, never including the follower's own posts.
-- Dedup reuses notification_log: kind 'incident_update', no saved location,
-- subject_key 'incident:<id>:update:<newest update id>'.

-- ── notification_log: new kind + its own dedup index ────────────────────────
alter table public.notification_log
  drop constraint if exists notification_log_kind_check;
alter table public.notification_log
  add constraint notification_log_kind_check
    check (kind in ('new_fire', 'nws_alert', 'incident_update'));

-- The per-location index treats NULL saved_location_id as distinct, so it
-- can't dedup follow emails; they get a partial index instead.
create unique index if not exists notification_log_follow_dedup_idx
  on public.notification_log(user_id, subject_key)
  where kind = 'incident_update';

-- The digest query reads updates per incident newest-first.
create index if not exists incident_updates_incident_created_idx
  on public.incident_updates(incident_id, created_at desc);

-- ── Pending digests ─────────────────────────────────────────────────────────
-- One row per follow that has unsent updates and is outside its send
-- interval. `updates` holds the newest 10 (newest first); update_count is
-- the full number. Updates posted under the follow's alias ids count too.
-- Updates older than p_max_age are never sent, so a new
-- follow (or a long outage) doesn't replay history.
create or replace function public.get_pending_follow_digests(
  p_min_interval interval default interval '1 hour',
  p_max_age      interval default interval '24 hours'
)
returns table (
  user_id       uuid,
  email         text,
  incident_id   text,
  incident_name text,
  through       timestamptz,
  update_count  integer,
  updates       jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select f.user_id,
         p.email,
         f.incident_id,
         coalesce(f.incident_name, named.incident_name, fr.title, f.incident_id),
         agg.through,
         agg.update_count,
         items.updates
    from public.incident_follows f
    join public.profiles p on p.id = f.user_id
    cross join lateral (
      select max(iu.created_at) as through, count(*)::integer as update_count
        from public.incident_updates iu
       where iu.incident_id = any(array_prepend(f.incident_id, f.alias_ids))
         and iu.created_at > greatest(coalesce(f.notified_through, f.created_at), now() - p_max_age)
         and iu.user_id is distinct from f.user_id
         -- Automated diffs only from the primary id: the sync job posts one
         -- per source, so alias diffs repeat the same change.
         and (iu.incident_id = f.incident_id or iu.source_type <> 'automated')
    ) agg
    cross join lateral (
      select jsonb_agg(to_jsonb(recent) order by recent.created_at desc) as updates
        from (
          select iu.id, iu.content, iu.update_type, iu.source_type, iu.source_name, iu.created_at
            from public.incident_updates iu
           where iu.incident_id = any(array_prepend(f.incident_id, f.alias_ids))
             and iu.created_at > greatest(coalesce(f.notified_through, f.created_at), now() - p_max_age)
             and iu.user_id is distinct from f.user_id
             and (iu.incident_id = f.incident_id or iu.source_type <> 'automated')
           order by iu.created_at desc
           limit 10
        ) recent
    ) items
    left join lateral (
      select iu.incident_name
        from public.incident_updates iu
       where iu.incident_id = any(array_prepend(f.incident_id, f.alias_ids)) and iu.incident_name is not null
       limit 1
    ) named on true
    left join public.fire_reports fr on fr.id::text = f.incident_id
   where agg.update_count > 0
     and nullif(btrim(p.email), '') is not null
     and (f.last_notified_at is null or f.last_notified_at < now() - p_min_interval);
$$;

-- ── Claim / mark ────────────────────────────────────────────────────────────
-- Insert-or-ignore the dedup row; returns its id, or null if already sent.
create or replace function public.claim_follow_notification(
  p_user_id     uuid,
  p_subject_key text,
  p_title       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.notification_log (user_id, kind, subject_key, title)
  values (p_user_id, 'incident_update', p_subject_key, p_title)
  on conflict (user_id, subject_key) where kind = 'incident_update' do nothing
  returning id into v_id;
  return v_id;
end;
$$;

-- Record that updates up to p_through were emailed (or already had been).
create or replace function public.mark_follow_notified(
  p_user_id     uuid,
  p_incident_id text,
  p_through     timestamptz
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.incident_follows
     set notified_through = greatest(coalesce(notified_through, '-infinity'::timestamptz), p_through),
         last_notified_at = now()
   where user_id = p_user_id and incident_id = p_incident_id;
$$;

revoke execute on function public.get_pending_follow_digests(interval, interval) from public, anon, authenticated;
revoke execute on function public.claim_follow_notification(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.mark_follow_notified(uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.get_pending_follow_digests(interval, interval) to service_role;
grant execute on function public.claim_follow_notification(uuid, text, text) to service_role;
grant execute on function public.mark_follow_notified(uuid, text, timestamptz) to service_role;
