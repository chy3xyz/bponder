# Bun-native final acceptance (Task 6.2)

**Date:** 2026-11-21  

**Branch:** `feat/bun-native` @ HEAD  
**Plan:** `docs/plans/2026-11-20-ponder-bun-native.md`  
**Design:** `docs/plans/2026-11-20-ponder-bun-native-design.md`  
**Runtime used for evidence:** Bun 1.4.5, local Postgres `127.0.0.1:5432`

This is an honest checklist. Items that were not executed are left unchecked. Do not treat “not run” as green.

## Checklist

- [x] Spike findings documented
- [ ] simulation-test green — **not run**
- [ ] benchmark run recorded — **not run**
- [x] ≥2 examples: `feature-bun-slice` + `feature-bun-live` smoke
- [x] No production `@hono/node-server` / `pg-copy-streams` / `ws` **direct** deps
- [x] Remaining deferred: `pg` / Vite escape hatches documented (defaults are Bun.SQL + Bun-native)
- [x] Docs/CI/engines Bun-first
- [x] `ponder serve` Bun-native by default under Bun
- [x] Major changeset present

**Overall:** checklist complete with two items honestly unmarked (`simulation-test`, `benchmark`). Under Bun, `start` / `dev` / `serve` / `list` / `prune` / `create-views` default to Bun-native; `createDatabase` defaults to Bun.SQL; isolated uses `Bun.Worker`. Escape hatches (`PONDER_USE_VITE=1`, `PONDER_DATABASE_DRIVER=pg`) remain documented — packages are not deleted.

---

## Production progress

As of `feat/bun-native` @ HEAD. Task 6.2 checklist above is unchanged; this is the post-acceptance production snapshot.

### Now true

- **Native indexing without Vite** (`f7d04a0`+). `ponder start` / `dev` under Bun use `compileBunNative` (Bun `import()` + `ponder:registry` / `ponder:schema` plugin). No Vite on the main native path. Escape: `PONDER_USE_VITE=1`.
- **`/v1` shares indexing storage** (`b0a59dc`). Native `start` / `dev` serve `/v1` from the same `createDatabase` `readonlyQB`. `ponder serve` under Bun defaults to Bun `/v1` (`c5afb60`).
- **Bun.SQL as `createDatabase` under Bun** (`4987522`). Defaults on when `process.versions.bun` is set. Escape: `PONDER_DATABASE_DRIVER=pg`. Ponder `json`/`jsonb` columns pass objects through under Bun (no string-scalar writes); meta also uses `asJsonb` / `jsonbSetOnValue`.
- **Vite-free isolated workers** — `isolatedWorker.bun.ts` uses `compileBunNative` → `createDatabase` → `runIsolated` (not Vite `createBuild`). Native path calls `isolatedController` for `experimental_isolated`.
- **Closed loop evidenced** — `bunNativeApp.e2e.bun.test.ts`: `ponder start --native` + Anvil ERC20 mint → `/v1/status` checkpoint ≥ 2 → `/v1/sql` account balances. Also `feature-bun-slice` + `feature-bun-live` smokes green.

### Still deferred

| Item | Why it remains |
|---|---|
| `PONDER_DATABASE_DRIVER=pg` escape | Node-postgres remains available; not deleted. |
| `simulation-test` / benchmark | Still **not run**. Needs `DATABASE_URL` (no DB name; scripts append), `PONDER_RPC_URL_{1,10,130,8453}`, templates/cache, typically self-hosted. **simulation-test** also needs `PONDER_USE_VITE=1` (or native `onBuild`) because fault injection depends on `onBuild`, which Bun-native drops. |
| Utils live `getLogsRetryHelper` | Needs `RPC_URL_ALCHEMY_1` / `INFURA` / `QUICKNODE` repo secrets; workflow skips cleanly when unset. Public RPC assertion drift remains out of band. |

### Parallel follow-ups landed (post-acceptance)

