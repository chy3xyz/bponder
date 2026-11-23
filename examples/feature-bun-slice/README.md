# Bun historical slice

Minimal Bun-first example using `defineConfig`, `ponder.on`,
`bponder-schema`, Bun SQL migrations, historical indexing, and the Bun status
server.

## Run

From the repository root:

```bash
bun install --frozen-lockfile
export DATABASE_URL="postgres://postgres:postgres@127.0.0.1:5432/postgres"
cd examples/feature-bun-slice
bun run smoke
```

The smoke script creates a temporary Postgres schema, indexes one fixture
event, checks `/health` and `/status`, then removes the schema.
