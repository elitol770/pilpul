# Contributor Start Here

Pilpul is intentionally small. Good contributions should make the study room calmer, safer, easier to run, or easier to understand.

## First Pull Request Path

1. Pick an issue labeled `good first issue`.
2. Comment that you want to work on it.
3. Fork the repository.
4. Create a branch with a short name, for example `fix-mobile-room-tabs`.
5. Run the app locally.
6. Keep the change focused.
7. Run the checks.
8. Open a pull request and describe the user-facing change.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The app runs at `http://localhost:5000`.

For local development, use local-only values in `.env`. Do not commit `.env`, `.env.*`, `.dev.vars`, private keys, screenshots containing keys, or production data.

## Checks

Run these before opening a pull request:

```bash
npm run check
npm run build
npm run secrets:scan
```

If you changed dependencies, also run:

```bash
npm audit --audit-level=high
```

## What Makes A Good Pilpul Change

- It helps two people read, speak, listen, or keep shared notes.
- It removes confusion without adding attention-seeking UI.
- It improves privacy, safety, accessibility, or reliability.
- It keeps AI optional and quiet.
- It is small enough to review carefully.

## What To Avoid

- Feeds, likes, follower counts, badges, streaks, or growth loops.
- Analytics, trackers, ad pixels, or session recording.
- Large rewrites without a prior issue.
- New dependencies for small UI changes.
- Storing AI keys on Pilpul servers.

## Good Areas For First Contributors

- README screenshots.
- Empty states.
- Keyboard navigation.
- Mobile session-room layout.
- PDF reader edge cases.
- Tests for matching and request flows.
- Copy edits that make privacy and AI behavior clearer.

## Pull Request Notes

In the pull request, include:

- What changed.
- Why it helps a user.
- How you tested it.
- Screenshots for visual changes.
- Any privacy, safety, or cost implications.
