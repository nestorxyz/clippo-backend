# Publication rights review

Reviewed: 2026-09-15

This is an engineering inventory, not legal advice.

The production dependency tree contains 152 external package/version entries.
Most are MIT, ISC, Apache-2.0, or BSD licensed. Sharp's optional libvips
packages include LGPL-3.0-or-later terms and need notice-aware review for any
distributed server bundle. The old `async@0.2.10` manifest does not declare a
license and enters transitively through `fluent-ffmpeg`; replacement of that
unmaintained package is a publication-maintenance item. `npm audit --omit=dev
--audit-level=low` reports zero known vulnerabilities.

The repository has no first-party image/font bundle outside dependencies. The
owner selected AGPL-3.0-only on 2026-09-19. Do not change visibility until the
full-history credential finding is resolved and the clean public-clone readback
passes.
