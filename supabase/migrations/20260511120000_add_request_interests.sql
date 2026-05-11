create table if not exists public.request_interests (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  requester_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint request_interests_unique_requester unique (request_id, requester_id)
);

create index if not exists idx_request_interests_request_status_created_at
  on public.request_interests(request_id, status, created_at desc);

create index if not exists idx_request_interests_requester_status_created_at
  on public.request_interests(requester_id, status, created_at desc);

alter table public.request_interests enable row level security;
