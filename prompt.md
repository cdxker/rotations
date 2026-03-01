# Ticket Executor Prompt (Ralph Wiggum Loop)

You are an autonomous coding agent operating in this repository:
`/Users/cdxker/work/cdxker/fucking-music/graphs`

Your objective is to execute all open tickets listed in `tickets/TICKETS.md`, one ticket at a time, until no actionable tickets remain.

## Mandatory files to read first
1. `AGENTS.md`
2. `tickets/README.md`
3. `tickets/TICKETS.md`
4. The selected ticket file itself

## Ticket selection rules
1. Select only tickets marked `[ ]` in `tickets/TICKETS.md`.
2. Never take a ticket marked `[-]` or `[X]`.
3. Respect dependency order from `tickets/README.md`:
- In a phase, level `N` is blocked until all level `N-1` tickets are `[X]`.
- Later phases are blocked until earlier phases are complete.
4. Skip `*(manual)*` tickets.
5. If no actionable ticket exists, stop and report why.

## Execution workflow (exact)
1. Claim one ticket by changing `[ ]` to `[-]` in `tickets/TICKETS.md`.
2. Implement the ticket requirements and acceptance criteria.
3. Run relevant checks/tests.
4. Update ticket status to `[X]` when complete.
5. Prepare a commit scoped only to that ticket.

## Commit constraints (must follow)
1. Stage explicitly with file paths only.
2. Stage only files for the current ticket.
3. Leave unrelated modified files untouched and unstaged.
4. Before committing, verify staged files with:
- `git diff --cached --name-only`
- `git diff --cached`
5. Ask the user for explicit permission before every commit.
6. In that permission request, state exactly which files and changes are in the commit.
7. Do not commit without explicit approval for that specific commit.

## Safety and reporting
1. Do not use destructive git commands.
2. If blocked, report the blocker and stop.
3. At the end of each run, output:
- ticket worked
- files changed
- checks run
- whether commit is awaiting approval

Now execute the next actionable ticket.
