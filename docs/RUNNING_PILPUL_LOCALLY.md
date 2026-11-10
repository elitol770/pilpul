# Running Pilpul Locally

Run a separate local Pilpul instance for development, using disposable accounts and PDFs. This guide covers the Express development server and local Supabase. Production Cloudflare Pages/Functions deployment remains a separate task in [issue #5](https://github.com/elitol770/pilpul/issues/5).

## Prerequisites

- Node.js 24 LTS with npm. Check `node --version` and `npm --version`.
- A running Docker-compatible container engine for the standard Supabase CLI setup. Check `docker ps` before starting.
- The [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started), pinned to **2.121.0** for this repository. Check `supabase --version`. Commands below use `supabase`; you can substitute `npx --yes supabase@2.121.0` without changing your global installation. CLI 3 rejects the repository's existing `[inbucket]` configuration; do not use an unpinned latest CLI for this guide.
- Git, this repository cloned to your machine, and a terminal opened in its root directory.

Use the existing `supabase/config.toml`; do not run `supabase init` over it. No hosted Supabase project, Cloudflare account, Resend account or AI key is needed for the basic local flow. Keep local development separate from production data and credentials.

## 1. Install and start Supabase

```bash
npm ci
supabase start
supabase status
```

The initial start downloads service images and applies the migrations in `supabase/migrations`. It can take several minutes. Use the URLs printed by the CLI; with the checked-in configuration, the API is `http://127.0.0.1:54321` and Studio is `http://127.0.0.1:54323`.

Record the CLI version and local service URLs when reporting a setup problem. Do not post the secret keys or full status output in an issue.

## 2. Configure the local application

Create `.env` in the repository root. If copying `.env.example`, **replace its remote `APP_ORIGIN` and clear its placeholder Resend key**. For on-screen local sign-in links, use:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=replace-with-your-local-server-secret
APP_ORIGIN=http://localhost:5000
RESEND_API_KEY=
ALLOW_DEV_MAGIC_LINKS=false
ALLOW_UNVERIFIED_EMAIL_CLAIM=false
```

Replace the server-secret placeholder with the **Secret key** (`sb_secret_...`) from your local CLI, or the legacy **service_role** JWT if that is what your CLI provides. A **Publishable key** (`sb_publishable_...`) or legacy **anon** JWT is not a server secret. See [Supabase's key types](https://supabase.com/docs/guides/getting-started/api-keys).

The application reads its server credential from `SUPABASE_SERVICE_ROLE_KEY` regardless of the key's format. Never put it in a `VITE_*` variable, browser code, a screenshot or a commit. `.env` is ignored by Git. `SUPABASE_ANON_KEY` is not needed by Pilpul's current server-mediated data flow.

| Variable                       | Local use                                                                                                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`                 | Required: your local API URL.                                                                                                                                                          |
| `SUPABASE_SERVICE_ROLE_KEY`    | Required: your local server secret, never a publishable/anon key.                                                                                                                      |
| `APP_ORIGIN`                   | Set to `http://localhost:5000`; generated sign-in links must return to this instance.                                                                                                  |
| `RESEND_API_KEY`               | Leave empty for on-screen development links. Set only when deliberately testing email delivery.                                                                                        |
| `RESEND_FROM_EMAIL`            | Optional sender for Resend, for example `Pilpul <onboarding@resend.dev>`.                                                                                                              |
| `MAINTAINER_EMAILS`            | Optional comma-separated email allowlist for the maintainer view.                                                                                                                      |
| `ALLOW_DEV_MAGIC_LINKS`        | Keep `false`. Localhost already permits development links when no mail key is set. `true` also permits returning a sign-in link for a nonlocal origin; it is not a Resend requirement. |
| `ALLOW_UNVERIFIED_EMAIL_CLAIM` | Keep `false`; the local magic-link flow does not need this legacy bypass.                                                                                                              |
| `PORT`                         | Optional: defaults to `5000`. If changed, update `APP_ORIGIN` and the browser URL to match.                                                                                            |

Restart the application after changing `.env`. Use `localhost` consistently for the application, because cookies for `localhost` and `127.0.0.1` are separate. The database API may still use `127.0.0.1`.

## 3. Start Pilpul and sign in

```bash
npm run dev
```

Open `http://localhost:5000`. The development server binds to `0.0.0.0`, so use a trusted local environment rather than a public tunnel or shared production host. Development logs can contain sign-in links and account data; do not publish them unredacted.

Enter a disposable address such as `reader@example.invalid`. With `RESEND_API_KEY` empty and a local `APP_ORIGIN`, the interface offers a development sign-in link; no email is sent. Open that link. Its address contains `/#/auth/callback?token=...`. The app verifies the token and returns to the signed-in flow. Complete the profile, including the age confirmation, before creating or matching a room.

Links expire and are single-use. Request a new link if it was already used. Do not share a sign-in URL with another person or include it in a bug report.

### Create a room and check the notebook

Create a room and give the text a title. Select the pace, commitment and language, then create the invitation. To test both participants, open the invitation in a separate browser profile, sign in with another disposable address, complete the profile, and accept it. Confirm that a notebook edit is visible to both participants.

**File uploads are not implemented in the Express development server.** Its `/api/texts/upload` endpoint deliberately returns HTTP 501 even though the shared interface displays an upload control. Use a title-only room for this local walkthrough. Testing multipart PDF upload requires the Cloudflare Pages Functions runtime; that setup belongs to issue #5. Express has a separate URL-import endpoint for public PDFs, but it is not a substitute for testing file upload.

### Test the room with a demo partner

Alternatively, finish your profile and open the browser's developer console on your **local** Pilpul tab. Run:

```javascript
await fetch("/api/demo/seed-partner", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  credentials: "include",
  body: JSON.stringify({}),
}).then((response) => response.json());
```

This uses your signed-in session to create a demo account and matching requests for both participants, then runs matching. The defaults use _Meditations — Marcus Aurelius_, medium pace, serious commitment and English; it does not preserve an arbitrary existing queue request. Use this only with your disposable local database. A demo partner does not simulate another active browser or another person's notebook edits.

## Optional: test real email delivery through Resend

Keep `APP_ORIGIN=http://localhost:5000` and `ALLOW_DEV_MAGIC_LINKS=false`. Set a valid `RESEND_API_KEY` and `RESEND_FROM_EMAIL`, then restart the server. Open the received link on the machine running Pilpul.

The `onboarding@resend.dev` test sender can deliver only to the email address associated with your Resend account. To send to other recipients, verify a domain and use a sender on that domain. This restricts **email delivery**, not token verification. See [Resend's test-domain restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).

When a mail key is configured, Pilpul attempts delivery and does not display the development link. An invalid key or rejected recipient causes an error rather than silently falling back. Clear `RESEND_API_KEY` to return to the no-email local flow. Supabase's local email inbox is not used by Pilpul's custom Resend sign-in endpoint.

## Troubleshooting

### Port 5000 is already occupied

If the server reports `EADDRINUSE` or the browser reaches another application, set `PORT=5057` and `APP_ORIGIN=http://localhost:5057` in `.env`, restart Pilpul and open that URL. Do not stop unrelated services just to free the default port.

### No local sign-in link, or a link opens the hosted website

Check that `RESEND_API_KEY` is empty and `APP_ORIGIN` is exactly your local application URL. A leftover `re_your_resend_key` from `.env.example` is treated as a configured mail key. A remote origin creates links for that remote website. Restart the server after correcting these values.

### Callback opens the landing page

Use the current branch's hash-path routing fix in `client/src/lib/hash-location.ts`. Wouter's raw hash hook includes `?token=...` in the route path; the adapter strips it only for route matching and leaves the original token in the fragment for the callback. Moving the home route is not necessary. Confirm that `POST /api/auth/verify` occurs in the browser Network panel, without copying the request token into an issue.

### Database permission errors

First confirm that the server has the local secret/service-role key, not the publishable/anon key. Check that migrations ran and that the application is pointing at the intended local database.

If an error explicitly reports missing schema/table permissions for `service_role`, inspect grants in the **local** Studio SQL editor. Bypassing row-level security does not bypass PostgreSQL table grants. Do not disable RLS or grant access to `anon`/`authenticated` to work around this error. The initial contributor reported needing a grant repair; this is environment-dependent and should be reproduced before changing migrations.

For a confirmed missing-grant error on your disposable local instance, this repair grants only the operations the application's server needs on its existing tables and rate-limit function:

```sql
grant usage on schema public to service_role;
grant select, insert, update, delete on table
  public.users, public.visitor_sessions, public.requests, public.pairings,
  public.sessions, public.reading_texts, public.reports, public.direct_invites,
  public.email_magic_links, public.rate_limits, public.request_interests
to service_role;
grant execute on function public.consume_rate_limit(text, text, timestamptz, integer, integer)
to service_role;
```

Do not apply this to a hosted project as part of this local guide. If the error remains, report the failing operation, sanitized database error and CLI version.

### Missing tables or PDF bucket

The migrations create the application's tables and private `reading-texts` bucket. For an existing local database, apply pending local migrations with `supabase migration up --local`. Never run the repository's `npm run db:push` against a linked hosted project just to fix local setup.

Only if you intend to discard **all data in this local Supabase project**, `supabase db reset --local` rebuilds it from migrations and seed. It deletes local accounts, notes and other database contents. Do not use a reset as routine troubleshooting on data you want to keep.

## Verify and stop

```bash
npm run format:check
npm run lint
npm run check
npm test
npm run secrets:scan
npm run build
```

The focused authentication tests mock email delivery; they do not certify Resend delivery or a database installation. A fresh Express setup check also needs sign-in, profile creation and room/notebook interaction as described above. Treat HTTP 501 from its PDF upload endpoint as the documented limitation, not successful PDF support. PDF upload/opening must be tested separately against Pages Functions. Record any step that remains untested.

Stop Pilpul with Ctrl+C in its terminal, then run `supabase stop` to stop this local Supabase project while retaining its development data. Do not use a destructive reset or volume deletion just to stop the services.

## Verified native alternative (experimental)

On supported macOS Apple silicon or Linux hosts without Docker, CLI 2.121.0 also has an experimental native runtime. It runs real local Supabase services as host processes. The following was used for the maintainer's fresh-database check; it disables capabilities that Pilpul's Express walkthrough does not need:

```bash
SUPABASE_EXPERIMENTAL_STACK=1 npx --yes supabase@2.121.0 start --runtime native --exclude studio,analytics,functions,realtime,mail,pooler --eager
SUPABASE_EXPERIMENTAL_STACK=1 npx --yes supabase@2.121.0 status --env
```

Keep the returned credentials local. Use the returned `API_URL` and `SECRET_KEY` for the application's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Studio is disabled in this variant. Use the same experimental flag and pinned CLI for subsequent local database commands; it maintains a separate stack from the standard Docker workflow. Do not mix commands between them. To stop this variant:

```bash
SUPABASE_EXPERIMENTAL_STACK=1 npx --yes supabase@2.121.0 stop
```

Verification on 9 November 2026: Node 24.14.0, CLI 2.121.0 native on macOS, Chromium, application port 5057. Initial migrations, sign-in in two browser sessions, profile creation, invitation acceptance, two-way notebook synchronization and persistence after refresh passed without a manual grant repair. The Express upload endpoint returned the documented 501. Docker runtime, actual Resend email delivery and Pages Functions upload were not exercised by that check. The native CLI emits a deprecation warning about `[inbucket]`; this is why the guide pins the v2 CLI rather than claiming v3 compatibility.
