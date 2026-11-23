---
"bponder": patch
---

Fixed a crash that caused Bun-native apps using `client()` in `src/api` to fail at startup under Bun.SQL. The middleware now returns `501` and points callers to `POST /v1/sql` (or `PONDER_DATABASE_DRIVER=pg`).
