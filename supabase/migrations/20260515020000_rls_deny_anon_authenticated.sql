-- Defense-in-depth RLS policies.
--
-- Pilpul authenticates users via Passport (session cookies), not Supabase Auth.
-- All database access goes through the Express server using the
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS by design.
--
-- These policies codify the contract that no anon or authenticated client
-- (i.e. anything using the public Supabase URL/anon-key without going through
-- our server) is permitted to read or write any table. This is the same
-- behavior that "RLS enabled with no policy" gives implicitly, but stated
-- explicitly so the security model lives in version control.
--
-- If you ever introduce direct client → Supabase queries, replace the
-- per-table deny policies with real authz rules before doing so.

do $$
declare
  t text;
  tables text[] := array[
    'users',
    'visitor_sessions',
    'requests',
    'pairings',
    'sessions',
    'reading_texts',
    'reports',
    'direct_invites',
    'email_magic_links',
    'rate_limits',
    'request_interests'
  ];
begin
  foreach t in array tables loop
    execute format('alter table public.%I enable row level security', t);

    execute format(
      'drop policy if exists %I on public.%I',
      t || '_deny_anon_authenticated',
      t
    );
    execute format(
      'create policy %I on public.%I for all to anon, authenticated using (false) with check (false)',
      t || '_deny_anon_authenticated',
      t
    );
  end loop;
end
$$;
