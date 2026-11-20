---
"ponder": patch
---

Fixed a bug that caused Postgres `flush()` error recovery to throw `copy is not a function` instead of the original constraint error, such as `duplicate key value violates unique constraint`, after `pg-copy-streams` was removed. Large inserts without COPY now chunk by `databaseMaxQueryParameters`.
