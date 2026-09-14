# Security policy

## Reporting

Do not disclose a suspected vulnerability in a public issue. Use GitHub private
vulnerability reporting if it is enabled; otherwise contact the repository owner
through an existing trusted private channel.

Include the affected revision, impact, minimal reproduction, and whether any
credential or user data may have been exposed. Do not include live secrets or
private user content in the report.

## Security boundaries

- `CONVEX_BACKEND_SECRET` is server-only and shared only by Convex actions and
  this backend.
- All privileged Convex calls must retain their secret and user-scope checks.
- URL fetching must reject non-HTTP(S) schemes and, before general-page fetching
  ships, must defend against private-network/metadata endpoints, redirect abuse,
  oversized responses, and unsupported content types.
- Temporary media and provider uploads must be removed on success and failure.
- Logs must not contain tokens, full private link libraries, transcripts, or
  production request bodies.

Repository publication requires an approved license and a dedicated full-history
secret scan. The current bounded string scan is not a substitute.
