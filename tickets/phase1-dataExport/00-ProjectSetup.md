# 00 — Project Setup

## Summary

Scaffold the standalone graph project at the repo root (sibling to `site/`).

## Owner

Dev

## Dependencies

None — this is the first ticket.

## Acceptance Criteria

- [ ] New directory at repo root (e.g. `graph-pipeline/` or similar)
- [ ] `package.json` initialized with TypeScript, linting, formatting
- [ ] `tsconfig.json` configured (strict mode, matching conventions from `site/`)
- [ ] Folder structure stubbed out (e.g. `src/ingestion/`, `src/graph/`, `src/analysis/`, `src/server/`)
- [ ] Decide: does this project share dependencies with `site/` (monorepo workspace) or is it fully independent?
- [ ] README with basic project description and how to run

## Notes

- The rest of the repo uses TypeScript/Node — stick with that unless there's a strong reason not to.
- Consider a monorepo workspace setup (pnpm/yarn workspaces) if shared types from `site/src/shared/types.ts` will be imported directly.

## Progress

- [X] Created `graph-pipeline/` directory at repo root
- [X] `package.json` with TypeScript, ESLint, Prettier, Vitest (ESM, yarn)
- [X] `tsconfig.json` with strict mode, ES2022 target, Node16 module resolution, `@/*` path alias
- [X] `eslint.config.js` with recommended + typescript-eslint rules
- [X] `.prettierrc` matching site/ conventions
- [X] Folder structure: `src/ingestion/`, `src/graph/`, `src/analysis/`, `src/server/`
- [X] `README.md` with project description and how-to-run
- [X] Verified lint and build pass

### Decisions
- Fully independent project (not monorepo workspace) — site/ shared types are specific to the playlist player and don't overlap with graph pipeline data model
