---
"ponder": major
"create-ponder": major
"@ponder/client": major
"@ponder/react": major
---

Required Bun (`engines.bun: ">=1.4.0"`) and dropped Node as a supported runtime. The CLI now exits unless it is running on Bun.

Added a Bun.serve HTTP stack with `GET /v1/status`, readonly `POST /v1/sql`, and `GET /v1/live` SSE. `ponder serve --native` (or `PONDER_BUN_NATIVE=1`) starts that stack. Default `ponder serve`, `ponder dev`, and `ponder start` still use the Vite/Hono API.

Rewrote `@ponder/client` and `@ponder/react` against the `/v1` contract (`createClient({ url })`, `sql`/`query`, `getStatus`, and live SSE). Existing client and hook call sites for the previous SQL-over-HTTP API are breaking.

Updated `create-ponder` to scaffold Bun-only apps with `ponder …` scripts and Bun as the default package manager.

Default indexing and `createDatabase` still use `pg` (node-postgres) and PGlite. Full Vite/`pg` removal remains in progress; the Bun-native `/v1` path is opt-in for `ponder serve`.
