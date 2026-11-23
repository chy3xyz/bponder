---
"bponder": patch
---

Fixed a Bun.SQL bug that stored `json` / `jsonb` column values as JSON string scalars, which caused errors such as `cannot set path in scalar` when updating `_ponder_meta` (heartbeat / ready). Under Bun, Ponder's `json()` and `jsonb()` columns now pass objects through to the driver; node-postgres and PGlite still receive `JSON.stringify` output.
