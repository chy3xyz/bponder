# bponder

[![License][license-badge]][license-url]

**bponder** is a **Bun-native** fork of [Ponder](https://github.com/ponder-sh/ponder) for EVM indexing.

It is **not** the official [ponder.sh](https://ponder.sh) project. Package names (`ponder`, `@ponder/client`, …) still match upstream for compatibility, but the supported runtime and HTTP/database defaults diverge (see below).

| | **bponder** (this repo) | **Ponder** ([ponder.sh](https://ponder.sh)) |
| --- | --- | --- |
| Runtime | **Bun only** (`>=1.4.0`) | Node / Bun |
| Postgres driver (default) | **Bun.SQL** | `pg` (node-postgres) |
| HTTP query API | **`/v1`** (`Bun.serve`) | Classic Hono / SQL-over-HTTP |
| Config/indexing load | Bun `import()` + plugin (no Vite by default) | Vite SSR loader |
| Upstream | Fork of `ponder-sh/ponder` | Canonical project |

Repo: [github.com/chy3xyz/bponder](https://github.com/chy3xyz/bponder) · Default branch: `main`

## Why this fork

- Run indexing and HTTP on **Bun** end-to-end
- Default Postgres path through **Bun.SQL** (`PONDER_DATABASE_DRIVER=pg` restores node-postgres)
- Default `/v1` stack: `GET /v1/status`, `POST /v1/sql`, `GET /v1/live`
- Vite optional only: `PONDER_USE_VITE=1`

For conceptual guides that still match shared APIs, you can read [ponder.sh/docs](https://ponder.sh/docs). Prefer this repository’s `docs/` and `docs/plans/` for Bun-native behavior, cutover notes, and acceptance status.

## Requirements

- [Bun](https://bun.sh) `>=1.4.0`
- PostgreSQL 14–17 for production (PGlite OK for local/tests)
- Workspace install: `bun install --frozen-lockfile` (Bun is package manager + runtime)

## Quickstart (from this repo)

```bash
git clone https://github.com/chy3xyz/bponder.git
cd bponder
bun install --frozen-lockfile
bun run build
```

Example Bun smokes (need local Postgres + `DATABASE_URL`):

```bash
cd examples/feature-bun-slice && bun run smoke
cd examples/feature-bun-live && bun run smoke
```

Minimal app shape (same schema/config surface as Ponder, Bun runtime):

```ts
// ponder.config.ts
import { createConfig } from "ponder";
import { BaseRegistrarAbi } from "./abis/BaseRegistrar";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1,
    },
  },
  contracts: {
    BaseRegistrar: {
      abi: BaseRegistrarAbi,
      chain: "mainnet",
      address: "0x57f1887a8BF19b14fC0dF6Fd9B2acc9Af147eA85",
      startBlock: 9380410,
    },
  },
});
```

```bash
# production / dev under Bun (Vite-free by default)
DATABASE_URL=postgres://... DATABASE_SCHEMA=my_schema ponder start
ponder serve   # Bun-native /v1 by default under Bun
```

Query with `@ponder/client` against the **app origin** (client appends `/v1/*`):

```ts
import { createClient } from "@ponder/client";

const client = createClient({ url: "http://localhost:42069" });
const { rows } = await client.sql("SELECT * FROM ens_name LIMIT 10");
```

## Escape hatches

`vite`, `pg`, and `pg-connection-string` are **optional peers**. Install them only when you use an escape hatch.

| Env | Effect | Install |
| --- | --- | --- |
| `PONDER_USE_VITE=1` | Classic Vite loader / Hono serve path | `bun add vite` |
| `PONDER_DATABASE_DRIVER=pg` | Force node-postgres instead of Bun.SQL | `bun add pg pg-connection-string` |
| `PONDER_BUN_NATIVE=1` / `--native` | Force Bun-native path (already default under Bun) | — |

## Status

Bun-native defaults are wired and covered by focused bun tests + example smokes. `simulation-test` and `benchmark` are **not** claimed green on this branch yet. See:

- `docs/plans/2026-11-21-bun-native-acceptance.md`
- `docs/plans/2026-11-21-task-5.1-deferred-node-deletions.md`
- `docs/pages/docs/guides/bun.mdx`
- `docs/pages/docs/migration-guide.mdx`

## Packages (workspace)

- `packages/core` → npm name `ponder`
- `packages/client` → `@ponder/client`
- `packages/react` → `@ponder/react`
- `packages/utils` → `@ponder/utils`
- `packages/create-ponder` → `create-ponder`

Published npm versions may still refer to upstream; treat **this git repo** as the source of truth for the Bun-native fork.

## Upstream & license

Forked from [ponder-sh/ponder](https://github.com/ponder-sh/ponder). Upstream product, docs site, and community live at [ponder.sh](https://ponder.sh) / [t.me/pondersh](https://t.me/pondersh).

MIT-licensed (see [LICENSE](./LICENSE)). Copyright notices from upstream are retained.

[license-badge]: https://img.shields.io/github/license/chy3xyz/bponder?label=License
[license-url]: https://github.com/chy3xyz/bponder/blob/main/LICENSE
