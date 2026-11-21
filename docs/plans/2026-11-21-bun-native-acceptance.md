# Bun-native final acceptance (Task 6.2)

**Date:** 2026-11-21  
**Branch:** `feat/bun-native` @ `d331479`  
**Plan:** `docs/plans/2026-11-20-ponder-bun-native.md`  
**Design:** `docs/plans/2026-11-20-ponder-bun-native-design.md`  
**Runtime used for evidence:** Bun 1.4.5, local Postgres `127.0.0.1:5432`

This is an honest checklist. Items that were not executed are left unchecked. Do not treat “not run” as green.

## Checklist

- [x] Spike findings documented
- [ ] simulation-test green — **not run** (N/A this session)
- [ ] benchmark run recorded — **not run**
- [x] ≥2 examples: `feature-bun-slice` + `feature-bun-live` smoke
- [x] No production `@hono/node-server` / `pg-copy-streams` / `ws` **direct** deps
- [x] Remaining deferred: `pg` `createDatabase`, Vite loader, `worker_threads` CLI — documented
- [x] Docs/CI/engines Bun-first
- [x] `ponder serve --native` available
- [x] Major changeset present

**Overall:** checklist complete with two items honestly unmarked. The branch meets the Task 6.2 binding (direct-dep cut, docs/CI/engines, `--native`, major changeset, two example smokes). It does **not** claim simulation-test or benchmark green, and it does **not** claim the original plan’s full “no `pg` / no Vite-loader” production cut.

---

## Progress since acceptance

Wiring landed after `d331479` / `c9ecc10`. The original checklist above is unchanged; this section records later commits.

| Commit | Improvement | Remaining gap |
|---|---|---|
| `16050ae` | `createBunSqlDatabase` creates non-public schemas and sets a durable `search_path`; `ponder serve --native --schema` passes through | Production `createDatabase` still defaults to `pg` |
| `e7912e1` | `ponder start --native` loads config/schema with `bunLoader` (Bun `import()`) and can start the Bun `/v1` stack | Classic `ponder start` / `ponder dev` still use Vite SSR + `ponder:*` |
| `812eef2` | `isolatedController` spawns via `createIndexingWorker`; under Bun that is `Bun.Worker` + `isolatedWorker.bun.ts` | Full `runIsolated` is not ported; the Bun entry is kill/done only, so isolated indexing does not process events |

---

## 1. Spike findings documented — PASS

Phase 0 READMEs are in-tree and record go/no-go plus limits:

| Spike | Path | Headline |
|---|---|---|
| Bun.SQL | `spikes/bun-sql/README.md` | Txn + error (`PostgresError.errno`) + `UNNEST` bulk; no streaming `COPY FROM` on Bun 1.4.5 |
| Bun.serve | `spikes/bun-serve/README.md` | `/health` `/ready`; `stop(true)` cuts the client, still awaits in-flight handlers |
| Bun.Worker | `spikes/bun-worker/README.md` | Ordered structured-clone protocol; **GO for Phase 1**; 16 MiB clone lower bound |

Commits: `928473b`, `8979fcb`, `0069b48`, `187d091`.

This session did not re-run the spike scripts.

---

## 2. simulation-test green — NOT RUN

`simulation-test` is a long-running fuzz harness (`simulation-test/AGENTS.md`). It needs:

- a Postgres URL **without** a database name (scripts append names)
- populated app template DBs
- live RPC (`PONDER_RPC_URL_*`)
- typically port `55432` for the isolated Docker Postgres

**This session:** `simulation-test/.env.local` is absent; `127.0.0.1:55432` is closed; no template DBs were created. The suite was **not invoked**.

Do not treat CI schedule (`.github/workflows/simulation-test.yml`, Bun 1.4.4) as a local green result.

---

## 3. benchmark run recorded — NOT RUN

`benchmark` needs a populated `benchmark_[app]` database, RPC URLs, and `DATABASE_URL` without a database name (`benchmark/AGENTS.md`). First-time `reth` setup is hours of RPC; a cached replay is ~17–20s.

**This session:** `benchmark/.env.local` is absent; no `create:app` / `pnpm benchmark` was run. No timing line was recorded.

---

## 4. ≥2 examples: feature-bun-slice + feature-bun-live smoke — PASS

Local Postgres accepted `postgres://postgres:postgres@127.0.0.1:5432/postgres` (`SELECT 1` via `Bun.SQL`).

```bash
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres
cd examples/feature-bun-slice && bun run smoke
# Bun historical slice smoke passed   (exit 0)

cd examples/feature-bun-live && bun run smoke
# Bun realtime slice smoke passed     (exit 0)
```

These smokes exercise `defineConfig` / `ponder.on` / `@ponder/schema` / `Bun.SQL` migrate / historical sync (slice) or historical + live + reorg (live), then `GET /health` and `GET /status`. They are **not** a full `ponder dev` → production backfill → live → `@ponder/client` path.

---

## 5. No production `@hono/node-server` / `pg-copy-streams` / `ws` direct deps — PASS

