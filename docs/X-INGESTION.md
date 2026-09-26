# X link ingestion: storage and release boundary

Status: verbatim-snippet direction selected by the owner on 2026-09-26;
implementation remains gated. The oEmbed adapter can be exercised only through
an injected test dependency; runtime activation was removed. Its passing tests
and public responses do not prove a safe persisted-content lifecycle.

## Product target

Retain a bounded, attributed excerpt of a public X post so a saved link is
recognizable and later retrieval can use its actual text. Do not claim to read
quoted posts, threads, images, or video. Firecrawl remains reserved for general
webpages during link saving. The earlier no-paid-X preference is still in
effect until the owner explicitly changes it.

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

## Alternative A: transient topic classification (not selected)

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

## Selected direction B: retain a verbatim snippet

- Record post ID, source, last verification time, and every destination that
  may contain post-derived text. Update or remove title, description, content,
  taxonomy, chat tool results, model replies, and duplicate-enriched records
  when a post is edited, deleted, protected, suspended, or withheld.
- Provide a removal-request path for X and the account owner and a verified
  timely processing procedure. Fail closed when the current public state
  cannot be established; a transient oEmbed failure must not masquerade as a
  confirmed deletion or a current snapshot.
- Use a current-source lookup that reports availability and edit history. X's
  [Post Lookup documentation](https://docs.x.com/x-api/posts/lookup/introduction)
  identifies the official endpoint for both; public oEmbed has not been shown
  to provide reliable current-version identity. Polling oEmbed alone is not
  accepted as proof. X's display policy also calls for the API when not using
  X for Websites.
- Test edit, delete, protect, provider error, retries, every storage copy, and
  authenticated save/readback before wiring the adapter into runtime. The
  official API requires approved access and prepaid credits. The owner's prior
  no-paid-X instruction does not authorize that purchase or ongoing spend.

### Implementation order after provider/cost approval

1. Add source provenance to a link: original post ID, current version ID,
   author, last verified time, and availability. Keep one canonical verbatim
   snippet. Do not duplicate it in title, description, taxonomy, or logs.
2. Keep the original tool response and model-supplied `register_link` content
   out of durable chat history. For later answers, either store references to
   source IDs and resolve against current content, or tag every dependent
   message so edits/deletions can purge it. Test both chat and the separate
   save endpoint.
3. Schedule bounded Post Lookup refreshes with a per-cycle spending cap. On a
   confirmed edit, replace the snippet and invalidate dependent text; on a
   confirmed deletion/protected/withheld state, remove it. On an uncertain
   provider failure, hide the snippet until verification succeeds rather than
   asserting deletion or serving stale text.
4. Provide an authenticated/operator removal path and a dated request log.
   Test a removal request across links, chat history, and search results.
5. Run local and CI checks, then a development-only authenticated save,
   Convex readback, source change/removal simulation, and grounded retrieval.
   Production remains a separate approval gate.

At [current published X API rates](https://docs.x.com/x-api/getting-started/pricing),
a Post read is listed at $0.005 per returned resource, with deduplication
within a UTC day. As an illustration, one daily check of 500 distinct saved X
posts for 30 days would be about $75 before any other billable reads. This is
not a spend authorization or a forecast of DoryAI usage.

X's [Developer Policy](https://docs.x.com/developer-terms/policy) states that
stored X Content must be kept current and modified or removed when its state
changes. Its display rules also distinguish X for Websites from other methods.
The [Edit Post help page](https://help.x.com/en/using-x/edit-post) confirms
posts can be edited; an old public embed is not sufficient release evidence.

## Release gate

Do not wire `extractXEmbed` into Railway, a local test account, Preview, or
production while the current raw-snippet path is present. The next external
decision is whether to authorize X developer access and a bounded pay-per-use
budget; the previously approved test environment does not itself authorize
paid X services. Production requires a separate review and deployment
decision.
