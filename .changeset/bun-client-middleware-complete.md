---
"bponder": patch
---

Completed `client()` middleware support under Bun.SQL: `/sql/db` now executes via drizzle `prepareQuery` (normalizing row-array results), and live query invalidation uses `Bun.SQL.listen` instead of returning `501`.
