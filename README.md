# bponder

[![License][license-badge]][license-url]
[![npm][npm-badge]][npm-url]

**bponder** is a **Bun-native** fork of [Ponder](https://github.com/ponder-sh/ponder) for EVM indexing.

It is **not** the official [ponder.sh](https://ponder.sh) project. Published names are `bponder`, `bponder-client`, `bponder-react`, … (not upstream `ponder` / `@ponder/*`).

| | **bponder** | **Ponder** ([ponder.sh](https://ponder.sh)) |
| --- | --- | --- |
| Runtime | **Bun only** (`>=1.4.0`) | Node / Bun |
| Postgres (default) | **Bun.SQL** | `pg` |
| HTTP query API | **`/v1`** (`Bun.serve`) | Classic Hono / SQL-over-HTTP |
| Config load | Bun `import()` (no Vite by default) | Vite SSR |

## Install

Requires [Bun](https://bun.sh) `>=1.4.0` for apps. PostgreSQL 14–17 for production (PGlite is fine locally).

### Option A — New project (recommended)

```bash
bun create bponder
# or: bunx create-bponder
```

Then:

```bash
cd <your-project>
bun install
bun run dev
```

### Option B — Add to an existing Bun app

```bash
bun add bponder hono viem
# optional client / React helpers
bun add bponder-client
bun add bponder-react @tanstack/react-query
```

`package.json` scripts typically look like:

```json
{
  "scripts": {
    "dev": "bponder dev",
    "start": "bponder start",
    "serve": "bponder serve",
    "codegen": "bponder codegen"
  },
  "engines": {
    "bun": ">=1.4.0"
  }
}
```

The `bponder` CLI comes from the `bponder` package (`#!/usr/bin/env bun`). Run it with Bun — do **not** use `bun --bun` as a workaround.

### Option C — Standalone CLI binary (GitHub Release)

No npm install required for the CLI itself (runtime is embedded):

```bash
curl -fsSL https://raw.githubusercontent.com/chy3xyz/bponder/main/install.sh | bash
```

Installs to `~/.bponder/bin`. Add it to `PATH` if the script prompts you to.

```bash
# pin a release
curl -fsSL https://raw.githubusercontent.com/chy3xyz/bponder/main/install.sh | BPONDER_VERSION=1.0.0 bash

bponder --version
bponder --help
```

App code still needs the library from npm (`bun add bponder`) if you import `createConfig` / schema APIs.

### From this monorepo (contributors)

```bash
git clone https://github.com/chy3xyz/bponder.git
cd bponder
bun install --frozen-lockfile
bun run build
```

Examples are **outside** the workspace graph. To run one:

```bash
cd examples/feature-filter
bun install
bun run dev
```

## Quickstart shape

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
DATABASE_URL=postgres://... DATABASE_SCHEMA=my_schema bun run start
bun run serve   # Bun-native /v1 by default
```

Query with `bponder-client` (client appends `/v1/*` to the app origin):

```ts
import { createClient } from "bponder-client";

const client = createClient({ url: "http://localhost:42069" });
const { rows } = await client.sql("SELECT * FROM ens_name LIMIT 10");
```

More detail: [`docs/get-started.md`](./docs/get-started.md) · [`docs/guides/bun.md`](./docs/guides/bun.md) · index of all docs in [`docs/README.md`](./docs/README.md).

## Escape hatches

| Env | Effect | Extra install |
| --- | --- | --- |
| `PONDER_USE_VITE=1` | Classic Vite loader / Hono serve | `bun add vite` |
| `PONDER_DATABASE_DRIVER=pg` | node-postgres instead of Bun.SQL | `bun add pg pg-connection-string` |

## Packages

| npm | Role |
| --- | --- |
| [`bponder`](https://www.npmjs.com/package/bponder) | Core + CLI |
| [`create-bponder`](https://www.npmjs.com/package/create-bponder) | Project scaffold |
| [`bponder-client`](https://www.npmjs.com/package/bponder-client) | `/v1` SQL client |
| [`bponder-react`](https://www.npmjs.com/package/bponder-react) | React hooks |
| `bponder-utils` / `bponder-schema` | Shared helpers |

Virtual modules: `bponder:registry`, `bponder:schema`, `bponder:api`.

Releases: [GitHub Releases](https://github.com/chy3xyz/bponder/releases) · publish notes: [`docs/guides/npm-publish.md`](./docs/guides/npm-publish.md).

## Upstream & license

Forked from [ponder-sh/ponder](https://github.com/ponder-sh/ponder). Upstream product and community: [ponder.sh](https://ponder.sh) / [t.me/pondersh](https://t.me/pondersh).

MIT — see [LICENSE](./LICENSE).

[license-badge]: https://img.shields.io/github/license/chy3xyz/bponder?label=License
[license-url]: https://github.com/chy3xyz/bponder/blob/main/LICENSE
[npm-badge]: https://img.shields.io/npm/v/bponder.svg
[npm-url]: https://www.npmjs.com/package/bponder
