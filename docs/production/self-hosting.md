# Self-hosting

Host a Ponder app on your own infrastructure

In general, hosting a Ponder app is similar to hosting an ordinary Bun HTTP server. The process must be [Bun](https://bun.sh) `>=1.4.0` — Node.js is not a supported runtime. This section describes the key Ponder-specific quirks to consider when self-hosting in production.

## Database connection

Ponder works best with a Postgres database running in the same private network. Set the `DATABASE_URL` environment variable to the connection string of your Postgres database, or manually override the `database.connectionString` option in `ponder.config.ts`.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: "postgres://user:password@mycloud.internal:5432/database",
  },
  // ...
});
```

> **Note:** Your app will likely have performance issues if the roundtrip database latency
> is greater than **50ms**. This is common when using a database in a different region or network.

Under Bun, this connection uses **Bun.SQL** by default. Set `PONDER_DATABASE_DRIVER=pg` to force node-postgres. [Read more](../database.md) about database drivers.

## Database schema

Ponder uses **database schemas** to isolate deployments. Each deployment must use a different schema.

Use the `DATABASE_SCHEMA` environment variable or the `--schema` CLI argument to specify which database schema a deployment should use. [Read more](../database.md#database-schema) about database schema selection rules.

It typically makes sense to automate the database schema for each deployment. Here are a few common options.

- Kubernetes pod name
- Git branch name or commit hash
- Railway deployment ID

### Views pattern

The **views pattern** makes the *latest* deployment's data available in a *static* database schema using [database views](https://www.postgresql.org/docs/current/tutorial-views.html). This makes it possible to write direct SQL queries that always target the latest deployment's tables — without requiring a configuration change after each deployment.

Ponder natively supports this pattern in two ways.

- **Standalone CLI command**: The `ponder db create-views` CLI command creates (or updates) views in the target schema to point at the specified deployment's tables.
  <div className="h-3" />
  ```bash
  bun run db create-views --schema=deployment-123 --views-schema=project-name
  ```
  <div className="h-3" />
- **Automated**: The `ponder start` command also accepts the `--views-schema` CLI flag. When specified, the deployment will run the `ponder db create-views` command automatically as soon as it becomes ready (when the backfill is complete).
  <div className="h-3" />
  ```bash
  bun run start --schema=deployment-123 --views-schema=project-name
  ```
  <div className="h-3" />

<details>
<summary>[****Additional explanation of the views pattern****]</summary>

<div className="h-[1px]" />
**Problem: Database schema changes on each deployment**

If you query Ponder tables directly, you'll soon run into a problem. On each new deployment, the schema containing the _latest_ deployment's tables (the ones you want to query) will change.

To avoid querying the wrong tables, downstream systems will need to be updated on _every_ new deployment. What a pain!

**Solution: Use database views as a "proxy"**

When you query a Ponder project over HTTP, this problem is typically solved at the orchestration layer through healthchecks, blue/green deployments, and an HTTP proxy.

To simulate the same behavior at the SQL level, Ponder supports using **database views** that always "proxy" queries to the latest deployment's tables.

</details>

## Health checks & probes

Use the `/health` and `/ready` endpoints to configure health checks or [probes](https://kubernetes.io/docs/concepts/configuration/liveness-readiness-startup-probes/).

- **`/health`**: Returns status code `200` immediately after the process starts.
- **`/ready`**: Returns status code `200` once indexing progress has reached realtime across all chains. During the backfill, this endpoint returns status code `503`.

## Crash recovery

If a Ponder app running `ponder start` crashes and restarts using the same database schema, it will attempt to resume indexing where it left off. [Read more](../api-reference/ponder/database.md) about the instance lifecycle and crash recovery mechanism.

## Advanced

### Resource Usage

Ponder dynamically adjusts its memory usage based on availability. To cap the Bun heap, pass `--max-heap-size` (MiB) to `bun`:

```bash
bun --max-heap-size=4096 run start --schema=deployment-123
```

When using `ordering: "experimental_isolated"`, Ponder will use up to 4 CPU cores to index blocks in parallel.

### Scale the HTTP server

If a `ponder start` instance receives a large volume of HTTP traffic (e.g. GraphQL requests), the HTTP server will contend with the indexing engine for CPU and memory resources. This can lead to degraded indexing performance and might ultimately crash the instance.

To solve this problem, you can use `ponder serve` to run standalone instances of the HTTP server without the indexing engine. Here are a few things to keep in mind.

- The `ponder serve` instance should use the same [database schema](#database-schema) as the `ponder start` instance that you'd like to scale.
- If one `ponder serve` instance is not enough, it's safe to run multiple replicas behind a proxy.

### Database maintenance

The `ponder db` CLI entrypoint offers a set of commands useful for observing and maintaining your database. [Read more](../api-reference/ponder/cli.md).
