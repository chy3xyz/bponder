---
"bponder": patch
---

Added `ponder serve --native` (and `PONDER_BUN_NATIVE=1`) to start the Bun-native `/v1` HTTP server without the Vite/Hono API.

`ponder serve --native` now exits with an error when `--schema` or `DATABASE_SCHEMA` is set to a value other than `public`, because that path does not apply the schema yet.
