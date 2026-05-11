create table if not exists public.rate_limits (
  key text not null,
  action text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (key, action, window_start)
);

create index if not exists idx_rate_limits_updated_at
  on public.rate_limits(updated_at);

alter table public.rate_limits enable row level security;

create or replace function public.consume_rate_limit(
  p_key text,
  p_action text,
  p_window_start timestamptz,
  p_window_seconds integer,
  p_limit integer
)
returns table (
  allowed boolean,
  count integer,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.rate_limits(key, action, window_start, count, updated_at)
  values (p_key, p_action, p_window_start, 1, now())
  on conflict (key, action, window_start)
  do update set
    count = public.rate_limits.count + 1,
    updated_at = now()
  returning public.rate_limits.count into v_count;

  return query select
    v_count <= p_limit,
    v_count,
    greatest(p_limit - v_count, 0),
    p_window_start + make_interval(secs => p_window_seconds);
end;
$$;
