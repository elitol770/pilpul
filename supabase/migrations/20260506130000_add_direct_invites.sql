create table if not exists public.direct_invites (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  inviter_id uuid not null references public.users(id) on delete cascade,
  text_title text not null,
  text_source_id uuid references public.reading_texts(id) on delete set null,
  pace text not null check (pace in ('slow', 'medium', 'fast')),
  commitment text not null check (commitment in ('casual', 'serious')),
  schedule_windows text,
  language text not null default 'English',
  status text not null default 'open' check (status in ('open', 'accepted', 'cancelled')),
  pairing_id uuid references public.pairings(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create index if not exists idx_direct_invites_inviter_created_at
  on public.direct_invites(inviter_id, created_at desc);

create index if not exists idx_direct_invites_status_created_at
  on public.direct_invites(status, created_at desc);

alter table public.direct_invites enable row level security;
