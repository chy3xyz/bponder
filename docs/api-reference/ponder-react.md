# `bponder-react`

API reference

> **Tip:** This is a low-level reference. For an introduction, visit the
> [SQL over HTTP](../query/sql-over-http.md) page.

The `bponder-react` package provides React hooks for querying a Ponder app over the Bun `/v1` contract.

This package uses [`bponder-client`](./ponder-client.md) and [TanStack Query](https://tanstack.com/query) for async state. `usePonderQuery` takes a SQL string (`{ sql }` or `{ query }`), not a Drizzle `queryFn`.

## Installation

`bponder-react` has peer dependencies on `bponder-client` and `@tanstack/react-query`.

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

## `PonderProvider`

React Context Provider that makes the SQL over HTTP client instance available to all child components.

#### Usage

**Client project**

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PonderProvider } from "bponder-react";
import { client } from "../lib/ponder"; // Client instance from bponder-client

const queryClient = new QueryClient();

function App() {
  return (
    </PonderProvider>
  );
}
```

#### Parameters

| Parameter | Type     | Description                                                        |
| --------- | -------- | ------------------------------------------------------------------ |
| `client`  | `Client` | A client instance returned by `createClient` from `bponder-client` |

## `usePonderQuery`

Hook to run a SQL string over HTTP. Live updates invalidate the query when `/v1/live` emits a status event.

#### Usage

**Client project**

```tsx
import { usePonderQuery } from "bponder-react";

function AccountList() {
  const { data, isLoading, error } = usePonderQuery({
    sql: "SELECT * FROM account LIMIT 10",
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <ul>
      {data?.rows.map((account) => (
        <li key={String(account.id)}>{String(account.address)}</li>
      ))}
    </ul>
  );
}
```

#### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `params.sql` | `string` | SQL `SELECT` sent as `{ sql }` |
| `params.query` | `string` | SQL `SELECT` sent as `{ query }` (alias of `sql`) |
| `params.live` | `boolean` | Invalidate on `/v1/live` status events (default: `true`) |
| `...params` | `Omit<UseQueryOptions, "queryFn" \| "queryKey">` | Other `useQuery` options except `queryFn` and `queryKey` |

Pass either `sql` or `query`, not both. Data is `{ rows }`.

#### Returns

Returns a normal TanStack `useQuery` result object. [Read more](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery) in the TanStack documentation.

#### Implementation notes

- Uses [`client.live`](./ponder-client.md#clientlive) to invalidate when a new checkpoint is indexed
- Subscribes on mount and unsubscribes on unmount
- Requires `PonderProvider` in the component tree

## `usePonderStatus`

Hook to query `GET /v1/status` with live updates from `/v1/live`.

#### Usage

**Client project**

```tsx
import { usePonderStatus } from "bponder-react";

function IndexingStatus() {
  const { data, isLoading } = usePonderStatus();

  if (isLoading) return <div>Loading status...</div>;

  return (
    <div>
      checkpoint: {data?.checkpoint?.id ?? "none"} (block{" "}
      {data?.checkpoint?.blockNumber ?? "—"})
    </div>
  );
}
```

#### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `params.live` | `boolean` | Apply `/v1/live` status events (default: `true`) |
| `params` | `Omit<UseQueryOptions<Status>, "queryFn" \| "queryKey">` | Other `useQuery` options except `queryFn` and `queryKey` |

#### Returns

Returns a TanStack `useQuery` result containing `{ checkpoint: { blockNumber, id } | null }`.

## `getPonderQueryOptions`

Helper to build the TanStack Query `queryFn` and `queryKey` for a SQL string.

**index.ts**

```tsx
import { getPonderQueryOptions } from "bponder-react";
import { client } from "../lib/ponder";

const accountsQueryOptions = getPonderQueryOptions(
  client,
  "SELECT * FROM account LIMIT 10",
);
```

#### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `client` | `Client` | A client instance created by `createClient` |
| `source` | `string \| { sql: string } \| { query: string }` | SQL text |

#### Returns

| Property   | Type | Description |
| ---------- | ---- | ----------- |
| `queryKey` | `QueryKey` | Encodes the SQL statement |
| `queryFn`  | `() => Promise<{ rows }>` | Executes the SQL query over HTTP |

## `usePonderQueryOptions`

Same as [`getPonderQueryOptions`](#getponderqueryoptions), but uses the `PonderProvider` context to get the client instance.

**index.ts**

```tsx
import { usePonderQueryOptions } from "bponder-react";

const accountsQueryOptions = usePonderQueryOptions(
  "SELECT * FROM account LIMIT 10",
);
```

## `usePonderClient`

Hook to get the `client` instance from the `PonderProvider` context.

**index.ts**

```ts
import { usePonderClient } from "bponder-react";

const client = usePonderClient();
```

#### Returns

Returns the `client` instance from the `PonderProvider` context.
