# bponder

[![License][license-badge]][license-url]

**bponder** is a **Bun-native** fork of [Ponder](https://github.com/ponder-sh/ponder) for EVM indexing.

It is **not** the official [ponder.sh](https://ponder.sh) project. Published package names are `bponder`, `bponder-client`, `bponder-react`, … (not upstream `ponder` / `@ponder/*`), and the supported runtime and HTTP/database defaults diverge (see below).

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

For conceptual guides that still match shared APIs, you can read [ponder.sh/docs](https://ponder.sh/docs). Prefer this repository’s plain Markdown under [`docs/`](./docs/README.md) (including [`docs/plans/`](./docs/plans/)) for Bun-native behavior, cutover notes, and acceptance status.

## Install CLI (GitHub Release binary)

```bash
curl -fsSL https://raw.githubusercontent.com/chy3xyz/bponder/main/install.sh | bash
```

Installs a standalone `bponder` executable (Bun-compiled) into `~/.bponder/bin`. Pin a version with `BPONDER_VERSION=0.18.9`. App projects still use `bun add bponder` (or workspace install) for the library API.

## Requirements

- [Bun](https://bun.sh) `>=1.4.0` (runtime for apps; the Release binary embeds its own Bun runtime)
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
import { createConfig } from "bponder";
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
DATABASE_URL=postgres://... DATABASE_SCHEMA=my_schema bponder start
bponder serve   # Bun-native /v1 by default under Bun
```

Query with `bponder-client` against the **app origin** (client appends `/v1/*`):

```ts
import { createClient } from "bponder-client";

const client = createClient({ url: "http://localhost:42069" });
const { rows } = await client.sql("SELECT * FROM ens_name LIMIT 10");
```

## Publishing

CI releases use npm Trusted Publishing (OIDC) via `.github/workflows/release.yml`. After a successful `bponder` npm publish, `.github/workflows/release-binaries.yml` builds multi-platform CLI zips and attaches them to a `v*` GitHub Release for `install.sh`. Setup: [Publishing to npm](./docs/guides/npm-publish.md).

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
- `docs/guides/bun.md`
- `docs/migration-guide.md`

## Packages (workspace)

- `packages/core` → npm name `bponder` (CLI: `bponder`)
- `packages/client` → `bponder-client`
- `packages/react` → `bponder-react`
- `packages/utils` → `bponder-utils`
- `packages/schema` → `bponder-schema`
- `packages/create-bponder` → `create-bponder`

Virtual modules: `bponder:registry`, `bponder:schema`, `bponder:api`.

## Upstream & license

Forked from [ponder-sh/ponder](https://github.com/ponder-sh/ponder). Upstream product, docs site, and community live at [ponder.sh](https://ponder.sh) / [t.me/pondersh](https://t.me/pondersh).

MIT-licensed (see [LICENSE](./LICENSE)). Copyright notices from upstream are retained.

[license-badge]: https://img.shields.io/github/license/chy3xyz/bponder?label=License
[license-url]: https://github.com/chy3xyz/bponder/blob/main/LICENSE
