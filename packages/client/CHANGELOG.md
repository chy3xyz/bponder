# bponder-client

## 1.0.8

### Patch Changes

- Fixed packaging bugs in the published `dist/esm` layout that broke the CLI after `1.0.6` pointed `bin` at `dist/esm/bin/ponder.js`. `bponder --version` and every subcommand failed with `Cannot find module '../../package.json'` because the compiled bin still used the `src/bin` relative path (resolving to missing `dist/package.json`). Bun-native builds also failed when the registry entry hard-coded `../app/ponder.ts` even though the package only ships `ponder.js`. Isolated worker entrypoints similarly hard-coded `*.ts` paths (`isolatedWorker.bun.ts`, `bunIsolatedWorker.ts`) that do not exist under `dist/esm`.
  
  Fixed a bug that caused `Build failed stage=native` to log `Error: [unable to serialize, circular reference is too complex to analyze]` instead of the underlying Bun `ResolveMessage` (for example `Cannot find module .../app/ponder.ts`). `asError` now copies Bun-native error objects into plain `Error` instances before logging.

## 1.0.7

### Patch Changes

- Fixed a bug that caused `bun add bponder@1.0.6` to fail with `bponder-utils@workspace:* failed to resolve`. The published tarball had concrete versions, but registry metadata still listed `workspace:*` because `postpack` restored the manifest before npm uploaded it. Restore now runs after publish (`postpublish`), not before registry metadata is sent.

## 1.0.6

### Patch Changes

- Fixed a bug that caused clean `bun add bponder` installs to fail at `migrate_sync` with `ENOENT` for `src/sync-store/sql/.../create.sql`. The CLI `bin` now points at `dist/esm/bin/ponder.js`, and SQL migration files are included in the published package.
  
  Fixed a bug that caused Hono API handlers using `db.execute(...).rows` under Bun.SQL to silently see empty data. The `bponder:api` `db` export now normalizes bun-sql row arrays to `{ rows }`.
  
  Improved Bun-native Hono API load failures so errors no longer log as `undefined: undefined`.
  
  Fixed a regression that published `workspace:*` dependency ranges in `bponder` manifests (installs failed with `bponder-utils@workspace:* failed to resolve`).

## 1.0.5

### Patch Changes

- Published the `1.0.4` changes after an npm staging fault delayed that version from becoming installable on every package in the fixed release group.

## 1.0.4

### Patch Changes

- Fixed a bug that caused live indexing to crash under Bun.SQL during finalize/revert (and GraphQL `_meta` / `db.sql`) with `TypeError: undefined is not an object (evaluating 'result.rows[0]')`. Raw `execute()` results are now normalized across bun-sql row arrays and node-postgres `{ rows }`.

## 1.0.3

No changes in this release.

## 1.0.2

No changes in this release.

## 1.0.1

No changes in this release.

## 1.0.0

### Major Changes

