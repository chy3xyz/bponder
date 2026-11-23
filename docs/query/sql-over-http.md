# SQL over HTTP

Query with custom SQL over HTTP

Ponder natively supports SQL queries over HTTP using the `bponder-client` and `bponder-react` packages.

SQL over HTTP is a more powerful alternative to [GraphQL](./graphql.md) that offers live updates and the flexibility of SQL in your client code.

The client talks to the Bun `/v1` contract: `POST /v1/sql`, `GET /v1/status`, and `GET /v1/live`. Pass the **app origin** to `createClient` — the client appends `/v1/*`. There is no Drizzle `client.db` query builder on this contract.

## Setup

### Install `bponder-client`

Install the `bponder-client` package in your client project.

**bun**

```bash
bun add bponder-client
```

**pnpm**

```bash
pnpm add bponder-client
```

**yarn**

```bash
yarn add bponder-client
```

**npm**

```bash
npm add bponder-client
```

### Create a query client

Use `createClient` with the Ponder app origin (default port `42069`).

**Client project**

```ts
import { createClient } from "bponder-client";

const client = createClient({ url: "http://localhost:42069" });
```

Now the client can send SQL over HTTP.

**Client project**

```ts
import { createClient } from "bponder-client";

const client = createClient({ url: "http://localhost:42069" });

const { rows } = await client.sql("SELECT * FROM account LIMIT 10");
```

## Setup React

The `bponder-react` package provides React hook bindings for the SQL over HTTP client. This package wraps [TanStack Query](https://tanstack.com/query), a popular library for managing async state in React.

### Install dependencies

Install `bponder-react` and peer dependencies in your client project.

**bun**

```bash
bun add bponder-react bponder-client @tanstack/react-query
```

**pnpm**

```bash
pnpm add bponder-react bponder-client @tanstack/react-query
```

**yarn**

```bash
yarn add bponder-react bponder-client @tanstack/react-query
```

**npm**

```bash
npm add bponder-react bponder-client @tanstack/react-query
```

### Set up `bponder-client`

Follow the [steps above](#setup) to set up a SQL over HTTP query client using `bponder-client`.

**lib/ponder.ts**

```ts
import { createClient } from "bponder-client";

export const client = createClient({ url: "http://localhost:42069" });
```

### Set up `PonderProvider`

Wrap your app with `PonderProvider` and include the `client` object you created in the previous step.

**app/layout.tsx**

```ts
import { PonderProvider } from "bponder-react";
import { client } from "../lib/ponder";
 
function App() {
  return (
  );
}
```

### Set up TanStack Query

Inside the `PonderProvider`, wrap your app with a TanStack Query Provider. If you're already using TanStack Query, you can skip this step. [Read more](https://tanstack.com/query/latest/docs/framework/react/quick-start) about setting up TanStack Query.

**app/layout.tsx**

```ts
import { PonderProvider } from "bponder-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { client } from "../lib/ponder";
 
const queryClient = new QueryClient();
 
function App() {
  return (
  );
}
```

## Querying

The SQL over HTTP client reads indexed data from your Ponder database.

It's different than [direct SQL](./direct-sql.md) in two key areas:
- Schema names are applied on the server. Table names in the SQL string should be unqualified.
- Only `SELECT` statements are allowed, with limited resources. Read more about [security](#security).

**TypeScript**

```ts
const { rows } = await client.sql(
  "SELECT * FROM account ORDER BY balance DESC LIMIT 10",
);
```

**React**

```ts
import { usePonderQuery } from "bponder-react";

const query = usePonderQuery({
  sql: "SELECT * FROM account ORDER BY balance DESC LIMIT 10",
});
```

`client.sql` and `client.query` both `POST` to `/v1/sql` and return `{ rows }`.

### Live queries

`client.live` subscribes to `GET /v1/live` server-sent `status` events. It does **not** push query results; it notifies you that the checkpoint moved so you can refetch.

**TypeScript**

```ts
const { unsubscribe } = client.live(
  (status) => {
    // Refetch SQL after each indexed checkpoint.
    console.log("checkpoint", status.checkpoint);
  },
  (error) => {
    // ... handle error
  },
);
```

**React**

```ts
import { usePonderQuery } from "bponder-react";

// `usePonderQuery` invalidates on `/v1/live` status events by default.
const query = usePonderQuery({
  sql: "SELECT * FROM account ORDER BY balance DESC LIMIT 10",
});
```

### Pagination

Use `LIMIT` / `OFFSET` (or a cursor column) in the SQL string.

**TypeScript**

```ts
const { rows } = await client.sql(
  "SELECT * FROM account ORDER BY balance DESC LIMIT 100 OFFSET 500",
);
```

**React**

```ts
import { usePonderQuery } from "bponder-react";

const query = usePonderQuery({
  sql: "SELECT * FROM account ORDER BY balance DESC LIMIT 100 OFFSET 500",
});
```

## Frequently asked questions

### Security

Here are the measures taken on `/v1/sql` to prevent malicious queries and denial-of-service attacks. These measures aim to achieve a similar level of risk as the GraphQL API.

- **Read-only**: Each query statement runs in a `READ ONLY` transaction using autocommit.
- **Query validator**: Each query is parsed using [`libpg_query`](https://github.com/pganalyze/libpg_query) and must pass the following checks.

  - The query AST root must be a `SELECT{:sql}` statement. Queries containing multiple statements are rejected.
  - The query must only contain allowed AST node types and built-in SQL functions. For example, `SELECT{:sql}`, `WHERE{:sql}`, and `max(){:sql}` are allowed, but `DELETE{:sql}`, `SET{:sql}`, and `pg_advisory_lock(){:sql}` are not. [Read more](https://github.com/ponder-sh/ponder/blob/main/packages/core/src/client/validate.ts).
  - The query must not reference objects in schemas other than the current schema. [Read more](../database.md#database-schema).

- **Resource limits**: The database session uses the following resource limit settings.
  <div className="h-2" />
  ```sql
  SET work_mem = '512MB';
  SET statement_timeout = '500ms';
  SET lock_timeout = '500ms';
  ```
