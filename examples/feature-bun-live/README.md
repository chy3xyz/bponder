# Bun realtime slice

Minimal Bun-first example using `defineConfig`, `ponder.on`, historical
bootstrap, then the live/reorg slice (`applyBunRealtimeEvents`,
`reorgBunRealtime`) and the Bun status server.

## Run

From the repository root:

```bash
pnpm install --frozen-lockfile
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres"
cd examples/feature-bun-live
bun run smoke
```

The smoke script creates a temporary Postgres schema, indexes a historical
fixture, applies a live batch, rolls back a reorg, checks `/health` and
`/status`, then removes the schema.
