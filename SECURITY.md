# Security Policy

## Supported versions

Security fixes are applied to the latest commit on the `main` branch.

## Reporting a vulnerability

Do not open a public issue, discussion, or pull request for a suspected
vulnerability.

Use GitHub's private vulnerability reporting form:

https://github.com/jthy10/nopostnow/security/advisories/new

Include the affected component, reproduction steps, impact, and any suggested
mitigation. Remove real credentials and private user content from the report.
You should receive an acknowledgment within seven days.

## Secrets

Firebase Web SDK configuration is public by design. The following values are
secrets and must never be committed, logged, placed in client-side variables, or
shared in an issue:

- Firebase service-account private keys
- `FIREBASE_SERVICE_ACCOUNT_JSON`
- `VAPID_PRIVATE_KEY`
- `CRON_SECRET`
- Transactional email API keys such as `RESEND_API_KEY`
- User passwords, session cookies, and Firebase ID or refresh tokens

If a secret is exposed, revoke or rotate it immediately; deleting it from the
latest Git commit is not sufficient.

## Deployment expectations

Production operators should:

- Keep `REQUIRE_ADMIN_MFA=true` and require TOTP for administrators.
- Use Application Default Credentials or a managed secret store.
- Deploy the repository's Firestore and Storage rules with each release.
- Enable Firebase App Check where supported by their deployment.
- Enable GitHub secret scanning, push protection, Dependabot, and CodeQL.
- Review Firebase Authentication, IAM, billing, and audit logs regularly.
- Authenticate transactional email with SPF, DKIM, and DMARC, and keep
  verification-email open and click tracking disabled.
