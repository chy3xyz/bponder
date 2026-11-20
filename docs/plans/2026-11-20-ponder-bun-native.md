# Ponder Bun-Native Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship an in-place major that turns Ponder into a Bun-only indexing runtime (Postgres via `Bun.SQL`, new config/schema/handler surface, `Bun.serve`), deleting the Node path.

**Architecture:** Control plane in the main Bun process (`Bun.serve` + scheduler); index workers via `Bun.Worker` with main-process unified flush; `@ponder/schema` DSL → SQL; no Vite loader, no `pg`, no `@hono/node-server`. See `docs/plans/2026-11-20-ponder-bun-native-design.md`.

**Tech Stack:** Bun (≥ CI pin), `Bun.SQL`, `Bun.serve`, `Bun.Worker`, viem, optional GraphQL plugin, `bun test`, bun workspaces.

**Design doc:** `docs/plans/2026-11-20-ponder-bun-native-design.md`

---

## Phase 0 — Spikes (gate before skeleton)

### Task 0.1: Bun.SQL spike harness

**Files:**
- Create: `spikes/bun-sql/index.ts`
- Create: `spikes/bun-sql/README.md`

**Step 1: Write spike script**

Create a script that, given `DATABASE_URL`:

1. Connects with `Bun.SQL`
2. Runs `BEGIN` → insert → `COMMIT`
3. Runs a failing query and records error shape
4. Attempts COPY or documents fallback (`UNNEST` multi-insert)
5. Prints pass/fail for txn / error / bulk

**Step 2: Run against local Postgres**

```bash
cd /Users/n0x/ws_xfinal/w3_scalfold/bponder
DATABASE_URL=postgres://… bun run spikes/bun-sql/index.ts
```

Expected: clear stdout checklist; README notes COPY availability.

**Step 3: Commit**

```bash
git add spikes/bun-sql
git commit -m "$(cat <<'EOF'
chore: add Bun.SQL capability spike

EOF
)"
```

### Task 0.2: Bun.serve lifecycle spike

**Files:**
- Create: `spikes/bun-serve/index.ts`

**Step 1: Implement serve + graceful stop**

- `Bun.serve` with `/health`, `/ready`
- Signal handler calls `server.stop(true)`
- Assert in-flight request drain behavior (document if incomplete)

**Step 2: Run and Ctrl-C**

```bash
bun run spikes/bun-serve/index.ts
```

Expected: clean exit notes in spike README.

**Step 3: Commit**

```bash
git add spikes/bun-serve
git commit -m "$(cat <<'EOF'
chore: add Bun.serve lifecycle spike

EOF
)"
```

### Task 0.3: Bun.Worker message-boundary spike

**Files:**
- Create: `spikes/bun-worker/main.ts`
- Create: `spikes/bun-worker/worker.ts`

**Step 1: Implement ping/batch protocol**

Main spawns worker; sends N fake “events”; worker returns results; main asserts ordering and transfer of structured payloads (no Node `worker_threads` APIs).

**Step 2: Run**

```bash
bun run spikes/bun-worker/main.ts
```

Expected: PASS log; note max payload / transfer limits.

**Step 3: Commit spike results; go/no-go note in design or spike README**

Only proceed to Phase 1 if SQL txn + serve stop + worker protocol are acceptable.

---

## Phase 1 — Skeleton (new surface, empty runtime)

### Task 1.1: Add `@ponder/schema` package shell

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/src/index.ts`
- Create: `packages/schema/tsconfig.json`
- Modify: root `package.json` / workspace config for bun workspaces when ready

**Step 1: Write failing type/export test**

```ts
// packages/schema/src/index.test.ts
import { expect, test } from "bun:test";
import { onchainTable } from "./index";

test("onchainTable is exported", () => {
  expect(typeof onchainTable).toBe("function");
});
```

**Step 2: Run test**

```bash
cd packages/schema && bun test
```

Expected: FAIL (module/export missing).

**Step 3: Minimal `onchainTable` stub**

Export a function that records table name + columns (no SQL yet).

**Step 4: Re-run test — PASS, then commit**

```bash
git add packages/schema
git commit -m "$(cat <<'EOF'
feat(schema): add @ponder/schema package stub

EOF
)"
```

### Task 1.2: `defineConfig` + app handle stubs in `ponder`

**Files:**
- Create: `packages/core/src/config/defineConfig.ts` (or replace `createConfig` in major branch)
- Create: `packages/core/src/app/ponder.ts`
- Modify: `packages/core/src/index.ts` exports

**Step 1: Failing tests for `defineConfig` shape and `ponder.on` registration**

**Step 2: Implement minimal stubs (no indexing yet)**

**Step 3: Export from package entry; `bun test` green; commit**

### Task 1.3: Bun CLI entry (drop Node shebang)

**Files:**
- Modify: `packages/core/src/bin/ponder.ts`
- Modify: `packages/core/package.json` `bin`, `engines`

**Step 1: Change shebang to `#!/usr/bin/env bun`**

**Step 2: Set `engines` to Bun only; remove `engines.node`**

**Step 3: `bun ./packages/core/src/bin/ponder.ts --help` works; commit**

### Task 1.4: Empty `Bun.serve` wired to `dev`/`serve` stubs

**Files:**
- Create: `packages/core/src/server/bunServe.ts`
- Modify: `packages/core/src/server/index.ts` (replace `@hono/node-server` path)
- Modify: command entrypoints under `packages/core/src/bin/commands/`

