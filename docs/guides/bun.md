# Bun

Ponder runs on Bun

Ponder is a Bun-native indexing runtime. [Bun](https://bun.sh) is the **only supported runtime**. Node.js is not supported.

Bun is both the **runtime** and the **package manager** for this project (`bun install` / Bun workspaces). New apps typically use `bun install`; `create-bponder` can still scaffold with pnpm, npm, or yarn if you pass `--pnpm` / `--npm` / `--yarn`. The process that runs `ponder` must be Bun either way.

## New project

**shell**

```bash
bun create ponder
```

`create-bponder` requires Bun. Generated scripts stay as `ponder dev` / `ponder start`. **Do not** add `bun --bun` — that flag was a workaround for the old Node shebang and is no longer needed.

**package.json**

```json
{
  "scripts": {
    "dev": "ponder dev",
    "start": "ponder start",
    "codegen": "ponder codegen"
  },
  "engines": {
    "bun": ">=1.4.0"
  }
}
```

Then:

**shell**

```bash
bun run dev
```

[Read more](../requirements.md) in Requirements. Existing Node Ponder apps should follow the [migration guide](../migration-guide.md).

## Bun-native `ponder start` and `ponder dev`

Under Bun, `ponder start` and `ponder dev` use the Bun-native indexing path by default: they load `ponder.config.ts` and `ponder.schema.ts` with Bun `import()`, resolve `bponder:registry` / `bponder:schema` with a Bun plugin, and run indexing (`createDatabase`, `migrate`, `migrateSync`, then `runOmnichain` / `runMultichain` / `experimental_isolated`) without Vite. `--native` and `PONDER_BUN_NATIVE=1` still enable that path explicitly.

Postgres indexing uses **Bun.SQL** by default under Bun. Set `PONDER_DATABASE_DRIVER=pg` to force node-postgres.

To force the classic Vite path:

**shell**

```bash
PONDER_USE_VITE=1 ponder start
PONDER_USE_VITE=1 ponder dev
```

`ordering: "experimental_isolated"` runs on `Bun.Worker` with the same Vite-free compile path. If the compiled database is Postgres, native `start` / `dev` also start the Bun-native HTTP server from the same `createDatabase` connection (`/v1` plus optional Hono). `--schema` / `DATABASE_SCHEMA` is required for `ponder start`.

Native `ponder dev` watches `src/api`, indexing sources, `ponder.config.ts`, and `ponder.schema.ts`. Changes under `src/api` remount the Hono app in place. Config, schema, or indexing-function changes require restarting `ponder dev` (API-only hot reload is supported today). Use `PONDER_USE_VITE=1` for the classic Vite hot-reload path.

Secondary commands `ponder db list`, `ponder db prune`, and `ponder db create-views` also use the Bun-native compile path under Bun.

## Custom Hono API on Bun-native

Under Bun-native `ponder start`, `ponder dev`, and `ponder serve`, you can use Hono in `src/api/index.ts`. The server is `Bun.serve`:

1. Built-in `/health`, `/ready`, `/metrics`, `/status`, and `/v1/*` are handled first
2. Everything else is forwarded to your Hono app (`hono.fetch`)
3. `bponder:api` (`db`, `publicClients`) works the same as on the Vite path

**src/api/index.ts**

```ts
import { Hono } from "hono";
import { db } from "bponder:api";
import schema from "bponder:schema";

const app = new Hono();

app.get("/hello", (c) => c.text("Hello from Hono on Bun.serve"));

app.get("/accounts", async (c) => {
  const rows = await db.select().from(schema.account);
  return c.json(rows);
});

export default app;
```

Do not register `/health`, `/ready`, `/status`, `/metrics`, `/client`, or `/v1/*` on the Hono app — those are reserved. If `src/api/index.ts` is missing, only the built-in routes (including `/v1`) are served.

`client({ db, schema })` works under Bun.SQL: `/sql/db` uses drizzle `prepareQuery`, and live invalidation uses `Bun.SQL.listen` / `NOTIFY`. You can still use `POST /v1/sql` for simple readonly SQL.

## Bun-native `ponder serve`

Under Bun, `ponder serve` defaults to the Bun-native stack (`Bun.serve`) unless you set `PONDER_USE_VITE=1`. `--native` and `PONDER_BUN_NATIVE=1` still enable it explicitly.

**shell**

```bash
# Requires DATABASE_URL (and an existing schema from a prior start)
ponder serve
# or force native
ponder serve --native
```

Like `start` / `dev`, Bun-native `serve` mounts `/v1` and optional Hono from `src/api/index.ts` (no indexer). Built-in routes include `GET /health`, `GET /ready`, `GET /metrics`, `GET /status`, readonly `POST /v1/sql`, and `GET /v1/live` SSE. Port and hostname still come from `-p` / `-H` (or `PORT`). `--schema` / `DATABASE_SCHEMA` selects the Postgres schema (`public` by default); invalid identifiers exit with an error.

To force the classic Vite/Hono path instead:

**shell**

```bash
PONDER_USE_VITE=1 ponder serve
```

## Known limitations

If you encounter an issue with bponder that might be caused by Bun, please [open a GitHub issue](https://github.com/chy3xyz/bponder/issues).

- Bun.SQL does not expose streaming PostgreSQL `COPY FROM`. Large flushes use batched inserts. For maximum backfill throughput, temporarily set `PONDER_DATABASE_DRIVER=pg`.
- Under Bun.SQL, `database.poolConfig` mainly applies `connectionString` (or `DATABASE_URL`) and `max`. Other node-postgres `PoolConfig` fields (for example `ssl`, idle timeouts, and custom connection options) are ignored by the Bun.SQL client.
- The `/metrics` endpoint omits the default Node.js Prometheus metrics that `prom-client` used to attach (names prefixed with `nodejs_` or `process_`).
- Native `ponder dev` remounts the Hono API on `src/api` changes; indexing / config / schema changes require a process restart. Use `PONDER_USE_VITE=1` for full Vite hot reload.
- Escape hatches remain optional peers: install `vite` for `PONDER_USE_VITE=1`, and `pg` + `pg-connection-string` for `PONDER_DATABASE_DRIVER=pg`.
