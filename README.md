# Pilpul

Pilpul is a calm, open-source web app for reading one text with one other person.

The core promise is simple: one text, two minds, anywhere on Earth.

It is not a social network. There are no feeds, streaks, badges, public profiles, likes, ads, or engagement loops. Pilpul exists to help two people stay with a shared text long enough for the conversation to sharpen them.

Live app: https://pilpul.org

## Why This Is Open Source

Study tools should be trustworthy. Pilpul is open source so people can inspect how matching, sessions, notes, PDF handling, and AI key usage work.

Open source also protects the project from drifting into the wrong incentives. The app should be accountable to readers, not advertisers or attention metrics.

## Looking For Help

The best first contributions are small, user-visible improvements:

- Accessibility fixes in the session room and PDF reader.
- Mobile layout polish for reading and note-taking.
- Tests for matching, PDF fetching, auth, and notebook behavior.
- Clearer empty states for waiting, requests, and notebooks.
- Documentation that helps another person run the app locally.
- Screenshots for the README and release docs.

Start with `good first issue` items on GitHub or read `docs/CONTRIBUTOR_START_HERE.md`.

For sharing the project publicly, see `docs/LAUNCH_AND_OUTREACH.md`.

## What It Does

- Pair people for sustained one-on-one study.
- Let users upload a private PDF or fetch a PDF from the web.
- Provide a quiet study room with a PDF reader, shared notebook, and voice or video.
- Keep AI silent until summoned.
- Support bring-your-own-key AI through Anthropic, OpenAI, or OpenAI-compatible providers.
- Track private notebooks and reading history.
- Provide a simple open requests board for people looking to read the same text.

## What It Refuses

- No feed.
- No followers.
- No likes.
- No streaks.
- No badges.
- No ads.
- No data harvesting.
- No AI that interrupts the room.

## Stack

- React, Vite, Tailwind, and shadcn/ui
- Express backend and Cloudflare Pages Functions
- Supabase persistence and Supabase Storage
- wouter hash routing
- TanStack Query
- Jitsi public meet embed for audio and video
- PDF.js for in-app PDF reading
- Browser-side bring-your-own-key AI calls

## Screens

1. Sign-in
2. Home
3. Find a partner
4. Queue
5. Open requests board
6. Private invite flow
7. Session room
8. Notebook archive
9. About page
10. Maintainer dashboard

Screenshots should be added before the public launch. See `docs/screenshots/README.md`.

## Run Locally

```bash
npm install
cp .env.example .env
npm run dev
```

The app opens on `http://localhost:5000`.

Required local environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional environment variables:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `APP_ORIGIN`
- `MAINTAINER_EMAILS`
- `ALLOW_DEV_MAGIC_LINKS`
- `ALLOW_UNVERIFIED_EMAIL_CLAIM`

## Build

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## Contributing

Contributions are welcome when they protect the mission: quiet study, private notes, no feeds, no ads, no engagement loops.

Before opening a pull request:

```bash
npm run check
npm run build
npm run secrets:scan
```

See `CONTRIBUTING.md` and `docs/CONTRIBUTOR_START_HERE.md`.

## Secret Scan

Before publishing the repository or accepting outside code:

```bash
npm run secrets:scan
```

The scanner checks tracked files and Git history for high-confidence API key patterns without printing secret values.

## Database

Supabase migrations live in `supabase/migrations`.

```bash
npm run db:push
```

## Authentication

Production sign-in uses short-lived, one-time magic links sent through Resend. The link returns to `/#/auth/callback`, where the app verifies the token and links the browser to the Supabase user record with an HttpOnly session cookie.

Local development can expose a dev sign-in link when Resend is not configured.

High-risk endpoints use database-backed rate limits in Supabase so counters survive Cloudflare isolate restarts.

## AI Third Seat

AI is a feature, not the product.

The AI panel is closed by default and only runs when a user invokes it. Users bring their own Anthropic, OpenAI, or OpenAI-compatible API key. Keys are sent from the browser to the chosen provider for that request and are not stored on Pilpul servers.

## Matching

Matching is implemented in `server/matching.ts`.

- Hard constraint: commitment level must match.
- Soft scoring: text title, pace, and language overlap.
- Minimum threshold: `20`.

## Demo Seed

To experience the session room solo, create a request from `/find`, land on `/queue`, then call:

```bash
POST /api/demo/seed-partner
```

This creates a fake partner and matches with you instantly.

## Aesthetic Constraints

- Paper `#f7f3ec`
- Ink `#2a2520`
- Muted `#6b645c`
- Rule `#d8d0c2`
- Accent `#8b6f47`
- Soft fill `#fcfaf5`
- Serif body, sans-serif UI chrome
- Tabular figures
- No gradients
- No shadows
- No exclamation points
- No emoji
- Quiet voice

## Open-Source Release

Before making the GitHub repository public, complete `docs/OPEN_SOURCE_RELEASE_CHECKLIST.md`.

At minimum:

- Rotate any API keys that were ever pasted into a chat, terminal, issue, or local file.
- Confirm only `.env.example` is tracked.
- Run `npm run secrets:scan`.
- Add screenshots.
- Review `SECURITY.md`.
- Review `CONTRIBUTING.md`.
- Confirm the license.

## License

Pilpul is licensed under the GNU Affero General Public License v3.0 or later. See `LICENSE`.

The AGPL is intentional: if someone improves Pilpul and hosts it as a network service, the people using that service should be able to receive the source code for those improvements.
