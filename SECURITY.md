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
- General-page and remote-thumbnail fetching must use the shared guarded
  transport. It rejects non-HTTP(S) and nonstandard ports, blocks local/private
  DNS answers, pins connections to validated addresses, revalidates redirects,
  and bounds request time and response size.
- YouTube metadata extraction must not read browser cookies. Caption downloads
  use the guarded transport and bounded response size; full video download is
  outside the long-video metadata path. Public caption text is returned through
  the existing Gemini tool conversation and can be stored with the link in
  Convex; no caption file is uploaded to Gemini.
- `FIRECRAWL_API_KEY` is server-only. Firecrawl is optional and may receive the
  URL and public page content only after the native transport validates the
  target as public; private, local, malformed, and nonstandard-port targets are
  never delegated. Returned main-content markdown is capped at 20,000 characters.
- Temporary media and provider uploads must be removed on success and failure.
- Logs must not contain tokens, full private link libraries, transcripts, or
  production request bodies.

Repository publication requires an approved license and a dedicated full-history
secret scan. The current bounded string scan is not a substitute.
