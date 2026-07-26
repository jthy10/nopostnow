# NoPostNow

[![CI](https://github.com/jthy10/nopostnow/actions/workflows/ci.yml/badge.svg)](https://github.com/jthy10/nopostnow/actions/workflows/ci.yml)
[![CodeQL](https://github.com/jthy10/nopostnow/actions/workflows/codeql.yml/badge.svg)](https://github.com/jthy10/nopostnow/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

NoPostNow is an open-source, private photo feed for trusted circles. It has no
algorithmic feed, advertising, or public account discovery. The project is
built with Next.js, React, and Firebase and is designed to be self-hosted.

## Features

- Member-only photo sharing, likes, comments, mentions, and direct messages
- Installable progressive web app with optional web push notifications
- Administrator tools protected by Firebase custom claims and recent MFA
- Strict Firestore and Storage rules with owner- and role-based access
- Server-verified notification endpoints that do not trust client identities
- Responsive, mobile-first interface

## Requirements

- Node.js 20.9 or newer
- A Firebase project with a Web app, Authentication, Firestore, and Storage
- Firebase CLI access to that project
- Application Default Credentials for server routes, Vercel OIDC federation,
  or a service account stored only in your hosting provider's secret manager

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Authenticate the Firebase CLI and select your project:

   ```bash
   npx firebase login
   npx firebase use --add
   ```

3. Generate `.env.local` from the selected Firebase Web app:

   ```bash
   npm run setup:firebase -- YOUR_PROJECT_ID https://your-domain.example
   ```

   The generated file is ignored by Git. Do not commit it.

4. Supply Firebase Admin credentials. On Google-hosted runtimes, prefer
   Application Default Credentials. For local development:

   ```bash
   gcloud auth application-default login
   ```

   For non-Google hosting, set `FIREBASE_SERVICE_ACCOUNT_JSON` as a protected
   platform secret, never as a committed file or a public environment variable.

5. Deploy the security rules:

   ```bash
   npm run firebase:deploy
   ```

6. Start the app:

   ```bash
   npm run dev
   ```

## Member management

There is no public registration form. Access is controlled with Firebase custom
claims. Run these commands only from a trusted administrative environment with
Firebase Admin credentials:

```bash
$env:USER_EMAIL="member@example.com"
$env:USER_NAME="Member Name"
$env:USER_PASSWORD="a-long-unique-password"
npm run users -- create
```

Set `$env:USER_ADMIN="true"` to create or grant an administrator. Existing
accounts can be authorized with `npm run users -- grant` and disabled with
`npm run users -- revoke`. Users must sign in again after a role change so their
ID token includes the new claims.

## Production configuration

Copy the variable names in [`.env.example`](.env.example) into the hosting
platform's environment settings. Values prefixed with `NEXT_PUBLIC_` are
Firebase client configuration and are intentionally public; server credentials,
VAPID private keys, and cron secrets must remain protected.

For Vercel, prefer its [Google Cloud OIDC
integration](https://vercel.com/docs/oidc/gcp) and configure the four `GCP_*`
variables in `.env.example`. This exchanges the deployment identity for
short-lived Google credentials and avoids storing a Firebase private key.

Administrator mutations require a recent Firebase sign-in and TOTP second
factor by default. Keep `REQUIRE_ADMIN_MFA=true` in production. The scheduled
daily prompt endpoint expects `Authorization: Bearer <CRON_SECRET>`.

## Security model

NoPostNow uses a defense-in-depth model:

- Authentication verifies email and the `member` custom claim.
- Firestore and Storage rules validate ownership, roles, shapes, sizes, and
  permitted paths.
- Privileged API routes verify Firebase ID tokens with revocation checks.
- Administrator writes require an `admin` claim, a recent sign-in, and MFA.
- Push subscriptions and notification preferences are private to their owner.
- Security headers include CSP, HSTS, clickjacking protection, MIME sniffing
  protection, and a restrictive permissions policy.

See [SECURITY.md](SECURITY.md) before reporting a vulnerability. Never place
credentials, private user content, or exploit details in a public issue.

## Quality checks

```bash
npm run check
```

This runs ESLint, TypeScript, and a production build. Pull requests also run
GitHub dependency review and CodeQL analysis.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md) first.

## License

[MIT](LICENSE)
