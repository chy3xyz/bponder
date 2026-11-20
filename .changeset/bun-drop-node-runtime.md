---
"ponder": patch
---

Removed Node version gates from the CLI and required Bun at startup. Dropped `pg-copy-streams` and the `ws` package in favor of Drizzle insert fallbacks and the global `WebSocket`.
