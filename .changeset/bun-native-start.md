---
"bponder": patch
---

Added `ponder start --native` (and `PONDER_BUN_NATIVE=1`) to load `ponder.config.ts` and `ponder.schema.ts` with Bun `import()` instead of Vite. When `DATABASE_URL` is set, the command starts the Bun-native `/v1` HTTP server and applies `migrateUser` for identifiable `onchainTable` exports.
