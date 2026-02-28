# Code Cleanup Prompt

You are cleaning up the `graphs` branch PR. The goal is to **reduce total lines of code without breaking anything**. The current source (non-test, non-doc) is ~5,238 lines across 30 files. Track your before/after line count.

## Scope

Only touch files in this PR. Run `gh pr view --json files` if you need the list. Do NOT touch ticket files, docs, lock files, or config files. The two codebases are:

- `site/src/` — Astro + React frontend (graph visualization with Sigma.js)
- `graph-pipeline/src/` — Node/Hono backend (Last.fm/Spotify ingestion, graph DB, API)

**Test files**: You may update import paths in test files when you delete or merge source files. Do NOT rewrite test logic, add tests, or remove tests — only fix broken imports.

## Phase 1: Remove Unnecessary Abstractions

Work through each file. For every helper function, type alias, or wrapper:
- If it's used exactly once, inline it at the call site.
- If it's a thin wrapper that just forwards args, remove it.
- If a type is `Foo | undefined` or `Foo | null` but the value is always present in practice, remove the optionality.

Specific known targets:
- `site/src/hooks/GraphContext.tsx` (135 lines) — **completely dead code**, never imported anywhere. Delete it.
- `site/src/lib/graph-types.ts` (52 lines) — only imported by 3 files. Consider inlining types where they're used, or merging into `graph-api.ts`.
- `graph-pipeline/src/ingestion/types.ts` (37 lines) — check if these types are only used in one place. If so, move them there.
- `graph-pipeline/src/analysis/enrich.ts` (78 lines) — this is a thin orchestrator that calls pagerank, clusters, and stats. If it's just glue, consider inlining at the call sites in `app.ts`.
- `graph-pipeline/src/server/index.ts` (15 lines) — tiny entry point, probably fine to keep.

## Phase 2: React Cleanup

Apply React best practices to the `site/src/components/` files:
- `GraphView.tsx` (420 lines) has `GraphInner`, `GraphNavigator`, and `GraphHeader` as inner components. If `GraphHeader` is just a static div, inline it. If `GraphNavigator` is a tiny effect-only component, see if it can be a hook or inlined.
- `useGraphData.ts` (144 lines) and `useClusterInfo.ts` (84 lines) — if `useClusterInfo` is only used in one place and is simple, inline it.
- `GraphTooltip.tsx` (69 lines) — exports `NodeTooltip` and `EdgeTooltip`. If these are trivial JSX, inline them in GraphView.
- `GraphFilters.tsx` (103 lines) — headless component that uses sigma hooks to apply filters. Check if this can be merged into GraphEvents.tsx since both use `useRegisterEvents`/`useSigma`.
- Remove any `useCallback`/`useMemo` that wraps trivial operations or values that don't cause re-renders anyway.

## Phase 3: Merge Small Files

After inlining, some files will be nearly empty. Merge files that belong together:
- `graph-api.ts` + `graph-types.ts` → single `graph-api.ts`
- `GraphTooltip.tsx` → into `GraphView.tsx` or `NodeDetailPanel.tsx` if small enough
- `GraphFilters.tsx` → into `GraphEvents.tsx` if they share the same sigma context concerns
- `useClusterInfo.ts` → into `useGraphData.ts` if it's tightly coupled
- `graph-pipeline/src/analysis/` — if `enrich.ts` gets inlined, check if `stats.ts` is also thin enough to merge into the caller
- `graph-pipeline/src/ingestion/types.ts` → into whichever file actually uses the types

## Phase 4: Extract Justified Abstractions

Now that the codebase is lean and the slop is gone, look for **actual repeated patterns** — code that appears 4+ times with the same structure. Only then extract a shared function.

Candidates to look for:
- Error handling patterns in `app.ts` pipeline routes (the `try/catch` + `c.json({ error: ... }, 500)` pattern repeats across every POST handler)
- Node/edge iteration patterns in `graph-api.ts`, `build-graph.ts`, or `database.ts` (e.g., iterating `Object.entries(graph.nodes)` with the same transform)
- Hono route parameter validation (the `songKey` format check + 400 response appears in multiple routes)

Rules for this phase:
- The repeated code must appear **4 or more times** with the same shape. 3 is not enough.
- The extracted function must make the call sites shorter and clearer, not just different.
- Name the function after what it does, not what it wraps.
- Do NOT create utility files or `helpers.ts` — put the function in the file where it's most used, and export if needed by one other file.

