# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `main`  | Yes       |

## Reporting a vulnerability

If you discover a security issue, **do not** open a public issue.

Contact the maintainer via GitHub private message or email the repository owner with:

- Description of the vulnerability
- Steps to reproduce
- Impact assessment

We aim to respond within 7 days.

## Security practices for deployers

- Change the default admin password (`admin@libyapostal.local` / `admin123`) immediately.
- Keep `APP_DEBUG` disabled in production.
- Use HTTPS and restrict database access to localhost or a private network.
- Do not commit real credentials; use `DB_PASSWORD` environment variable.
