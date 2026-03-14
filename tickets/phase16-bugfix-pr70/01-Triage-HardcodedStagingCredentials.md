# 01 — TRIAGE: Hardcoded Staging Database Credentials in docker-compose.yaml

## Summary

Assess whether the staging Postgres credentials committed in plain text to `docker-compose.yaml` constitute an actionable bug.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- `01-Triage-DockerComposePasswordInterpolation.md`

## Source

- PR #70 Bugbot inline comment: `discussion_r2934370509`
- File: `docker-compose.yaml` lines 19–20

## Triage Steps

- [X] Confirm issue scope.
- [X] Check if credentials appear to be real/non-trivial.
- [X] Determine appropriate fix path.
- [X] Choose disposition.
- [X] Link concrete implementation ticket if needed.

## Exit Criteria

- [X] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Do Now**

**Evidence:**
- `docker-compose.yaml` line 19–20 commits `POSTGRES_PASSWORD: "kX9#mQ2$vL7nR4wB"` directly. The password is non-trivial and appears to be a real secret (unlike the dev service which uses obvious defaults).
- Repo is private but committing credentials to git history is a security risk regardless.
- `.env` is already gitignored — moving credentials there is the correct, low-effort fix.
- Fix: Replace inline values with env var references (`${STAGING_POSTGRES_USER}`, `${STAGING_POSTGRES_PASSWORD}`) and document required vars in `.env.example` or README.

**Impact:** Credential exposure to all repo collaborators; credential persists in git history.

## Notes

- This may already be in progress. Check worktree state before starting.
- Triage only. No production fix in this ticket.
