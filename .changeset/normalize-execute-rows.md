---
"bponder": patch
"create-bponder": patch
"bponder-client": patch
"bponder-react": patch
---

Fixed a bug that caused live indexing to crash under Bun.SQL during finalize/revert (and GraphQL `_meta` / `db.sql`) with `TypeError: undefined is not an object (evaluating 'result.rows[0]')`. Raw `execute()` results are now normalized across bun-sql row arrays and node-postgres `{ rows }`.
