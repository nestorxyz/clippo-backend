# Git-history secret review

Scan date: 2026-09-14
Tool: Gitleaks `8.30.1`, default rules, full Git history, secrets fully redacted

## Finding

- Rule: `jwt`
- Commit: `963472448f8873988d146d49539eead33a8b6ccd`
- File: `.env.example`, line 7
- Sanitized inspection: one JWT; `role=anon`; issuer and project reference are
  present; expiry is in 2035. No token, issuer, or project reference is recorded
  here.
- Current tree: the token is absent and `.env.example` contains placeholders.
- Cross-repository evidence: this is the same historical retired-provider JWT found
  in the web repository history.

## Required disposition before publication

1. The owner confirmed on 2026-09-15 that the old project/key is no longer used.
2. Obtain explicit approval for a coordinated history rewrite and force-push.
3. Rerun Gitleaks across all refs and require zero unresolved findings before
   changing repository visibility.

The repository must remain private while this finding is unresolved.
