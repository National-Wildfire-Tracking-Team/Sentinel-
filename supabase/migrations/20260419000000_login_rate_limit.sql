-- ─── Login rate limiting for public/reporter accounts ──────────────────────
-- Enforces max 5 failed login attempts per 15-minute window.

create table if not exists public.login_attempts (
  id          bigserial primary key,
  email       text not null,
  was_success boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_email_attempted_idx
  on public.login_attempts (lower(email), attempted_at desc);

alter table public.login_attempts enable row level security;

drop policy if exists "login_attempts service-role only" on public.login_attempts;
create policy "login_attempts service-role only"
  on public.login_attempts for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function public.login_rate_limit_applies(p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case when p.role = 'admin' then false else true end
      from public.profiles p
      where lower(p.email) = lower(trim(p_email))
      order by p.created_at desc
      limit 1
    ),
    true
  );
$$;

create or replace function public.login_rate_limit_status(p_email text)
returns table (
  applies boolean,
  blocked boolean,
  failed_attempts integer,
  remaining_attempts integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_applies boolean;
  v_failed_count integer;
  v_oldest_failed timestamptz;
  v_retry_seconds integer := 0;
begin
  v_applies := public.login_rate_limit_applies(p_email);

  if not v_applies then
    return query select false, false, 0, 5, 0;
    return;
  end if;

  select
    count(*)::integer,
    min(attempted_at)
  into v_failed_count, v_oldest_failed
  from public.login_attempts
  where lower(email) = lower(trim(p_email))
    and was_success = false
    and attempted_at >= now() - interval '15 minutes';

  if v_failed_count >= 5 and v_oldest_failed is not null then
    v_retry_seconds := greatest(
      0,
      ceil(extract(epoch from ((v_oldest_failed + interval '15 minutes') - now())))::integer
    );
  end if;

  return query
  select
    true as applies,
    (v_failed_count >= 5) as blocked,
    v_failed_count,
    greatest(0, 5 - v_failed_count) as remaining_attempts,
    v_retry_seconds;
end;
$$;

create or replace function public.record_login_attempt(p_email text, p_was_success boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.login_rate_limit_applies(p_email) then
    insert into public.login_attempts (email, was_success)
    values (trim(p_email), p_was_success);
  end if;
end;
$$;

grant execute on function public.login_rate_limit_applies(text) to anon, authenticated, service_role;
grant execute on function public.login_rate_limit_status(text) to anon, authenticated, service_role;
grant execute on function public.record_login_attempt(text, boolean) to anon, authenticated, service_role;