- Bun-native `ponder serve` mounts Hono `src/api` + `/ready` `/metrics` `/status` (same compose path as `start` / `dev`).
- Native `ponder dev` watches sources and remounts Hono on `src/api` changes (`setFetch`); indexing/config/schema still need process restart.
- Docs: COPY/batched-insert + `poolConfig` Bun.SQL semantics + serve/Hono/`dev` hot-reload notes.

**jsonb under Bun.SQL:** Ponder `json()` / `jsonb()` `mapToDriverValue` pass objects through when `PONDER_DATABASE_DRIVER` selects Bun.SQL (not merely `process.versions.bun`); node-postgres / PGlite still `JSON.stringify`. Covered by `drizzle/json.bun.test.ts` + meta helpers.

**Post-CI hardening (main @ HEAD):** Main/Windows/Version/Utils green. e2e erc20/factory + heartbeat restored; `ponder:schema` epoch + `ponder-index` plugin reload (Bun ignores `file://?query` cache bust); heartbeat keyed immediate write; Utils skips when RPC secrets unset; Version Actions can open PRs; Main adds **Test [core] Bun.SQL** job covering production-default driver path.

Focused evidence (2026-11-21):

```bash
DATABASE_URL=postgres://n0x@127.0.0.1:5432/postgres
bun test src/bin/utils/bunNativeApp.e2e.bun.test.ts   # pass (~0.5s)
bun test src/database/jsonb.bun.test.ts                 # pass
cd examples/feature-bun-slice && bun run smoke          # Bun historical slice smoke passed
cd examples/feature-bun-live && bun run smoke           # Bun realtime slice smoke passed
```

---

## Progress since acceptance

Wiring landed after `d331479` / `c9ecc10`. The original checklist above is unchanged; this section records later commits.

| Commit | Improvement | Remaining gap |
|---|---|---|
| `16050ae` | `createBunSqlDatabase` schema/`search_path` | — |
| `e7912e1` / `57a0103` / `c5afb60` | Native start/dev/serve defaults under Bun | Vite escape remains |
| `f7d04a0` / `b0a59dc` | Production indexing + unified `/v1` | — |
| `444e021` / `4987522` | Bun.SQL createDatabase gate + default-under-Bun | — |
| `4ae47d6` / `fb2bd03` | Vite-free isolated; jsonb objects under Bun.SQL | — |
| `04723e4` | `list` / `prune` / `create-views` Bun-native | simulation-test / benchmark |

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

**Bun-native blocker:** the harness fault-injection / RPC·DB mocks rely on `onBuild`, but Bun-native `start()` → `runBunNativeApp` drops `onBuild`. Full fuzz currently needs `PONDER_USE_VITE=1`, or a follow-up to wire `onBuild` into the native path. Harness DB helpers still use `drizzle-orm/node-postgres` + `pg` (not Bun.SQL).

**This session:** `simulation-test/.env.local` is absent; `127.0.0.1:55432` is closed; no template DBs were created. The suite was **not invoked**.

Do not treat CI schedule (`.github/workflows/simulation-test.yml`, Bun 1.4.4) as a local green result.

---

## 3. benchmark run recorded — NOT RUN

`benchmark` needs a populated `benchmark_[app]` database, RPC URLs, and `DATABASE_URL` without a database name (`benchmark/AGENTS.md`). First-time `reth` setup is hours of RPC; a cached replay is ~17–20s.

**This session:** `benchmark/.env.local` is absent; no `create:app` / `bun run benchmark` was run. No timing line was recorded.

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

Lockfile still contains **transitive** `@hono/node-server@2.1.5` via `@modelcontextprotocol/sdk`, and `ws@8.13.0` / `ws@8.18.3` as transitive packages. Those are not production `ponder` dependencies.

