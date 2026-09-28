-- Per-user Home Setup: home location + the alert radius the user chose.
-- "Go to My Current Location" centers this radius on the user's live GPS
-- position to filter incidents, NWS alerts, and SPC/WPC outlooks. There is
-- deliberately no default radius — a row only exists once the user has
-- completed setup. Anonymous users keep Home Setup in localStorage only.

create table if not exists public.home_setups (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  latitude     double precision not null check (latitude between -90 and 90),
  longitude    double precision not null check (longitude between -180 and 180),
  label        text not null default '' check (char_length(label) <= 300),
  radius_miles smallint not null check (radius_miles between 1 and 500),
  updated_at   timestamptz not null default now()
);

alter table public.home_setups enable row level security;

drop policy if exists "home_setups own" on public.home_setups;
create policy "home_setups own"
  on public.home_setups for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
