# Open-source readiness checklist

This checklist prepares the repository; it does not authorize making it public.

## Completed on 2026-09-14

- [x] Accurate runtime, environment, architecture, and verification README.
- [x] Secret-safe `.env.example` matching the current service boundary.
- [x] Initial test and `npm run check` quality gate.
- [x] CI definition for the quality gate.
- [x] Contributor and security guidance.
- [x] Current changed-file credential-pattern scan found no credential-shaped
      values.
- [x] Bounded Git-history string scan found only placeholder/empty examples for
      the matched retired-provider and WhatsApp keys.

## Required before public visibility

- [ ] Choose and approve an open-source license.
- [ ] Run a dedicated full-history secret scanner and resolve every finding.
- [ ] Review dependency licenses and generated/third-party assets.
- [ ] Remove or document obsolete dependencies, routes, environment variables,
      and provider references.
- [ ] Document production deployment without exposing infrastructure secrets.
- [ ] Enable private vulnerability reporting and appropriate branch protection.
- [ ] Confirm CI on a pull request from a clean clone.
- [ ] Obtain explicit approval to change visibility, then verify GitHub's public
      readback and clone/setup flow.