- [`77ff658`](https://github.com/chy3xyz/bponder/commit/77ff6585ad1541c7a897be57bcb72b7a21935765) - Required Bun (`engines.bun: ">=1.4.0"`) and dropped Node as a supported runtime. The CLI now exits unless it is running on Bun.
  
  Added a Bun.serve HTTP stack with `GET /v1/status`, readonly `POST /v1/sql`, and `GET /v1/live` SSE. Under Bun, `ponder start`, `ponder dev`, and `ponder serve` use the Bun-native path by default (`PONDER_USE_VITE=1` restores Vite).
  
  Rewrote `bponder-client` and `bponder-react` against the `/v1` contract (`createClient({ url })`, `sql`/`query`, `getStatus`, and live SSE). Existing client and hook call sites for the previous SQL-over-HTTP API are breaking.
  
  Updated `create-bponder` to scaffold Bun-only apps with `ponder …` scripts and Bun as the default package manager.
  
  Under Bun, `createDatabase` defaults to Bun.SQL via `drizzle-orm/bun-sql` (`PONDER_DATABASE_DRIVER=pg` restores node-postgres). PGlite remains available for tests. Vite remains an escape hatch (`PONDER_USE_VITE=1`).

- Renamed published packages from `ponder` / `@ponder/*` / `create-ponder` to `bponder` / `@bponder/*` / `create-bponder`. Virtual modules are now `bponder:registry`, `bponder:schema`, and `bponder:api`, and the CLI binary is `bponder`.

- Renamed scoped packages `@bponder/*` to unscoped `bponder-client`, `bponder-react`, `bponder-utils`, and `bponder-schema` for npm publishing without an organization scope.

### Patch Changes

- [`7b7b420`](https://github.com/chy3xyz/bponder/commit/7b7b4200ebb585acb23f6ebcdb9b592b906404ca) - Rewrote `bponder-client` to query the Bun `/v1` HTTP contract with `createClient({ url })`, `getStatus`, `sql`/`query`, and live SSE status updates.

## 0.18.9

No changes in this release.

## 0.18.8

No changes in this release.

## 0.18.7

No changes in this release.

## 0.18.6

No changes in this release.

## 0.18.5

No changes in this release.

## 0.18.4

No changes in this release.

## 0.18.3

No changes in this release.

## 0.18.2

## 0.18.1

## 0.18.0

## 0.17.12

## 0.17.11

## 0.17.10

## 0.17.9

## 0.17.8

## 0.17.7

## 0.17.6

## 0.17.5

## 0.17.4

## 0.17.3

## 0.17.2

## 0.17.1

## 0.17.0

### Minor Changes

- [#2332](https://github.com/ponder-sh/ponder/pull/2332) [`5075dc1`](https://github.com/ponder-sh/ponder/commit/5075dc1251f1253457c60ad8c9a722229a19cd30) Thanks [@kyscott18](https://github.com/kyscott18)! - Updated the minimum supported TypeScript version to `5.4.0`. Newly created Ponder projects now use TypeScript `5.4.0`.

## 0.16.10

## 0.16.9

## 0.16.8

## 0.16.7

## 0.16.6

## 0.16.5

### Patch Changes

- [#2287](https://github.com/ponder-sh/ponder/pull/2287) [`b7a0a0b`](https://github.com/ponder-sh/ponder/commit/b7a0a0b8d41f84dcaedcc4696618c5e209440072) Thanks [@kyscott18](https://github.com/kyscott18)! - Include `tsconfig.json` as part of NPM payload.

## 0.16.4

## 0.16.3

## 0.16.2

## 0.16.1

## 0.16.0

## 0.15.18

## 0.15.17

## 0.15.16

## 0.15.15

## 0.15.14

## 0.15.13

## 0.15.12

## 0.15.11

## 0.15.10

## 0.15.9

## 0.15.8

## 0.15.7

## 0.15.6

## 0.15.5

## 0.15.4

## 0.15.3

## 0.15.2

## 0.15.1

## 0.15.0

## 0.14.13

## 0.14.12

## 0.14.11

## 0.14.10

## 0.14.9

## 0.14.8

### Patch Changes

- [#2154](https://github.com/ponder-sh/ponder/pull/2154) [`b45f0e1`](https://github.com/ponder-sh/ponder/commit/b45f0e1b76c35b8ee25d93553d4c1302f23c88a1) Thanks [@kyscott18](https://github.com/kyscott18)! - Fixed drizzle builder queries such as `db.$count` for `context.db` and `client.db`.

## 0.14.7

## 0.14.6

## 0.14.5

## 0.14.4

## 0.14.3

## 0.14.2

## 0.14.1

## 0.14.0

## 0.13.14

## 0.13.13

## 0.13.12

## 0.13.11

## 0.13.10

## 0.13.9

## 0.13.8

## 0.13.7

## 0.13.6

## 0.13.5

## 0.13.4

## 0.13.3

## 0.13.2

## 0.13.1

## 0.13.0

## 0.12.26

## 0.12.25

## 0.12.24

## 0.12.23

## 0.12.22

## 0.12.21

## 0.12.20

## 0.12.19

## 0.12.18

## 0.12.17

## 0.12.16

## 0.12.15

## 0.12.14

## 0.12.13

## 0.12.12

## 0.12.11

## 0.12.10

## 0.12.9

## 0.12.8

## 0.12.7

## 0.12.6

## 0.12.5

## 0.12.4

## 0.12.3

## 0.12.2

## 0.12.1

## 0.12.0

## 0.11.43

## 0.11.42

## 0.11.41

## 0.11.40

## 0.11.39

## 0.11.38

### Patch Changes

- [#1915](https://github.com/ponder-sh/ponder/pull/1915) [`f16cb9f`](https://github.com/ponder-sh/ponder/commit/f16cb9f51cae63405102fffff88eb0f3e1386b5f) Thanks [@kyscott18](https://github.com/kyscott18)! - Updated `getStatus()` in `bponder-client` to use the `/status` path with a "GET" request.

## 0.11.37

## 0.11.36

## 0.11.35

## 0.11.34

## 0.11.33

## 0.11.32

## 0.11.31

## 0.11.30

## 0.11.29

## 0.11.28

## 0.11.27

## 0.11.26

### Patch Changes

- [#1867](https://github.com/ponder-sh/ponder/pull/1867) [`e2fd8e7`](https://github.com/ponder-sh/ponder/commit/e2fd8e7892899335ffd745ff2c56fdb4d68c5b34) Thanks [@kyscott18](https://github.com/kyscott18)! - Updated `schema` parameter in `createClient` to be optional.

- [#1867](https://github.com/ponder-sh/ponder/pull/1867) [`e2fd8e7`](https://github.com/ponder-sh/ponder/commit/e2fd8e7892899335ffd745ff2c56fdb4d68c5b34) Thanks [@kyscott18](https://github.com/kyscott18)! - Added `setDatabaseSchema` function to setting schema for drizzle tables, enums, and relations.

## 0.11.25

## 0.11.24

## 0.11.23

## 0.11.22

## 0.11.21

## 0.11.20

## 0.11.19

## 0.11.18

## 0.11.17

## 0.11.16

## 0.11.15

## 0.11.14

## 0.11.13

## 0.11.12

## 0.11.11

## 0.11.10

## 0.11.9

## 0.11.8

## 0.11.7

## 0.11.6

## 0.11.5

## 0.11.4

## 0.11.3

## 0.11.2

## 0.11.1

## 0.11.0

### Minor Changes

- [#1736](https://github.com/ponder-sh/ponder/pull/1736) [`8c012a3168af5a6f28d166279082a9fc0a672d8e`](https://github.com/ponder-sh/ponder/commit/8c012a3168af5a6f28d166279082a9fc0a672d8e) Thanks [@kyscott18](https://github.com/kyscott18)! - Released `0.11`. Visit the [migration guide](https://ponder.sh/docs/migration-guide#011) for details.

## 0.10.27

## 0.10.26

## 0.10.25

## 0.10.24

## 0.10.23

## 0.10.22

## 0.10.21

## 0.10.20

## 0.10.19

## 0.10.18

## 0.10.17

## 0.10.16

## 0.10.15

## 0.10.14

## 0.10.13

## 0.10.12

## 0.10.11

### Patch Changes

- [#1653](https://github.com/ponder-sh/ponder/pull/1653) [`4447771a45dc81887586845801becf83cfdb6387`](https://github.com/ponder-sh/ponder/commit/4447771a45dc81887586845801becf83cfdb6387) Thanks [@kyscott18](https://github.com/kyscott18)! - Updated drizzle-orm from v0.39.3 to v0.41.0.

## 0.10.10

## 0.10.9

## 0.10.8

## 0.10.7

## 0.10.6

## 0.10.5

## 0.10.4

## 0.10.3

## 0.10.2

## 0.10.1

## 0.10.0

## 0.9.28

## 0.9.27

## 0.9.26

## 0.9.25

## 0.9.24

## 0.9.23

## 0.9.22

## 0.9.21

## 0.9.20

## 0.9.19

## 0.9.18

## 0.9.17

## 0.9.16

## 0.9.15

## 0.9.14

## 0.9.13

## 0.9.12

## 0.9.11

### Patch Changes

- [#1509](https://github.com/ponder-sh/ponder/pull/1509) [`e267f7e29d0996384590f898553e323499a8b616`](https://github.com/ponder-sh/ponder/commit/e267f7e29d0996384590f898553e323499a8b616) Thanks [@kyscott18](https://github.com/kyscott18)! - Fixed some (not all) type compatibility issues when using `bponder-client` and `bponder-react`.

## 0.9.10

## 0.9.9

## 0.9.8

## 0.9.7

## 0.9.6

## 0.9.5

## 0.9.4

## 0.9.3

## 0.9.2

## 0.9.1

## 0.9.0

### Minor Changes

- [#1367](https://github.com/ponder-sh/ponder/pull/1367) [`68097b429752e429291b71e5d2722ee944b0915a`](https://github.com/ponder-sh/ponder/commit/68097b429752e429291b71e5d2722ee944b0915a) Thanks [@kyscott18](https://github.com/kyscott18)! - Released `0.9`. Visit the [migration guide](https://ponder.sh/docs/migration-guide) for details.
