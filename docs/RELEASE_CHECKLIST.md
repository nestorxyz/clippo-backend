# DoryAI V1 backend release checklist

Checklist version: 2026-09-15

Verified backend implementation revision: `da7c480`

Verified paired web implementation revision: `54fbb1f`

The canonical cross-repository checklist lives at
`../../web-app/docs/RELEASE_CHECKLIST.md` in the shared DoryAI workspace. Do not
release this backend independently: its privileged Convex calls depend on the
paired web/Convex schema and functions.

Before backend release:

- [x] `npm run check` passes 42 tests plus strict TypeScript compilation.
- [x] `npm audit --audit-level=low` reports zero known vulnerabilities.
- [x] GitHub Actions run `34914995285` passed for this implementation.
- [x] The private remote feature branch resolves to `da7c480`.
- [ ] The canonical paired checklist's authenticated ingestion, retrieval,
  retry, billing, Preview, and security-history gates are complete.
- [ ] The final web/Convex revision is deployed and its schema/functions are
  verified before this backend revision.
- [ ] Explicit production-deployment approval is recorded at action time.
- [ ] Backend health and the end-to-end authenticated matrix are read back from
  the exact deployed revisions.

Update both checklist revision lines whenever either candidate changes.
