---
"bponder": patch
---

Fixed a bug that caused `ponder start --native` to serve `/v1` from a separate Bun.SQL connection, so queries could not see rows written by indexing. `/v1` now reads the same `createDatabase` instance through `readonlyQB`. `ponder dev --native` (and `PONDER_BUN_NATIVE=1`) uses the same path.
