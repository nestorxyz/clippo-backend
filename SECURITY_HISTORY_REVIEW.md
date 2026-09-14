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
- Cross-repository evidence: this is the same historical retired-provider anon JWT found
  in the web repository history.

## Required disposition before publication

1. Identify the retired-provider project privately and verify whether it still exists.
2. If it exists, inspect row-level security and rotate the anon key, or
   deliberately decommission the project. These are external account actions
   requiring owner approval.
3. Decide whether a coordinated history rewrite is needed after the key is
   unusable. A rewrite is disruptive and separately approval-gated.
4. Rerun Gitleaks across all refs and require zero unresolved findings before
   changing repository visibility.

The repository must remain private while this finding is unresolved.
