---
"bponder": patch
---

Added Hono `src/api` support on the default Bun-native `ponder start` / `ponder dev` path. `Bun.serve` still owns `/health` and `/v1/*`, then falls through to the Hono app.
