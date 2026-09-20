# Contributing to the DoryAI backend

DoryAI is licensed under AGPL-3.0-only. The repository remains private only
while the approved history cleanup and final publication checks are completed.

## Development flow

1. Branch from the current integration branch.
2. Keep one behavioral change per commit when practical.
3. Add or update focused tests for changed behavior.
4. Run `npm run check` before requesting review.
5. Describe any environment, API, data-model, deployment, or compatibility
   consequence in the review summary.

Never commit `.env` files, provider payloads, user URLs/content, transcripts,
tokens, or production data. Use synthetic fixtures.

## Source support

Classifying a URL is not the same as successfully extracting or saving it.
Changes that add a source must include:

- representative synthetic/fixture cases;
- explicit fallback and error behavior;
- SSRF, redirect, size, timeout, and content-type boundaries for network fetches;
- provenance in the normalized result;
- an approved live save/readback before the source is described as supported.

## Pull request evidence

Include the exact commands run and their results. Builds do not prove live
Gemini, Convex, source-platform, or deployment behavior; include those readbacks
only when they were actually performed.
