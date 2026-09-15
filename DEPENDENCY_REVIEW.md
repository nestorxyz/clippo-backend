# Direct dependency license and security review

Observed from the installed lockfile on 2026-09-14.

## Security

- `npm audit --audit-level=low`: zero known vulnerabilities after removing
  unused runtime packages and applying patched dependency updates.
- Removed as unused/legacy: `axios`, `uuid`, `@types/uuid`, bundled `npm`, `i`,
  `twilio`, the retired database client, `jsonwebtoken`, `@types/jsonwebtoken`, and
  `express-rate-limit`.
- Updated the used Sharp package to the patched `0.35` line and Google GenAI
  within its existing major line; backend tests and strict compilation pass.
- Updated `ytdlp-nodejs` from `2.3.4` to `3.4.5` after its bundled August 2025
  yt-dlp binary failed current YouTube signature extraction. The updated package
  bundles yt-dlp `2026.08.19`; the long-video path disables cookies and video
  downloads and uses an explicit Node JavaScript runtime.

## Direct package licenses

Every installed direct dependency/devDependency exposed a license in its package
manifest. The observed licenses are permissive:

- Apache-2.0: `@google/genai`, `convex`, `sharp`, `typescript`.
- BSD-2-Clause: `dotenv`.
- MIT: all other direct dependencies and devDependencies.

This is not legal advice and is not the complete publication review. Before the
repository becomes public, review transitive packages, copied/generated code,
media tooling behavior, model/provider terms, and other third-party assets;
preserve required notices and obtain the owner's DoryAI license choice.
