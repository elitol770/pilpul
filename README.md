# Pilpul

A calm, paper/ink web app pairing two people anywhere for sustained one-on-one study of a shared text.

## Stack

- React + Vite + Tailwind + shadcn/ui
- Express backend with Supabase persistence
- wouter v3 (hash routing for iframe compatibility)
- TanStack Query
- Jitsi public meet embed for audio
- AI third seat with bring-your-own key for Anthropic, OpenAI, or OpenAI-compatible providers, called directly from the browser

## Run locally

```bash
npm install
cp .env.example .env
npm run dev
```

Opens on http://localhost:5000. The server expects `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` in `.env`.

## Build for production

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## Auth model

Sign-in uses short-lived, one-time magic links sent through Resend. The link
returns to `/#/auth/callback`, where the app verifies the token and links the
browser to the Supabase user record with an HttpOnly session cookie. Local
development can expose a dev sign-in link when Resend is not configured.

High-risk endpoints use database-backed rate limits in Supabase so counters
survive Cloudflare isolate restarts.

## Demo seed

To experience the session room solo, after creating a request from `/find` and landing on `/queue`, hit:

```
POST /api/demo/seed-partner
```

This creates a fake partner ("David", Lisbon) and matches with you instantly.

## Aesthetic constraints

- Paper `#f7f3ec`, ink `#2a2520`, muted `#6b645c`, rule `#d8d0c2`, accent `#8b6f47`, soft fill `#fcfaf5`
- Serif body (EB Garamond / Iowan / Georgia), sans-serif UI chrome (Inter)
- Tabular figures, no gradients, no shadows, generous whitespace
- No exclamation points anywhere. No emoji. Quiet voice.

## Screens

1. Sign-in
2. Home (active pairing card / waiting / empty)
3. Find a partner
4. Queue
5. Session room (reader + collaborative notebook + Jitsi audio + AI third seat)
6. Notebook archive

## Matching

Greedy matcher in `server/matching.ts`:
- Hard constraint: commitment level must match
- Soft scoring: text title (100 exact / 60 substring / 30 word overlap), pace, language overlap
- Threshold: 20

## Deferred / not built

- Yjs CRDT (notebook uses 600ms debounced PUT + 2s GET poll)
- Curated rounds
- Stripe credit wrapper
- Real Sefaria/Gutenberg integration (texts hardcoded in `client/src/lib/texts.ts`)
- Yjs or another true CRDT for collaborative notes