## Test Plan

Run this full checklist after **each phase**. Do not move to the next phase if anything fails.

**Server management**: Kill any running servers before each test run. Start fresh servers for each phase. Use `lsof -ti:3001 | xargs kill -9` and `lsof -ti:4321 | xargs kill -9` to ensure clean ports.

### Automated Tests
1. `cd graph-pipeline && yarn test` — all backend unit tests pass
2. `cd site && yarn test` — all frontend unit tests pass

### Backend Smoke Tests
3. Kill any process on port 3001, then start the server: `cd graph-pipeline && npx tsx src/server/index.ts &`
4. Wait for the server to be ready, then run:
   - `curl http://localhost:3001/graph/stats` — returns JSON with `totalNodes`, `totalEdges`, `metadata`
   - `curl http://localhost:3001/graph?limit=2` — returns JSON with `nodes` (2 entries), `pagination.hasMore: true`
   - `curl http://localhost:3001/graph/analysis` — returns JSON with `pageRank`, `clusters`, `stats` keys
   - Pick a songKey from the response and hit `curl http://localhost:3001/graph/node/<songKey>` — returns node data

### Pipeline / Scraper Smoke Tests
5. With the server still running from step 3:
   - `curl -X POST http://localhost:3001/pipeline/fetch/lastfm` — returns JSON with `status: "complete"`, `scrobbleCount` > 0, and a `logs` array
   - `curl -X POST http://localhost:3001/pipeline/build` — returns JSON with `status: "complete"`, `nodes` > 0, `edges` > 0, `clusters` > 0, `pageRankConverged: true`
   - `curl -X POST http://localhost:3001/pipeline/fetch/spotify` — returns either a success response or `400` with `"Not authorized"` (both are acceptable, confirms the route exists and handles state correctly)
6. Kill the server on port 3001

### Frontend Smoke Tests
7. `cd site && yarn build` — Astro production build completes without errors
8. Confirm `graph.astro` page is included in build output (check for it in `dist/`)
9. Kill any process on port 4321, then start the dev server: `cd site && yarn dev &`
10. Wait for the server to be ready, then:
    - `curl -s http://localhost:4321/graph` — returns HTML (not JSON), and the response body contains `GraphView` or `sigma` or `<canvas` (confirms the React component is being rendered, not raw API data)
11. Kill the dev server on port 4321

### Regression Checklist
After all phases are complete, re-run the full test plan one final time and confirm:
- No new TypeScript errors: `cd graph-pipeline && npx tsc --noEmit` and `cd site && npx tsc --noEmit`
- No new lint errors: `cd graph-pipeline && yarn lint` and `cd site && yarn lint`
- Run formatters: `cd graph-pipeline && yarn format` and `cd site && yarn format`
- Line count reduced from baseline 5,238 lines — report the final number

## Code Style

The two packages have different formatting rules. You must follow them exactly.

### `graph-pipeline/` (`.prettierrc`)
- Semicolons: **yes**
- Quotes: **double**
- Tab width: **4 spaces**
- Trailing commas: **all**
- ESLint: `@eslint/js` recommended + `typescript-eslint` recommended

### `site/` (`.prettierrc.json`)
- Semicolons: **no**
- Quotes: **double**
- Tab width: **4 spaces**
- Trailing commas: **es5**
- Print width: **100**
- ESLint: `@eslint/js` recommended + `astro` recommended + `react` recommended + `react-hooks` recommended
- `no-unused-vars` and `@typescript-eslint/no-unused-vars` are **off**
- `react/react-in-jsx-scope` and `react/prop-types` are **off**

After making changes, run formatters before committing:
- `cd graph-pipeline && yarn format`
- `cd site && yarn format`

## Rules

1. **Run the test plan after each phase.** Do not proceed if anything fails.
2. Do NOT change any public API behavior (HTTP endpoints, response shapes).
3. You may update test file imports when source files are deleted/merged. Do NOT rewrite test logic.
4. Preserve all JSDoc comments on public/exported functions. Remove comments that just restate what the code does.
5. When inlining, prefer readability over minimal lines — don't create 200-char single lines.
6. Report final line count vs starting 5,238 lines.