**Step 1: Failing test — fetch `/health` returns 200**

**Step 2: Implement `Bun.serve` with `/health` only**

**Step 3: Remove `@hono/node-server` from this path; commit**

---

## Phase 2 — Vertical slice (single chain historical)

### Task 2.1: `Bun.SQL` database facade

**Files:**
- Create: `packages/core/src/database/bunSql.ts`
- Modify: `packages/core/src/database/index.ts`
- Remove usage of `pg` Pool on the new path

**Steps:** failing connection test → open admin/user roles → migrate minimal internal tables → commit

### Task 2.2: Schema → DDL compiler (minimal)

**Files:**
- Create: `packages/schema/src/compile.ts`
- Create: `packages/core/src/database/migrateUser.ts`

**Steps:** table stub → `CREATE TABLE` SQL → apply via `Bun.SQL` → test round-trip → commit

### Task 2.3: Historical sync slice (one chain, one contract)

**Files:**
- Port/adapt: `packages/core/src/sync-historical/*`, `runtime/*` onto new app handle
- Keep viem RPC; persist progress in sync tables

**Steps:**
1. Test: given anvil/fixture range, N events indexed into user table
2. Implement minimal extract → handler → flush (UNNEST/COPY per spike)
3. Expose `GET /status` with checkpoint
4. Commit

### Task 2.4: Example `feature-bun-slice`

**Files:**
- Create: `examples/feature-bun-slice/` (minimal Bun app using new APIs)

**Steps:** README run instructions; smoke script; commit

---

## Phase 3 — Live, reorg, client

### Task 3.1: Realtime + reorg on Bun path

**Files:** `packages/core/src/sync-realtime/*`, `runtime/realtime.ts` (adapt)

**Steps:** test reorg rolls back user rows → implement → `/status` reflects head → commit

### Task 3.2: SQL + live HTTP contract `/v1`

**Files:**
- Modify: `packages/core/src/server/*`
- Create: versioned routes `/v1/sql`, `/v1/live`, `/v1/status`

**Steps:** contract tests with `fetch` → implement → commit

### Task 3.3: Rewrite `@ponder/client`

**Files:** `packages/client/src/**`

**Steps:** point at `/v1`; drop old pg-proxy assumptions; `bun test`; commit

### Task 3.4: Rewrite `@ponder/react` to new client

**Files:** `packages/react/src/**`

**Steps:** update hooks; typecheck; commit

---

## Phase 4 — Workers, multichain, GraphQL plugin

### Task 4.1: First-class isolated workers

**Files:**
- Replace: `packages/core/src/bin/isolatedController.ts`, `isolatedWorker.ts`
- Use `Bun.Worker` + main flush protocol from spike

**Steps:** ordering test across 2 workers → implement → commit

### Task 4.2: Omnichain / multichain on new runtime

**Files:** `packages/core/src/runtime/*`

**Steps:** port semantics; simulation-test subset green; commit

### Task 4.3: Optional GraphQL plugin

**Files:**
- Create: `packages/core/src/graphql/plugin.ts` (Fetch-based)
- Keep out of default `create-ponder` template

**Steps:** opt-in mount test → implement → commit

---

## Phase 5 — Clean cut (delete Node world)

### Task 5.1: Remove Node-coupled dependencies and code

**Delete / stop depending on:**
- `@hono/node-server`
- `pg`, `pg-copy-streams`
- Vite as runtime loader (`packages/core/src/build` Vite SSR path)
- `ws` if global `WebSocket` suffices
- Vitest dual matrix; Node CI jobs
- `ponder:*` virtual modules and `ponder/virtual` docs

**Steps:** grep for `node:http`, `worker_threads`, `createServer`, `@hono/node-server`, `from "pg"` → remove → `bun test` → commit

### Task 5.2: `create-ponder` Bun-only

**Files:** `packages/create-ponder/src/**`

**Steps:** templates use new layout; no `bun --bun` hack; engines bun; commit

### Task 5.3: Docs rewrite

**Files:** `docs/pages/docs/**` (requirements, bun guide, self-hosting, database, why-ponder)

**Steps:** Bun-first; migration guide from Node Ponder; commit

### Task 5.4: CI Bun-only

**Files:** `.github/workflows/*.yml`

**Steps:** drop Node test matrix; pin Bun; Postgres matrix retained; commit

### Task 5.5: Examples migration

**Files:** `examples/**`

**Steps:** each example on new APIs or removed; at least two full-path verified; commit

---

## Phase 6 — Release

### Task 6.1: Changeset + major version bump

- User-facing changelog in repo voice (past tense, observable behavior)
- State Bun-only requirement and breaking API reshape
- Publish dry-run

### Task 6.2: Final acceptance checklist

- [ ] Spike findings documented
- [ ] simulation-test green
- [ ] benchmark run recorded
- [ ] ≥2 examples: dev → backfill → live → client
- [ ] No production `pg` / `@hono/node-server` / Vite-loader
- [ ] Docs/CI/engines Bun-only

---

## Execution notes

- Prefer TDD on each new public API; ported sync logic may start with characterization tests around fixtures under `packages/core/src/_test/`.
- Do not keep dual adapters “for safety” after Phase 5 — design forbids Node runtime.
- If COPY is unavailable in Bun.SQL, ship UNNEST fallback and track COPY as follow-up; do not block major on parity mythology.
- Commit frequently per task; do not mix unrelated example rewrites with core spikes.
