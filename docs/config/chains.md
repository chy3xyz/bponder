# Chains

Configure chain IDs and RPC endpoints

Use the `chains` field in `ponder.config.ts` to configure chain IDs and names, RPC endpoints, and connection options.

This guide describes each configuration option and suggests patterns for common use cases. Visit the config [API reference](../api-reference/ponder/config.md) for more information.

## Example

This config sets up two chains: Ethereum mainnet and Optimism.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1,
    },
    optimism: {
      id: 10,
      rpc: [
        process.env.PONDER_RPC_URL_10,
        "https://optimism.llamarpc.com",
      ],
    },
  },
  contracts: { /* ... */ },
});
```

## Name

Each chain must have a unique name, provided as a key to the `chains` object. The contract, account, and block interval `chain` options reference the chain name.

Within indexing functions, the `context.chain.name` property contains the chain name of the current event.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1,
    },
  },
  contracts: {
    Blitmap: {
      abi: BlitmapAbi,
      chain: "mainnet",
      address: "0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63",
    },
  },
});
```

## Chain ID

Use the `id` field to specify a unique [Chain ID](https://chainlist.org) for each chain. Within indexing functions, the `context.chain.id` property contains the chain ID of the current event.

The indexing engine uses `id` in the cache key for RPC responses. To avoid cache issues, make sure `id` always matches the chain ID of the configured RPC endpoint.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: "https://eth.llamarpc.com",
    },
  },
  contracts: { /* ... */ },
});
```

> **Note:**   Ponder does not support chain IDs greater than JavaScript's `Number.MAX_SAFE_INTEGER` (9007199254740991).

## RPC endpoints

> **Warning:**   Most Ponder apps require a paid RPC provider plan to avoid rate-limiting.

Use the `rpc` field to provide one or more RPC endpoints for each chain.

Ponder dynamically adapts to provider rate limits to avoid 429 errors and maximize performance. Providing multiple endpoints enables intelligent load balancing and fallback logic to improve reliability.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: "https://eth-mainnet.g.alchemy.com/v2/...",
    },
  },
  contracts: { /* ... */ },
});
```

### Custom transport

The `rpc` field also accepts a [Viem Transport](https://viem.sh/docs/clients/intro#transports), which can be useful if you need more granular control over how RPC requests are made.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { http, fallback } from "viem";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: fallback([
        http("https://eth-mainnet.g.alchemy.com/v2/..."),
        http("https://quaint-large-card.quiknode.pro/..."),
      ]),
    },
  },
});
```

Here are a few common transport options.

* [`http`](https://viem.sh/docs/clients/transports/http)
* [`webSocket`](https://viem.sh/docs/clients/transports/websocket)
* [`fallback`](https://viem.sh/docs/clients/transports/fallback)
* [`loadBalance`](../api-reference/ponder-utils.md#loadbalance)
* [`rateLimit`](../api-reference/ponder-utils.md#ratelimit)

## WebSocket

Use the optional `ws` field to specify a WebSocket RPC endpoint for each chain.

When provided, Ponder will use WebSocket connections for realtime block subscriptions instead of polling. Websocket connections typically offer lower latency and reduced RPC usage.

> **Note:**   If the WebSocket connection becomes unstable or fails, Ponder automatically falls back to the default polling mechanism to ensure continuous indexing.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: "https://eth-mainnet.g.alchemy.com/v2/...",
      ws: "wss://eth-mainnet.g.alchemy.com/v2/...",
    },
  },
  contracts: { /* ... */ },
});
```

## Polling interval

The `pollingInterval` option controls how frequently (in milliseconds) the indexing engine checks for a new block in realtime. The default is `1000` (1 second).

If you set `pollingInterval` greater than the chain's block time, it **does not reduce RPC usage**. The indexing engine still fetches every block to check for reorgs. The default is suitable for most chains.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1,
      pollingInterval: 2_000, // 2 seconds
    },
  },
});
```

## Reorg window

The `reorgWindow` option controls how long Ponder retains the data required to automatically recover from a chain reorganization. The value is measured in seconds and defaults to `180` (3 minutes).

Increasing `reorgWindow` lets Ponder recover from older reorgs, but increases memory and database usage. Decreasing it reduces resource usage, but increases the chance that Ponder encounters an unrecoverable reorg and crashes with a fatal error.

The value must be an integer between `0` and `600` (10 minutes). Setting `reorgWindow` to `0` disables automatic reorg recovery by treating each block as finalized immediately. Ponder will still detect reorgs and crash with a fatal error rather than continue with inconsistent data.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1,
      reorgWindow: 300, // 5 minutes
    },
  },
});
```

## RPC request cache

By default, Ponder [caches JSON-RPC data](../api-reference/ponder/database.md#rpc-request-cache) in the database and reuses it between runs. Set `cacheRpcRequests: false` to disable the cache for a chain. Ponder then does not read or write these items in the database, and fetches them again each time it starts:

- Block data (blocks, logs, transactions, transaction receipts, and traces)
- Factory child addresses
- `context.client` requests

Disable the cache for a development node like Anvil, where the chain can reset, or for a node you run yourself, where fetching data again is cheaper than storing it in the database. [Read more](../guides/foundry.md) about indexing Anvil.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: {
    anvil: {
      id: 31337,
      rpc: "http://127.0.0.1:8545",
      cacheRpcRequests: false,
    },
  },
});
```

## `eth_getLogs` block range

Ponder does its best to automatically determine the maximum block range for JSON-RPC requests with the `eth_getLogs` method. When this comes up short, you can set a manual limit with `ethGetLogsBlockRange` option. 

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: "https://eth-mainnet.g.alchemy.com/v2/...",
      ethGetLogsBlockRange: 1000,
    },
  },
});
```
