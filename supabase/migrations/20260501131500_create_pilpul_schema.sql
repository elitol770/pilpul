create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text,
  city text,
  timezone text,
  age_confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.visitor_sessions (
  visitor_id text primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  updated_at timestamptz not null default now()
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  text_title text not null,
  pace text not null check (pace in ('slow', 'medium', 'fast')),
  commitment text not null check (commitment in ('casual', 'serious')),
  schedule_windows text,
  language text not null default 'English',
  status text not null default 'open' check (status in ('open', 'matched', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.pairings (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.users(id) on delete cascade,
  user_b_id uuid not null references public.users(id) on delete cascade,
  text_title text not null,
  text_source text,
  pace text check (pace in ('slow', 'medium', 'fast')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'completed', 'dissolved')),
  next_session_at timestamptz,
  notebook_content text not null default '',
  notebook_updated_at timestamptz not null default now(),
  constraint pairings_distinct_users check (user_a_id <> user_b_id)
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  pairing_id uuid not null references public.pairings(id) on delete cascade,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  recap text,
  created_at timestamptz not null default now()
);

create index if not exists idx_requests_status_created_at
  on public.requests(status, created_at);

create index if not exists idx_requests_user_status
  on public.requests(user_id, status);

create index if not exists idx_pairings_status_started_at
  on public.pairings(status, started_at desc);

create index if not exists idx_pairings_user_a
  on public.pairings(user_a_id, status, started_at desc);

create index if not exists idx_pairings_user_b
  on public.pairings(user_b_id, status, started_at desc);

create index if not exists idx_sessions_pairing_created_at
  on public.sessions(pairing_id, created_at desc);

alter table public.users enable row level security;
alter table public.visitor_sessions enable row level security;
alter table public.requests enable row level security;
alter table public.pairings enable row level security;
alter table public.sessions enable row level security;
