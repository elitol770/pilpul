# Contributing

Pilpul is a quiet tool for sustained study. Contributions should protect that purpose.

## Product Principles

- Time in study is success. Time in app is not.
- The pair is the atomic unit.
- The interface should stay calm by default.
- Real conversation matters more than performative engagement.
- AI is silent until summoned.
- Money and data practices should be honest.

Do not add feeds, likes, streaks, badges, public follower counts, engagement notifications, or ad tracking.

## Good First Contributions

Useful early work:

- Accessibility fixes.
- Mobile session-room improvements.
- PDF reader polish.
- Better empty states.
- Safer PDF fetching.
- Tests around auth, matching, request interests, and notebook conflicts.
- Documentation improvements.
- Small maintainer-dashboard improvements.

Avoid large rewrites unless there is an issue discussing the direction first.

## Local Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The local server runs at `http://localhost:5000`.

Required variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Optional variables:

- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `APP_ORIGIN`
- `MAINTAINER_EMAILS`
- `ALLOW_DEV_MAGIC_LINKS`
- `ALLOW_UNVERIFIED_EMAIL_CLAIM`

## Checks

Run these before opening a pull request:

```bash
npm run check
npm run build
npm run secrets:scan
```

If you touch dependencies or server behavior, also run:

```bash
npm audit
```

## Code Style

- Prefer existing patterns over new abstractions.
- Keep components small and specific.
- Keep text plain, calm, and useful.
- Do not add exclamation points or emoji to product copy.
- Avoid decorative animation, gradients, and attention-grabbing UI.
- Use serif type for reading content and restrained sans-serif UI chrome.

## Privacy And Safety

Before submitting a change, ask:

- Does this expose private PDFs or notes?
- Does this reveal more profile data than needed?
- Does this make it easier to harass a partner?
- Does this preserve the ability to leave or report a pairing?
- Does this send user data to a third party?
- Does this store an AI API key anywhere server-side?

If the answer is yes or uncertain, call it out in the pull request.

## Pull Request Format

Use this structure:

```markdown
## Summary

- What changed?
- Why?

## Verification

- `npm run check`
- `npm run build`
- Any manual test steps

## Privacy/Safety Notes

- Data touched
- New third parties
- New storage
- New auth/session behavior
```

## License

By contributing, you agree that your contribution will be licensed under the same license as the project: AGPL-3.0-or-later.
