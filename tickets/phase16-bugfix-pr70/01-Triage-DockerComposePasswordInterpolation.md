# 01 — TRIAGE: Dollar Sign in Staging Password Causes Silent Docker Compose Truncation

## Summary

Assess whether the `$` character in the staging Postgres password causes Docker Compose variable interpolation to silently truncate the password.

## Owner

Dev

## Dependencies

- None

## Parallelizable With

- `01-Triage-HardcodedStagingCredentials.md`

## Source

- PR #70 Bugbot inline comment: `discussion_r2934370510`
- File: `docker-compose.yaml` lines 19–20

## Triage Steps

- [X] Confirm behavior: does Docker Compose interpolate `$` in YAML string values?
- [X] Trace the effective password after interpolation.
- [X] Determine impact on connectivity.
- [X] Choose disposition.
- [X] Link concrete implementation ticket if needed.

## Exit Criteria

- [X] Add a `## Triage Decision` section with decision and evidence.

## Triage Decision

**Disposition: Do Now**

**Evidence:**
- Docker Compose performs variable interpolation on unescaped `$` in YAML values. The password `kX9#mQ2$vL7nR4wB` contains `$vL7nR4wB`, which Compose interprets as env var `vL7nR4wB`.
- Since `vL7nR4wB` is not set in the environment, it resolves to an empty string, making the effective password `kX9#mQ2` — silently, with no error.
- Any application that connects using the full intended password will fail authentication.
- Fix: escape the `$` as `$$` in the compose file, OR (preferably, in conjunction with the credentials ticket) move the password to `.env` where it is not interpolated by Compose at write-time.

**Impact:** Functional breakage — staging database connections will fail for any client using the full password string.

## Notes

- This may already be in progress. Check worktree state before starting.
- If the credentials ticket is being fixed by moving to `.env`, this issue is resolved simultaneously — note that in the fix commit.
- Triage only. No production fix in this ticket.
