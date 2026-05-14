# Security Policy

Pilpul pairs strangers for sustained one-on-one study, stores private notebooks, and handles uploaded PDFs. Please treat security and privacy reports seriously.

## Supported Version

The `main` branch is the supported version.

## Reporting a Vulnerability

Do not open a public GitHub issue for a vulnerability.

Use GitHub private vulnerability reporting once it is enabled for the public repository.

If private vulnerability reporting is not available yet, contact the maintainer privately through the GitHub repository owner and mark the message as a security report.

Please include:

- A short summary of the issue.
- Steps to reproduce.
- The affected route, component, or file when known.
- Whether user data, PDFs, notes, API keys, sessions, or matching safety are affected.
- Any logs or screenshots that do not expose private user data.

## Response Expectations

The maintainer should acknowledge a valid report within 72 hours when possible.

High-severity issues should be prioritized over feature work. Examples include:

- Supabase service role key exposure.
- Resend API key exposure.
- Session fixation or session theft.
- Unauthorized access to private PDFs.
- Unauthorized access to notebooks.
- Ability to impersonate a user.
- Report or suspension bypass.
- Stored XSS in notes, text metadata, reports, or user profile fields.
- SSRF or unsafe PDF fetching behavior.

## Secret Handling

Never commit real secrets.

Sensitive values include:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `RESEND_API_KEY`
- Anthropic API keys
- OpenAI API keys
- OpenAI-compatible provider keys
- Cloudflare tokens
- Supabase access tokens
- Production cookies or session IDs

Only `.env.example` should be tracked.

For Cloudflare local development, keep secrets in `.dev.vars` or in Cloudflare dashboard secrets. `.dev.vars` must never be committed.

Run `npm run secrets:scan` before making the repository public or before accepting outside pull requests. The scanner reports only file paths and commit ids, never the secret value.

If a secret is exposed:

1. Revoke or rotate it immediately.
2. Check whether it was pushed to GitHub.
3. If it was pushed, assume it is compromised even if the repository was private.
4. Remove it from the current tree.
5. Consider history cleanup only after rotation. Rotation matters first.

## User Data

Pilpul should minimize what it stores.

Private data includes:

- Email addresses.
- First names and cities.
- Uploaded PDFs.
- Imported PDF storage paths.
- Shared notebook content.
- Reports and report details.
- Pairing history.

Do not add analytics, session recording, third-party tracking, or ad pixels without a public discussion and documentation update.

## AI Keys

Pilpul's intended AI model is bring-your-own-key.

AI keys should remain in the browser and should not be sent to Pilpul servers. If a future feature stores keys server-side, it must include encryption, explicit consent, deletion controls, and a security review.

## PDF Fetching

PDF import can become an SSRF risk. Keep these constraints in place:

- Limit fetched file size.
- Require PDF content.
- Avoid following unsafe internal network URLs.
- Do not store arbitrary HTML as a text source.
- Treat source URLs as user-provided content.

## Dependencies

Run checks before shipping:

```bash
npm run check
npm run build
npm audit
```

`npm audit` can produce noisy dependency findings. Prioritize exploitable server-side issues, browser XSS paths, PDF parsing risks, and auth/session problems.
