create table if not exists public.email_magic_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  email text not null,
  redirect_path text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_magic_links_email_created_at
  on public.email_magic_links(email, created_at desc);

create index if not exists idx_email_magic_links_expires_at
  on public.email_magic_links(expires_at);

alter table public.email_magic_links enable row level security;
