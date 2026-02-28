# Agent Working Instructions (User-Specific)

These instructions were explicitly requested by the repository owner on 2026-02-28 and must be followed for PR #63 bug triage and follow-up work.

## Required Workflow

1. Pull latest changes before triage/work (`git fetch --all --prune` + fast-forward pull), but do not assume local commits/files are mine.
2. Read the active PR via `gh pr view`.
3. Read markdown docs (especially `tickets/README.md` and `tickets/TICKETS.md`) to follow local ticket workflow.
4. Read all PR comments and review comments; triage bug reports into actionable tickets.
5. Show proposed tickets to the user **before creating any ticket**.
6. After user approval, create tickets and complete all approved tickets.
7. Work ticket-by-ticket and keep each commit scoped to the ticket being addressed.
8. Commits are pre-approved for this request; proceed autonomously without per-commit permission prompts.
9. Before each commit, verify scope and list exact staged files in the commit message body or summary.

## Staging And Ownership Rules

- Use tickets to scope edits and keep ownership clear.
- Use only the git staging area for commit construction (`git add <explicit file paths>`), never broad staging.
- Stage only files I edited for the current ticket.
- If unrelated files are modified in the worktree, leave them unstaged and untouched.
- Before commit, verify staged files with `git diff --cached --name-only` and staged patch review.

## Commit Cadence Policy For This Request

- One ticket fix per commit whenever practical.
- Auto-commit is allowed for approved ticket work; do not pause for additional permission prompts.
