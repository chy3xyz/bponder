---
"ponder": patch
---

Made `vite`, `pg`, and `pg-connection-string` optional peer dependencies. Bun-native indexing no longer requires them; install them only for `PONDER_USE_VITE=1` or `PONDER_DATABASE_DRIVER=pg`.
