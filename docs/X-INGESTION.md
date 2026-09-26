# X link ingestion: storage and release boundary

Status: design review, 2026-09-26. The oEmbed adapter can be exercised only
through an injected test dependency; runtime activation was removed. Its
passing tests and public responses do not prove a safe persisted-content
lifecycle.

## Product target

Identify what a saved public X post is about without buying X API access or
claiming to read quoted posts, threads, images, or video. Firecrawl remains
reserved for general webpages during link saving.

## Current data path

1. `extractXEmbed` can read a bounded public oEmbed response and extract the
   post's own text. If wired into runtime, `getUrlInfo` would return that text
   as `summary`, `description`, and `content`.
2. The chat orchestrator sends that response to Gemini and stores both the
   `get_url_info` result and the model's `register_link` arguments in Convex
   `chatMessages`. It also stores the registration result and final reply.
3. `registerLink` writes title, description, tags, and content to Convex
   `links` and related taxonomy tables. Duplicate enrichment can write the
   content later. Retrieval can return title, description, and a content
   excerpt to chat, creating more history copies.
4. The separate link-saving endpoint has no chat history, but it writes the
   same link fields. The existing guarded webpage fallback for X can also
   supply source-derived metadata even while the oEmbed flag is off.

Deleting or refreshing `links.content` alone therefore cannot remove all
stored copies. Neither repository currently records X post provenance for
every derived field or message.

## Candidate A: transient topic classification (preferred no-paid path)

- Use oEmbed only during the save request. Do not store verbatim post text,
  embed HTML, or the raw tool response in Convex or logs.
- Persist a neutral link title plus short topical labels/tags, visibly marked
  as DoryAI's classification rather than a quotation or current X content.
  Offer a user-authored note for details. Do not claim later chat can quote or
  answer detailed questions about the post.
- Sanitize `get_url_info` history, `register_link` arguments/results, the
  final reply, and both link-saving paths. Include regression tests that
  inspect every persisted payload, not just the link record.
- Review even non-verbatim derived labels against the current X terms and
  product Privacy notice before release. This is risk reduction, not a legal
  determination that the labels are exempt from content rules.

## Candidate B: retain a verbatim snippet

- Record post ID, source, last verification time, and every destination that
  may contain post-derived text. Update or remove title, description, content,
  taxonomy, chat tool results, model replies, and duplicate-enriched records
  when a post is edited, deleted, protected, suspended, or withheld.
- Provide a removal-request path for X and the account owner and a verified
  timely processing procedure. Fail closed when the current public state
  cannot be established; a transient oEmbed failure must not masquerade as a
  confirmed deletion or a current snapshot.
- Prove the refresh source can detect edits and all unavailable states. X's
  public oEmbed output has not been shown to provide reliable edit history or
  current-version identity; polling it alone is not accepted as proof.
- Test edit, delete, protect, provider error, retries, every storage copy, and
  authenticated save/readback before enabling the feature flag. This path may
  require X API access or another approved source and legal review.

X's [Developer Policy](https://docs.x.com/developer-terms/policy) states that
stored X Content must be kept current and modified or removed when its state
changes. Its display rules also distinguish X for Websites from other methods.
The [Edit Post help page](https://help.x.com/en/using-x/edit-post) confirms
posts can be edited; an old public embed is not sufficient release evidence.

## Release gate

Do not wire `extractXEmbed` into Railway, a local test account, Preview, or
production while the current raw-snippet path is present. Choose the
persistence model, implement it across both repositories, run local and CI
checks, then perform an approved development-only save/readback with a public
test link. Production requires a separate review and deployment decision.
