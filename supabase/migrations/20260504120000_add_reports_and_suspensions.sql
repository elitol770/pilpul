alter table public.users
  add column if not exists matching_suspended_at timestamptz;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.users(id) on delete cascade,
  reported_id uuid not null references public.users(id) on delete cascade,
  pairing_id uuid not null references public.pairings(id) on delete cascade,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  constraint reports_distinct_users check (reporter_id <> reported_id)
);

create index if not exists idx_reports_status_created_at
  on public.reports(status, created_at desc);

create index if not exists idx_reports_pairing_created_at
  on public.reports(pairing_id, created_at desc);

create index if not exists idx_users_matching_suspended_at
  on public.users(matching_suspended_at)
  where matching_suspended_at is not null;

alter table public.reports enable row level security;
