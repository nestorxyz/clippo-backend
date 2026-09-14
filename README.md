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
```

`GOOGLE_AI_API_KEY` is accepted as a fallback for the social-media service, but
`GEMINI_API_KEY` is the canonical variable. The process fails fast without the
required Gemini or Convex configuration.

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
video processor. YouTube, LinkedIn, and X are explicitly marked `planned` until
their extractors and live save/readbacks exist. Arbitrary HTTP(S) URLs use the
general web-page boundary; classification alone is not proof of extraction.

## Security and publication

- Requests to `/api/chat` must carry the shared backend secret and a valid
  user/session identity from Convex.
- Never log or commit environment values, user link contents, transcripts, or
  production payloads.
- Repository visibility, license selection, production deployment, billing,
  and data migrations require explicit owner approval and external readback.
