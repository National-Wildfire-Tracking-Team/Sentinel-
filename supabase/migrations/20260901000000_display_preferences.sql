-- Per-user display preferences: map data-picker anchor, time format, and
-- map-popup behavior (list vs single/carousel, spotlight dimming, drag
-- handle). Mirrors notification_preferences — synced only for signed-in
-- users; anonymous users get client-side defaults for the session.

create table if not exists public.display_preferences (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  data_picker_anchor text not null default 'center' check (data_picker_anchor in ('center', 'mouse')),
  time_format        text not null default '12h' check (time_format in ('12h', '24h')),
  map_popup_mode     text not null default 'list' check (map_popup_mode in ('list', 'single')),
  popup_spotlight    boolean not null default false,
  spotlight_opacity  smallint not null default 50 check (spotlight_opacity between 0 and 100),
  popup_drag_handle  boolean not null default false,
  updated_at         timestamptz not null default now()
);

alter table public.display_preferences enable row level security;

drop policy if exists "display_preferences own" on public.display_preferences;
create policy "display_preferences own"
  on public.display_preferences for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
