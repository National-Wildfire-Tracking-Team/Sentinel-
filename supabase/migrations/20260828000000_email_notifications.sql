-- Email notifications: per-location "new fire nearby" opt-out, per-user NWS
-- alert-type preferences, and a send log that both records history and
-- de-duplicates repeat emails for the same fire/alert.

alter table public.saved_locations
  add column if not exists notify_new_fires boolean not null default true;

create table if not exists public.notification_preferences (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  nws_alert_types text[] not null default '{}',
  updated_at      timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

drop policy if exists "notification_preferences own" on public.notification_preferences;
create policy "notification_preferences own"
  on public.notification_preferences for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.notification_log (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  saved_location_id  uuid references public.saved_locations(id) on delete set null,
  kind               text not null check (kind in ('new_fire', 'nws_alert')),
  subject_key        text not null,
  title              text not null,
  sent_at            timestamptz not null default now()
);

-- One email per (user, event) ever — the sync script relies on this unique
-- index (via on_conflict + ignore-duplicates) to decide whether an event is
-- genuinely new, so it doubles as both history and the dedup mechanism.
create unique index if not exists notification_log_dedup_idx
  on public.notification_log(user_id, kind, subject_key);

create index if not exists notification_log_user_idx
  on public.notification_log(user_id, sent_at desc);

alter table public.notification_log enable row level security;

drop policy if exists "notification_log own read" on public.notification_log;
create policy "notification_log own read"
  on public.notification_log for select
  using (auth.uid() = user_id);
