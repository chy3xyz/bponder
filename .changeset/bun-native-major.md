---
"bponder": major
"create-bponder": major
"bponder-client": major
"bponder-react": major
---

Required Bun (`engines.bun: ">=1.4.0"`) and dropped Node as a supported runtime. The CLI now exits unless it is running on Bun.

Added a Bun.serve HTTP stack with `GET /v1/status`, readonly `POST /v1/sql`, and `GET /v1/live` SSE. Under Bun, `ponder start`, `ponder dev`, and `ponder serve` use the Bun-native path by default (`PONDER_USE_VITE=1` restores Vite).

Rewrote `bponder-client` and `bponder-react` against the `/v1` contract (`createClient({ url })`, `sql`/`query`, `getStatus`, and live SSE). Existing client and hook call sites for the previous SQL-over-HTTP API are breaking.

Updated `create-bponder` to scaffold Bun-only apps with `ponder …` scripts and Bun as the default package manager.

Under Bun, `createDatabase` defaults to Bun.SQL via `drizzle-orm/bun-sql` (`PONDER_DATABASE_DRIVER=pg` restores node-postgres). PGlite remains available for tests. Vite remains an escape hatch (`PONDER_USE_VITE=1`).
