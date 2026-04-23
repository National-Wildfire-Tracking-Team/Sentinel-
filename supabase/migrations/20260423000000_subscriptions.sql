-- ═══════════════════════════════════════════════════════════════════════════
-- Sentinel – Subscription / Paid Plan Schema
-- Adds a `subscriptions` table to track Stripe subscription state per user.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. subscriptions table ─────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,

  -- Stripe identifiers
  stripe_customer_id    text unique,
  stripe_subscription_id text unique,
  stripe_price_id       text,

  -- Plan details
  plan                  text not null default 'free'
                          check (plan in ('free', 'pro', 'team')),
  status                text not null default 'active'
                          check (status in ('active', 'trialing', 'past_due', 'canceled', 'incomplete', 'unpaid')),

  -- Billing cycle
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists subscriptions_user_idx
  on public.subscriptions(user_id);

create index if not exists subscriptions_stripe_customer_idx
  on public.subscriptions(stripe_customer_id);

-- ─── 2. Auto-updated `updated_at` ────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ─── 3. Auto-create a free subscription row for every new user ───────────────
create or replace function public.handle_new_user_subscription()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, plan, status)
  values (new.id, 'free', 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_subscription on auth.users;
create trigger on_auth_user_created_subscription
  after insert on auth.users
  for each row execute function public.handle_new_user_subscription();

-- ─── 4. Helper: get current plan for the requesting user ─────────────────────
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
       and status in ('active', 'trialing')
     limit 1),
    'free'
  );
$$;

-- ─── 5. RLS ──────────────────────────────────────────────────────────────────
alter table public.subscriptions enable row level security;

-- Users can read their own subscription
drop policy if exists "subscriptions self read" on public.subscriptions;
create policy "subscriptions self read"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Only service role (Edge Functions / webhook) can insert / update
drop policy if exists "subscriptions service write" on public.subscriptions;
create policy "subscriptions service write"
  on public.subscriptions for all
  using (public.is_admin())
  with check (public.is_admin());
