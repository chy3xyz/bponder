---
"bponder": patch
"create-bponder": patch
"bponder-client": patch
"bponder-react": patch
---

Fixed a bug that caused clean `bun add bponder` installs to fail at `migrate_sync` with `ENOENT` for `src/sync-store/sql/.../create.sql`. The CLI `bin` now points at `dist/esm/bin/ponder.js`, and SQL migration files are included in the published package.

Fixed a bug that caused Hono API handlers using `db.execute(...).rows` under Bun.SQL to silently see empty data. The `bponder:api` `db` export now normalizes bun-sql row arrays to `{ rows }`.

Improved Bun-native Hono API load failures so errors no longer log as `undefined: undefined`.

Fixed a regression that published `workspace:*` dependency ranges in `bponder` manifests (installs failed with `bponder-utils@workspace:* failed to resolve`).
