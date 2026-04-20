-- Create saved_locations table for authenticated users to save named locations
-- and receive fire/weather alert summaries for each.
create table if not exists public.saved_locations (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  address        text not null default '',
  latitude       double precision not null,
  longitude      double precision not null,
  alerts_enabled boolean not null default true,
  created_at     timestamptz not null default now()
);

create index if not exists saved_locations_user_idx
  on public.saved_locations(user_id);

alter table public.saved_locations enable row level security;

drop policy if exists "saved_locations own" on public.saved_locations;
create policy "saved_locations own"
  on public.saved_locations for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