`pg` / `vite` / `pg-connection-string` are **optional peers** of `ponder` (not production dependencies). Install them only for escape hatches.

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
| `pg` escape hatch | Under Bun, `createDatabase` defaults to Bun.SQL; `PONDER_DATABASE_DRIVER=pg` needs optional peers `pg` + `pg-connection-string`. | `packages/core/src/database/bunSqlDriver.ts`, `utils/pg.ts`, `utils/loadOptional.ts` |
| Vite escape hatch | `PONDER_USE_VITE=1` restores Vite `createBuild` when optional peer `vite` is installed. | `packages/core/src/build/index.ts`, `plugin.ts`, `utils/loadOptional.ts` |
| Node `isolatedWorker.ts` | Retained for the Vite escape path; Bun uses `isolatedWorker.bun.ts` + `compileBunNative`. | `isolatedWorker.ts`, `isolatedWorker.bun.ts` |
| `simulation-test` / benchmark | Not run on this branch (need Postgres `:55432`, RPC, `.env.local`). | `simulation-test/`, `benchmark/` |

`@hono/node-server`, `pg-copy-streams`, and the `ws` package are already gone from the production graph. Under Bun, `ponder start` / `dev` / `serve` / `list` / `prune` / `create-views` default to Bun-native (no Vite).

---

## 7. Docs/CI/engines Bun-first — PASS (with caveats)

**Engines:** root, `ponder`, `create-ponder`, templates, and Bun examples set `"bun": ">=1.4.0"`. No `engines.node` in any workspace `package.json`. CLI shebang is `#!/usr/bin/env bun`; `assertBunRuntime()` runs at startup.

**Docs:** `docs/pages/docs/requirements.mdx` and `docs/pages/docs/guides/bun.mdx` state Bun is the only supported runtime. CLI reference documents `--native`.

**CI:** `.github/workflows/main.yml` and `windows.yml` use `bun install --frozen-lockfile` and `bun run --cwd packages/…` (avoids Bun 1.4.x Linux `--filter` `FileNotFound` when a workspace glob is missing) with `oven-sh/setup-bun` **1.4.5**. Postgres vs PGlite matrix is retained. The monorepo uses Bun workspaces (`packageManager: bun@1.4.5`, `bun.lock`); Node remains only where npm publish / changesets need a registry setup.

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

States Bun-only runtime, `/v1` HTTP, client/react rewrite, `create-ponder` Bun scaffolds, Bun.SQL default under Bun, and Vite/pg escape hatches.

Companion patch changesets exist (`bun-native-serve.md`, `bun-drop-node-runtime.md`, etc.). Changeset `fixed` group matches those four packages (`.changeset/config.json`).

---

## 10. Focused bun tests (this session)

Runtime: Bun 1.4.5; `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres`.

```bash
CI=1 bun test \
  packages/core/src/build/bunNativeBuild.bun.test.ts \
  packages/core/src/bin/utils/bunNativeServe.bun.test.ts \
  packages/core/src/server/bunV1Readonly.bun.test.ts \
  packages/core/src/bin/utils/indexingWorker.bun.test.ts
```

**24 pass, 0 fail, 0 skip** across 4 files (825 ms). Includes live `startBunNativeServe` (`/health` 200, `/v1/status` `{"checkpoint":null}`) and the Bun.Worker kill/done handshake.

| File | Result |
|---|---|
| `bunNativeBuild.bun.test.ts` | 7 pass (plugin load, isolated ordering error, missing config) |
| `bunNativeServe.bun.test.ts` | 12 pass (Bun default on, `PONDER_USE_VITE=1` off, serve still opt-in, live `/v1`) |
| `bunV1Readonly.bun.test.ts` | 4 pass (`readonlyQB` status + SELECT gate) |
| `indexingWorker.bun.test.ts` | 1 pass (kill/done handshake) |

---

## What this does not claim

- Deletion of the `pg` / Vite packages (they remain as escape hatches).
- simulation-test or benchmark green.
- A full official-example path of every template through `@ponder/client` (evidenced: e2e start→`/v1`, plus `feature-bun-slice` / `feature-bun-live` smokes).
