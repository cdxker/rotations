# 02 — Create Container Worker Entry Point

## Problem

The current `worker.ts` uses Hyperdrive to proxy database connections. For the container-based deployment, the Worker instead needs to manage a Cloudflare Container and route requests to it.

## Goal

Create `graph-server/src/server/container-worker.ts` — a CF Worker entry point that uses `@cloudflare/containers` to manage the graph API container.

## Requirements

### container-worker.ts

- Import `Container` from `@cloudflare/containers`
- Export a `GraphApiContainer` class extending `Container`:
  - `defaultPort = 8080`
  - `sleepAfter = "30m"` (container sleeps after 30 min idle)
- The container receives `DATABASE_URL` from the Worker's secret env var, passed via `container.env`
- Worker `fetch` handler:
  - Gets or starts the singleton container via `env.GRAPH_API_CONTAINER.getContainer()`
  - Proxies the incoming request to the container
- Export the `GraphApiContainer` class as a named export (needed for Durable Object binding)

### Env interface

```ts
interface Env {
    GRAPH_API_CONTAINER: DurableObjectNamespace<GraphApiContainer>;
    DATABASE_URL: string;
}
```

## Owner

Dev

## Acceptance Criteria

- [ ] `container-worker.ts` compiles without errors
- [ ] Exports both the default fetch handler and the `GraphApiContainer` class
- [ ] `DATABASE_URL` is passed from Worker secret to container environment
- [ ] Container sleeps after 30 min idle

## Files

- `graph-server/src/server/container-worker.ts` (create)
