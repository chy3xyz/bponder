# Ponder Bun-Native Redesign

> Status: approved (2026-11-20)  
> Approach: **Product-level reshape (方案 3)**  
> Delivery: **In-place major** (Bun-only; drop Node)

## Decisions

| Topic | Choice |
|---|---|
| Node runtime | **Removed** — Bun is the only supported runtime |
| Database | **Postgres remains authoritative**; driver becomes `Bun.SQL` |
| Public API | **Major reshape allowed** — not drop-in compatible |
| Delivery | **In-place major** in this repo |
| Approach | **方案 3** — new product mental model, Bun-first end-to-end |
| GraphQL | **Optional plugin** (not default scaffold) |
| PGlite | **Demoted** — real Postgres default; PGlite optional/experimental |
| Package manager | Migrate toward **Bun workspaces + bun.lock** |
| Tests | **`bun test` only** |

## Product positioning

Ponder’s next major becomes a **Bun-native onchain indexing runtime**. Postgres is persistence only. Process model, HTTP, module loading, concurrency, and toolchain are designed around Bun primitives. The Node path (`#!/usr/bin/env node`, `@hono/node-server`, `pg`, Vite-as-loader, `worker_threads`) is deleted — no dual-runtime compatibility layer.

## Process topology

```text
bun ponder <cmd>
        │
        ├─ Control plane (main)
        │    · load config / schema (Bun runs TS directly)
        │    · Bun.serve: health, SQL/API, optional GraphQL, live SSE
        │    · schedule historical / live, checkpoint, reorg
        │
        ├─ Index workers (Bun.Worker or Bun.spawn)
        │    · handlers per chain / shard
        │    · batch results → main for unified flush (default)
        │
        └─ Postgres via Bun.SQL
             · sync metadata, rpc cache, user tables
             · bulk path via Bun.SQL (no pg-copy-streams)
```

**Default write ownership:** workers compute; **main process flushes** so reorg/transaction boundaries stay centralized. Spike may revisit worker-direct writes.

## Package boundaries

| Package | Role |
|---|---|
| `ponder` | Sole runtime + CLI (Bun bin): sync, DB, serve |
| `@ponder/schema` (new) | Table / relation / event DSL, decoupled from runtime |
| `@ponder/client` | Rewritten for new HTTP contract (fetch + SSE) |
| `@ponder/react` | Thin hooks over new client |
| `create-ponder` | Bun-only scaffolds (`bunfig.toml`, no Node engines) |
| `@ponder/utils` | Keep pure helpers or fold into `ponder` re-exports |

## User mental model

### Layout

```text
my-app/
  ponder.config.ts
  ponder.schema.ts
  src/
    index.ts            # explicit handler registration
    api.ts              # optional custom fetch/routes
  bunfig.toml
  package.json
```

### Config

- `defineConfig({...})` — chains, RPC, ordering, database, server
- Explicit indexing entry, e.g. `indexing: "./src/index.ts"`
- No implicit Vite graph / virtual modules

### Schema

- `@ponder/schema` compiles to DDL / migration plan → `Bun.SQL`
- Client types from `ponder codegen`, not `ponder:schema` magic

### Handlers

- Explicit app handle (`ponder.on(...)`) — not Vite-injected globals
- `context.db` / `context.client` typed from schema codegen

### Loader (replaces Vite)

| Old | New |
|---|---|
| Vite SSR + `ponder:*` | Bun native `import` + optional light `Bun.plugin` |
| Vite HMR | `Bun.watch` / hash → graceful worker reload (dev); one-shot load (prod) |
| `ponder/virtual` | Generated `ponder-env.d.ts` or `@ponder/schema` exports |

Dev priority: **correct reload + speed**, not Vite-grade HMR precision.

## Data layer

### Connections

Multiple `Bun.SQL` roles (or equivalent): `admin`, `sync`, `user`, `readonly`.  
`serve` may open readonly only.

### Bulk writes

1. Prefer Bun.SQL Postgres COPY / binary bulk  
2. Fallback: `UNNEST` / multi-row `INSERT` with bounded batches  
3. Rewrite indexing flush cache — do not port Node stream pipelines

### PGlite

Default onboarding: **real Postgres** (compose documented).  
PGlite optional/experimental adapter for tests or zero-ops local — not the authority path.

### RPC cache / sync store

Remain in Postgres. Optional in-process hot cache only; no sqlite-as-authority.

## HTTP / client

- Single Fetch-compatible entry via `Bun.serve`
- Keep port `42069` initially (brand); versioned `/v1/*` allowed
- Capabilities: `/health`, `/ready`, `/status`, `/metrics`, SQL endpoint, live SSE, user API mount
- GraphQL: optional plugin (`graphql()`), not default scaffold
- User API: export `fetch` or route table; core does not require `@hono/node-server`
- `@ponder/client` / `@ponder/react` rewritten to new contract + codegen types

## Indexing concurrency

| Mode | Mapping |
|---|---|
| omnichain / multichain | Main-process async loops + bounded queues |
| isolated (was experimental) | First-class `Bun.Worker` / spawn with explicit message protocol |
| Backpressure | Keep buffer + per-block commit; drop Node-specific yield APIs |

RPC: viem + `fetch`; prefer global `WebSocket` over `ws` package when viable.

## Toolchain & release

- Runtime: Bun only (`engines.bun`, CI pins same major as today e.g. 1.4.x)
- Package manager: Bun workspaces + `bun.lock`
- Tests: `bun test` only; remove Vitest/Node matrix
- Build: `bun build` / tsc for types; bin shebang `env bun`
- Docs/examples: Bun-first narrative; remove Node + `bun --bun` workarounds
- Migration: guide + limited codemod; **no API compatibility promise**
- Delete: `@hono/node-server`, `pg`, `pg-copy-streams`, Vite runtime loader, `worker_threads` path, Node-only metrics/UI branches

## Milestones

1. Spike — `Bun.SQL` txn/COPY/errors; `Bun.serve` lifecycle; Worker message boundaries  
2. Skeleton — new config/schema/handler surface + empty serve  
3. Vertical slice — single-chain historical → DB → `/status`  
4. Live + reorg + client  
5. Workers / multichain / GraphQL plugin  
6. Delete legacy paths; examples/docs/CI clean cut  
7. Major release  

## Success criteria

- simulation-test / benchmark green on Bun-only  
- ≥2 official examples: dev → backfill → live → client query  
- No production dependency on Node HTTP server, `pg`, or Vite-as-loader  
- Docs/CI/engines claim Bun only  

## Non-goals

- Dual runtime (Node + Bun)  
- SQLite as authoritative store  
- Drop-in compatibility with current `ponder.config` / `ponder:*` modules  
- Preserving Vite-level HMR fidelity  
