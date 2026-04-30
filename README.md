# Chavruta

A calm, paper/ink web app pairing two people anywhere for sustained one-on-one study of a shared text.

## Stack

- React + Vite + Tailwind + shadcn/ui
- Express backend, better-sqlite3 + Drizzle ORM
- wouter v3 (hash routing for iframe compatibility)
- TanStack Query
- Jitsi public meet embed for audio
- AI third seat — currently simulated (canned responses); BYOK Anthropic input is wired in the UI but not connected to the real API

## Run locally

```bash
npm install
npm run dev
```

Opens on http://localhost:5000. SQLite DB is created automatically on first run as `data.db` in the project root.

## Build for production

```bash
npm run build
NODE_ENV=production node dist/index.cjs
```

## Auth model

There is no real magic-link email. Identity is per-browser-tab via `window.name`, mapped server-side to a user record. The "claim email" endpoint creates/loads a user by email and links them to the visitor.

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

- Cloudflare Workers/D1 (using Express + SQLite instead)
- Yjs CRDT (notebook uses 600ms debounced PUT + 2s GET poll)
- Reports, admin, curated rounds, open requests board
- Stripe credit wrapper
- EPUB/PDF upload
- Real Sefaria/Gutenberg integration (texts hardcoded in `client/src/lib/texts.ts`)
- Real Anthropic API call for AI third seat
