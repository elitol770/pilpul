# Open-Source Release Checklist

Use this before making the GitHub repository public.

## Repository

- [ ] Confirm the GitHub repository is still private before final review.
- [ ] Confirm `.env`, `.env.local`, and `.env.supabase.local` are not tracked.
- [ ] Confirm only `.env.example` is tracked.
- [ ] Confirm `SECURITY.md` is accurate.
- [ ] Confirm `CONTRIBUTING.md` is accurate.
- [ ] Confirm `ROADMAP.md` is accurate.
- [ ] Confirm the license is intentional.
- [ ] Add screenshots listed in `docs/screenshots/README.md`.

## Secrets

- [ ] Rotate Supabase service role keys that were ever pasted into a chat, terminal output, issue, or shared doc.
- [ ] Rotate Resend API keys that were ever pasted into a chat, terminal output, issue, or shared doc.
- [ ] Rotate Cloudflare tokens if they were ever pasted or exposed.
- [ ] Confirm no Anthropic or OpenAI keys are in the repository.
- [ ] Search current tracked files for obvious secrets.
- [ ] Consider Git history scanning before public release.

Suggested local checks:

```bash
git ls-files .env .env.local .env.supabase.local .env.example
git grep -n "SUPABASE_SERVICE_ROLE_KEY\\|RESEND_API_KEY\\|sk-ant-\\|sk-proj-\\|OPENAI_API_KEY"
```

## Production

- [ ] Confirm the live app uses production environment variables, not local placeholders.
- [ ] Confirm `APP_ORIGIN` points to the live domain.
- [ ] Confirm Resend sending works.
- [ ] Confirm magic links work.
- [ ] Confirm PDF upload works on Cloudflare Pages.
- [ ] Confirm PDF fetching rejects non-PDF content.
- [ ] Confirm private PDF signed URLs expire.
- [ ] Confirm AI keys are not sent to Pilpul servers.

## GitHub Settings

- [ ] Enable GitHub secret scanning if available.
- [ ] Enable Dependabot alerts.
- [ ] Add repository description.
- [ ] Add website URL.
- [ ] Add topics: `reading`, `study`, `pairing`, `pdf`, `supabase`, `cloudflare`, `open-source`.
- [ ] Add branch protection after the project has contributors.

## Launch Post

Use this short version:

```text
Pilpul is now open source.

It is a quiet web app for reading one text with one other person. Upload a PDF, find a partner, enter a room, read together, and keep a shared notebook.

No feeds. No streaks. No ads. AI is silent unless summoned.
```

## Do Not Launch Until

- [ ] The maintainer has rotated exposed keys.
- [ ] The live app can accept a new user through sign-in.
- [ ] A new user can create or join a room.
- [ ] A test pair can open the room, read a PDF, and write shared notes.
