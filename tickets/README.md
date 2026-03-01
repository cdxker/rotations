# Ticket System

## Structure

Tickets are organized into phase folders. Each phase represents a major milestone of the project.

```
tickets/
├── phase1-dataExport/    — Data ingestion, graph construction, storage, server
├── phase2-analysis/      — PageRank, stats, clustering, enriched export
├── phase3-visualization/ — Graph viz UI built into the existing site/ app
├── phase4-polish/        — Cleanup, UX improvements, and refinements
├── phase5-visual-refresh/ — Visual hierarchy redesign, artwork support, and depth exploration
├── phase6-triage/        — Review-comment triage tickets and disposition decisions
```

## Numbering = Dependency Chain

The two-digit prefix on each ticket (`00-`, `01-`, `02-`, etc.) represents its dependency level within the phase:

- **All tickets with the same number can be worked in parallel.** They have no dependencies on each other.
- **A ticket at level N depends on all tickets at level N-1 being complete.** Do not start a `03-*` ticket until all `02-*` tickets in that phase are done.
- **Phases are sequential.** Phase 2 depends on Phase 1. Phase 3 depends on Phase 2.

Example for Phase 1:
```
00  →  01  →  02 (6 tickets, all parallel)  →  03 (2 tickets, parallel)  →  04 (2 tickets, parallel)  →  05
```

## Tracking Status

The file `TICKETS.md` in this directory is the single source of truth for ticket status. When you pick up or complete a ticket:

1. **Before starting**: Update `TICKETS.md` — change `[ ]` to `[-]` for your ticket.
2. **When done**: Update `TICKETS.md` — change `[-]` to `[X]` for your ticket.
3. **Do not start a ticket that is already `[-]`** — another agent is working on it.

## Workflow for Agents

1. Read `TICKETS.md` to see what's available.
2. Check the dependency chain — only pick up tickets whose dependencies (all lower-numbered tickets in the same phase) are `[X]`.
3. Claim the ticket by marking it `[-]` in `TICKETS.md`.
4. Read the full ticket markdown file for requirements and acceptance criteria.
5. Do the work.
6. Mark it `[X]` in `TICKETS.md` when all acceptance criteria are met.
7. Look for the next available ticket.

## Owner Field

Each ticket has an `Owner` field:
- **Dev** — an agent or developer picks this up.
- **You (manual task)** — this requires the human to do something (e.g. create API keys). Agents should skip these and move to the next available ticket.

## Notes

- Multiple agents will be working concurrently. Respect the `[-]` marker — if someone else claimed it, move on.
- If you're blocked (e.g. waiting on a manual task or another agent's ticket), note it and pick up a different available ticket.
- Keep commits scoped to your ticket. Don't mix work from multiple tickets in one commit.

## Commit Hygiene

- Default rule: one commit per ticket.
- If a change has no ticket (for example repository hygiene docs like `AGENTS.md`), make a standalone patch commit that contains only the no-ticket files.
- Do not mix ticket work and no-ticket patch work in the same commit.
