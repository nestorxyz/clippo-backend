# DoryAI backend

The private service boundary for DoryAI chat and content processing. It accepts
authenticated service-to-service requests from Convex, calls Gemini, extracts
supported media, and writes user-scoped results back through privileged Convex
functions.

The GitHub repository and package retain the historical `clippo-backend` name.
DoryAI is the current product name.

The cross-repository runtime and trust-boundary map lives in
`../web-app/docs/ARCHITECTURE.md` in the shared local workspace.

## Local setup

Requirements: a current Node.js LTS release, npm, the web/Convex project in
`../web-app`, and `ffmpeg` plus Python/yt-dlp for full Instagram/TikTok media
processing. When Python is unavailable, the current implementation deliberately
falls back to metadata-only results.

```sh
npm install
cp .env.example .env
npm run dev
```

Set the same `CONVEX_BACKEND_SECRET` value in this `.env` and the Convex server
environment. Never expose it to browser code or commit real values.

## Environment

```dotenv
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
CONVEX_URL=https://replace-me.convex.cloud
CONVEX_BACKEND_SECRET=replace-with-a-shared-random-secret
GEMINI_API_KEY=replace_me
FIRECRAWL_API_KEY=
X_OEMBED_INGESTION_ENABLED=false
```

`GOOGLE_AI_API_KEY` is accepted as a fallback for the social-media service, but
`GEMINI_API_KEY` is the canonical variable. The process fails fast without the
required Gemini or Convex configuration.

`FIRECRAWL_API_KEY` is optional and server-only. When set, DoryAI uses
Firecrawl once while saving a general public webpage, after the guarded native
fetch has checked its target. It does not call Firecrawl for chat retrieval,
social sources, background refresh, or URLs with credential-shaped query
parameters. The basic proxy avoids automatic enhanced-proxy credit charges.
When Firecrawl is unavailable, the native extractor saves bounded page text.
Either path stores at most 20,000 characters of content.

`X_OEMBED_INGESTION_ENABLED` is an opt-in prototype switch, off by default.
When enabled, an individual public X post may provide at most 500 characters
of its own text during link saving. It does not extract quoted posts, threads,
or media, does not call Firecrawl, and falls back to guarded metadata when the
embed is missing or too brief. Keep the switch off outside an approved
development test until X content edit/deletion and removal-request handling is
designed and verified; a working embed response alone is not release approval.

## Commands

```sh
npm run dev
npm run test
npm run build
npm run check
npm run start
```

`npm run check` is the contributor quality gate: focused Node tests followed by
strict TypeScript compilation.

## Supported-source boundary

`src/services/source-url.ts` classifies DoryAI roadmap sources without fetching
them. Instagram Reels and TikTok videos currently use the specialized short
video processor. YouTube videos and Shorts use bounded, cookie-free yt-dlp
metadata plus manual captions when available, falling back to explicitly
labeled automatic captions. When a Short has no captions, DoryAI reuses the
existing bounded short-video audio transcription path; a failed audio fallback
remains metadata-only. If YouTube blocks the server-side metadata process,
DoryAI combines bounded oEmbed metadata with Gemini's direct public-YouTube
video understanding to save a summary and transcript. If Gemini cannot analyze
the video, the result is explicitly metadata-only. YouTube is never treated as
a general webpage. LinkedIn uses explicitly degraded webpage metadata fallback.
X has an opt-in, bounded public-embed snippet prototype with the same guarded
metadata fallback. Arbitrary HTTP(S) URLs use the
general web-page boundary. That
boundary pins each request and redirect to a validated public DNS address,
accepts only standard HTTP(S) ports and HTML, and enforces timeout and
response-size limits. The same guarded transport protects caption and remote
thumbnail downloads.

General webpages save deterministic page metadata plus bounded page text.
Firecrawl main-content markdown is preferred during the save when configured;
the native text is the fallback, not a clean article extraction. A successful
fixture or read-only extraction check is not a live save/readback.

## Security and publication

- Requests to `/api/chat` must carry the shared backend secret and a valid
  user/session identity from Convex.
- Never log or commit environment values, user link contents, transcripts, or
  production payloads.
- Repository visibility, license selection, production deployment, billing,
  and data migrations require explicit owner approval and external readback.
