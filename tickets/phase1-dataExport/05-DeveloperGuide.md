# 05 — Developer Guide

## Summary

Write a comprehensive developer guide for the graph-pipeline project. This should allow a new developer (or the project owner returning after time away) to understand the codebase, set it up, and use it.

## Owner

**Dev**

## Dependencies

All other Phase 1 tickets must be complete (`00` through `05-CreateServer`). This ticket should be done last in Phase 1 so it documents the final state.

## Parallelizable With

Nothing — this is the final Phase 1 ticket.

## Acceptance Criteria

- [X] `graph-pipeline/README.md` updated (or rewritten) with:
  - Project overview and what it does
  - Prerequisites (Node version, Yarn, API keys needed)
  - Setup instructions (clone, install, `.env` configuration)
  - How to run each step of the pipeline (auth, data fetch, graph build, export)
  - How to start the API server and what endpoints are available
  - How to run tests, lint, and format
  - Project structure overview (what each directory/file does)
  - Architecture decisions summary (link to docs/ decision files)
- [X] Any CLI commands or scripts are documented with usage examples
- [X] Common troubleshooting section (API rate limits, token expiry, etc.)

## Notes

- Read through all the code and existing docs before writing. The guide should reflect what was actually built, not just what was planned.
- Keep it practical — focus on "how do I use this" over theory.

## Progress

- [X] Read all source files, docs, package.json, .env.example, and existing README
- [X] Rewrote README.md with comprehensive guide covering all acceptance criteria
- [X] Documented: overview, prerequisites, setup, usage (auth, fetch, build, store), scripts, project structure, architecture decisions, troubleshooting
- [X] Added API server docs after 05-CreateServer completed (endpoints, `npm run serve`, env vars)

### Notes
- README documents `npm` (not `yarn`) since that's what's actually used (package-lock.json, not yarn.lock)
- Usage section shows programmatic TypeScript imports for the pipeline steps
- Server section documents all 4 endpoints with a table
