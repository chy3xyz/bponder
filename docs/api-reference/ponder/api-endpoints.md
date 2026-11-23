# API endpoints

API reference

> **Tip:** This is a low-level reference. For an overview, visit the
> [Query](../../query/api-endpoints.md) section.

Ponder's HTTP server is built with [Hono](https://hono.dev/), a fast and lightweight routing framework.

## Hono

Hono supports all standard HTTP methods and an intuitive middleware API.

| method           | description                          |
| :--------------- | :----------------------------------- |
| `get`            | Register a handler for GET requests  |
| `post`           | Register a handler for POST requests |
| `use`            | Register middleware for a path       |
| ...and many more |                                      |

## File requirements

The `src/api/index.ts` file _must_ **default export** a Hono app instance. You can use other files in `src/api/` to organize your code, just be sure to export the Hono app instance correctly.

**src/api/index.ts**

```ts
import { Hono } from "hono";

const app = new Hono();

app.get("/hello", (c) => {
  return c.text("Hello, world!");
});

export default app;
```

## `bponder:schema`

The `bponder:schema` virtual module conveniently re-exports the `ponder.schema.ts` file.

**src/api/index.ts**

```ts
import { db } from "bponder:api";
import { accounts } from "bponder:schema";
import { Hono } from "hono";

const app = new Hono();

app.get("/account/top-10", async (c) => {
  const account = await db 
    .select()
    .from(accounts)
    .limit(10)

  return c.json(account);
});

export default app;
```

## `bponder:api`

The `bponder:api` virtual module exports a ready-to-use Drizzle database client and Viem clients configured according to `ponder.config.ts`.

### `db`

A read-only Drizzle database client backed by a client-side connection pool.

#### Usage

**src/api/index.ts**

```ts
import { db } from "bponder:api";
import { accounts } from "bponder:schema";
import { Hono } from "hono";
import { eq } from "bponder";

const app = new Hono();

app.get("/account/:address", async (c) => {
  const address = c.req.param("address");

  const account = await db
    .select()
    .from(accounts)
    .where(eq(accounts.address, address));

  return c.json(account);
});

export default app;
```

### `publicClients`

A object containing a Viem [Public Client](https://viem.sh/docs/clients/public) for each chain defined in `ponder.config.ts`.

#### Usage

**src/api/index.ts**

```ts
import { publicClients } from "bponder:api";
import { Hono } from "hono";

const app = new Hono();

app.get("/balance/:address", async (c) => {
  const address = c.req.param("address");

  const balance = await publicClients["base"].getBalance({ address });

  return c.json({ address, balance });
});

export default app;
```

## Middlewares

### `graphql`

The `graphql` function is a Hono middleware that accepts the `ponder.schema.ts` schema object and automatically generates a fast & secure GraphQL API.

| field      |    type    | description                                                              |
| :--------- | :--------: | :----------------------------------------------------------------------- |
| **db**     | `Database` | **Required**. Drizzle database object exported from `"bponder:api"{:ts}`. |
| **schema** |  `Schema`  | **Required**. Drizzle schema exported from `"bponder:schema"{:ts}`.       |

#### Usage

**src/api/index.ts**

```ts
import { db } from "bponder:api";
import schema from "bponder:schema";
import { graphql } from "bponder";
import { Hono } from "hono";

const app = new Hono();

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

export default app;
```

### `client`

The `client` function is a Hono middleware that serves SQL over HTTP queries submitted by `bponder-client`.

| field      |    type    | description                                                              |
| :--------- | :--------: | :----------------------------------------------------------------------- |
| **db**     | `Database` | **Required**. Drizzle database object exported from `"bponder:api"{:ts}`. |
| **schema** |  `Schema`  | **Required**. Drizzle schema exported from `"bponder:schema"{:ts}`.       |

#### Usage

**src/api/index.ts**

```ts
import { db } from "bponder:api";
import schema from "bponder:schema";
import { Hono } from "hono";
import { client } from "bponder";

const app = new Hono();

app.use("/sql/*", client({ db, schema }));

export default app;
```

## Reserved routes

Ponder reserves a few routes for standard use. If you register custom endpoints that conflict with these routes, the build will fail.

| route      | description                                                                                          |
| :--------- | :--------------------------------------------------------------------------------------------------- |
| `/health`  | Returns status code `200` immediately after the process starts.                                      |
| `/ready`   | Returns status code `503` during the backfill, and status code `200` after the backfill is complete. |
| `/status`  | Returns the current indexing status. [Read more](../../advanced/observability.md#indexing-status).                             |
| `/metrics` | Prometheus metrics endpoint. [Read more](../../advanced/observability.md#metrics).                                    |
