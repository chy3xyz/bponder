# Bun.SQL capability spike

This harness checks the Bun-native PostgreSQL driver behavior needed by the
rewrite:

- a transaction that performs `BEGIN` → insert → `COMMIT`
- the runtime shape of a PostgreSQL error
- a bulk insert using parallel arrays and `UNNEST`

## Run

Use Bun 1.4.5 and a disposable PostgreSQL database:

```bash
cd /Users/n0x/ws_xfinal/w3_scalfold/bponder
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
  /Users/n0x/.bun/bin/bun run spikes/bun-sql/index.ts
```

The command prints one `[PASS]` or `[FAIL]` line for each of `txn`, `error`,
and `bulk`, and exits non-zero if any check fails. It creates only a temporary
table, which PostgreSQL removes when the connection closes.

On Bun 1.4.5, PostgreSQL's SQLSTATE is exposed as `PostgresError.errno`
(`42P01` for the deliberate missing-table query). `PostgresError.code` is the
generic Bun value `ERR_POSTGRES_SERVER_ERROR`, so application error handling
must inspect `errno`.

## COPY availability

Bun.SQL 1.4.5 does not expose a streaming PostgreSQL `COPY FROM` API. Sending
`COPY ... FROM STDIN` as a normal tagged-template query is not sufficient
because the client must also implement the COPY data protocol. The harness
therefore exercises the intended fallback: one parameterized `INSERT ...
SELECT * FROM UNNEST(...)` statement. This is suitable for batching parallel
arrays, but should be benchmarked against the production workload before
choosing batch-size limits.
