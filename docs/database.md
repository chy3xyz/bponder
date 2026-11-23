# Database

Set up the database

Ponder supports two database options, [**PGlite**](https://pglite.dev/) and Postgres.

- **PostgreSQL**: A traditional Postgres database server. **Required for production**, and the recommended local database.
- **PGlite**: An embedded Postgres database. PGlite runs in the same Bun process as Ponder, and stores data in the `.ponder` directory. **Only suitable for local development**.

## Choose a database

Ponder uses PGlite by default when `DATABASE_URL` is unset. To use Postgres, set the `DATABASE_URL` environment variable to a Postgres connection string, or use explicit configuration in `ponder.config.ts`.

```ts
import { createConfig } from "bponder";

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: "postgresql://user:password@localhost:5432/dbname",
  },
  // ...
});
```

[Read more](./api-reference/ponder/config.md#database) about database configuration in the `ponder.config.ts` API reference.

> **Note:** Under Bun, `createDatabase` defaults to **Bun.SQL** (`drizzle-orm/bun-sql`). Set `PONDER_DATABASE_DRIVER=pg` to force node-postgres. `database.poolConfig` keeps the node-postgres [`PoolConfig`](https://node-postgres.com/apis/pool) shape for the `pg` escape hatch; Bun.SQL uses the connection URL, schema, and a mapped pool size. PGlite remains available for local/tests when `DATABASE_URL` is unset.

## Database schema

Ponder uses **database schemas** to organize data. Each instance must use a different schema.

Use the `DATABASE_SCHEMA` environment variable or `--schema` CLI option to configure the database schema for an instance. This is where the app will create the tables defined in `ponder.schema.ts`.

**.env.local**

```bash
DATABASE_SCHEMA=my_schema
```

**CLI**

```bash
bun run start --schema my_schema
```

[Read more](./production/self-hosting.md#database-schema) about database schema selection in the self-hosting guide.

### Guidelines

Here are a few things to keep in mind when choosing a database schema.

- No two Ponder instances/deployments can use the same database schema at the same time.
- Tables created by `ponder start` are treated as valuable and will never be dropped automatically.
- The default schema for `ponder dev` is `public`. There is no default for `ponder start`, you must explicitly set the database schema.
- Use `ponder dev` for local development; `ponder start` is intended for production.
