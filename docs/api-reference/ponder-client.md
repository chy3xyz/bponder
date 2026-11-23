# `bponder-client`

API reference

> **Tip:** This is a low-level reference. For an introduction, visit the
> [SQL over HTTP](../query/sql-over-http.md) page.

The `bponder-client` package queries a Ponder app over the Bun `/v1` HTTP contract (`POST /v1/sql`, `GET /v1/status`, `GET /v1/live`).

## Installation

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

## `createClient`

Create a client connected to a Ponder server. Pass the **app origin**; the client appends `/v1/*`. Do not include `/sql` in the URL.

#### Usage

**Client project**

```ts
import { createClient } from "bponder-client";

const client = createClient({ url: "http://localhost:42069" });

export { client };
```

#### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `url` | `string` | Ponder app origin (for example `http://localhost:42069`) |
| `fetch` | `typeof fetch` (optional) | Fetch implementation. Defaults to `globalThis.fetch`. |

#### Returns

Returns a `Client` with `getStatus`, `sql`, `query`, and `live`.

## `client.sql` / `client.query`

`POST /v1/sql` with `{ sql }` or `{ query }`. Both return `{ rows }`. Only `SELECT` statements are allowed.

#### Usage

**Client project**

```ts
import { client } from "../lib/ponder";

const { rows } = await client.sql("SELECT * FROM account LIMIT 10");

const also = await client.query("SELECT * FROM account WHERE id = '0x123'");
```

#### Returns

```ts
type SqlResult = {
  rows: Record<string, unknown>[];
};
```

## `client.live`

Subscribe to `GET /v1/live` server-sent `status` events. The callback receives checkpoint status, not query rows — refetch SQL yourself (React hooks do this automatically).

#### Usage

**Client project**

```ts
import { client } from "../lib/ponder";

const { unsubscribe } = client.live(
  (status) => {
    console.log("checkpoint", status.checkpoint);
  },
  (error) => {
    console.error("Subscription error:", error);
  },
);

unsubscribe();
```

#### Parameters

| Parameter | Type | Description |
| --- | --- | --- |
| `onStatus` | `(status: Status) => void` | Called for each SSE `status` event |
| `onError` | `(error: Error) => void` | Optional error handler |

#### Returns

An object with `unsubscribe()`.

## `client.getStatus`

`GET /v1/status`.

#### Usage

**Client project**

```ts
import { client } from "../lib/ponder";

const status = await client.getStatus();

console.log("checkpoint", status.checkpoint);
```

#### Returns

```ts
type Checkpoint = {
  blockNumber: number;
  id: string;
};

type Status = {
  checkpoint: Checkpoint | null;
};
```