Workspace `package.json` files (including `packages/core`) have **no** `"@hono/node-server"`, `"pg-copy-streams"`, or `"ws"` keys. Source has no `from "@hono/node-server"` / `from "pg-copy-streams"` / `from "ws"` imports.

Lockfile still contains **transitive** `@hono/node-server@2.1.5` via `vocs` (docs) and `@modelcontextprotocol/sdk`, and `ws@8.13.0` / `ws@8.18.3` as transitive packages. Those are not production `ponder` dependencies.

`pg` remains a **direct** production dependency of `ponder` (`packages/core/package.json`). That is deferred (item 6), not a failure of this checkbox.

Evidence command:

```bash
rg -n '"@hono/node-server"|"pg-copy-streams"|^[[:space:]]*"ws":' --glob '**/package.json'
# no matches
```

---

## 6. Remaining deferred — documented — PASS

See `docs/plans/2026-11-21-task-5.1-deferred-node-deletions.md`. Summary at HEAD:

| Deferred | Why it remains | Where |
|---|---|---|
| `pg` + `createDatabase` | Production indexing still uses node-postgres / Drizzle; `createBunSqlDatabase` supports schema/`search_path` but is not the default | `packages/core/src/database/index.ts`, `packages/core/src/utils/pg.ts` |
| Vite SSR loader + `ponder:*` | `createBuild` still boots Vite; no Bun `import()` loader on `ponder dev` / `ponder start` | `packages/core/src/build/index.ts`, `plugin.ts` |
| `worker_threads` CLI | Isolated indexing still uses Node `Worker`; `Bun.Worker` exists but is not the CLI controller | `packages/core/src/bin/isolatedController.ts`, `isolatedWorker.ts` |

`@hono/node-server`, `pg-copy-streams`, and the `ws` package are already gone from the production graph. Default `ponder serve` / `dev` / `start` still use the Vite/Hono API; the Bun `/v1` stack is opt-in (`ponder serve --native`).

---

## 7. Docs/CI/engines Bun-first — PASS (with caveats)

**Engines:** root, `ponder`, `create-ponder`, templates, and Bun examples set `"bun": ">=1.4.0"`. No `engines.node` in any workspace `package.json`. CLI shebang is `#!/usr/bin/env bun`; `assertBunRuntime()` runs at startup.

**Docs:** `docs/pages/docs/requirements.mdx` and `docs/pages/docs/guides/bun.mdx` state Bun is the only supported runtime. CLI reference documents `--native`.

**CI:** `.github/workflows/main.yml` and `windows.yml` run `pnpm --filter "ponder" test:bun` and `pnpm --filter create-ponder test:bun` with `oven-sh/setup-bun` **1.4.4**. Postgres vs PGlite matrix is retained.

**Caveat:** workflows still call `actions/setup-node` (Node 24.22.1) for pnpm install, lint, and build. That is toolchain for the workspace, not a supported app runtime. Core `test` script remains `"vitest"`; CI invokes `test:bun`.

---

## 8. `ponder serve --native` available — PASS

CLI:

```bash
bun ./packages/core/src/bin/ponder.ts serve --help
# --native  Serve the Bun-native /v1 HTTP stack without the Vite/Hono API
```

Without `DATABASE_URL`:

```text
ERROR The Bun-native 'ponder serve --native' command requires DATABASE_URL
# exit 1
```

With local Postgres on port 42123:

```text
INFO  Started Bun-native HTTP server url=http://127.0.0.1:42123
INFO  Started returning 200 responses endpoint=/health
GET /health     → 200 (empty body)
GET /v1/status  → 200 {"checkpoint":null}
```

Unit tests (`CI=1 bun test packages/core/src/bin/utils/bunNativeServe.bun.test.ts`): **7 pass, 0 fail**, including `startBunNativeServe` against Postgres.

Also enabled by `PONDER_BUN_NATIVE=1`. `--schema` / `DATABASE_SCHEMA` is passed through to `createBunSqlDatabase` (invalid identifiers are still rejected). Implementation: `packages/core/src/bin/utils/bunNativeServe.ts`, wired in `packages/core/src/bin/commands/serve.ts` and `packages/core/src/bin/ponder.ts`.

---

## 9. Major changeset present — PASS

`.changeset/bun-native-major.md` (commit `77ff658`; HEAD also includes `d331479`):

```text
"ponder": major
"create-ponder": major
"@ponder/client": major
"@ponder/react": major
```

States Bun-only runtime, `/v1` HTTP, client/react rewrite, `create-ponder` Bun scaffolds, and that default indexing still uses `pg` / PGlite.

Companion patch changesets exist (`bun-native-serve.md`, `bun-drop-node-runtime.md`, etc.). Changeset `fixed` group matches those four packages (`.changeset/config.json`).

---

## What this does not claim

- Full production cut of `pg`, Vite-as-loader, or `worker_threads` (deferred, documented).
- simulation-test or benchmark green.
- A full official-example path of `ponder dev` → backfill → live → `@ponder/client` query (smokes cover the Bun slice APIs only).
