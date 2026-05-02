insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reading-texts', 'reading-texts', false, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.reading_texts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  source_kind text not null check (source_kind in ('upload', 'web_pdf')),
  source_url text,
  storage_bucket text not null default 'reading-texts',
  storage_path text not null,
  mime_type text not null default 'application/pdf',
  file_size integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_reading_texts_owner_created_at
  on public.reading_texts(owner_user_id, created_at desc);

alter table public.reading_texts enable row level security;

alter table public.requests
  add column if not exists text_source_id uuid references public.reading_texts(id) on delete set null;

alter table public.pairings
  add column if not exists text_source_id uuid references public.reading_texts(id) on delete set null;
