# `ponder.config.ts`

API reference

> **Tip:**   This is a low-level reference. For an introduction, visit the
>   different config sections: [Chains](../../config/chains.md), [Contracts](../../config/contracts.md), [Accounts](../../config/accounts.md), [Block intervals](../../config/block-intervals.md).

The `ponder.config.ts` file defines chain IDs, RPC URLs, contract addresses & ABIs, and database configuration.

## File requirements

The `ponder.config.ts` file must **default export** the object returned by `createConfig` (or `defineConfig`). `defineConfig` is the new config helper; `createConfig` still drives the current CLI load path.

{/* prettier-ignore */}
```ts [ponder.config.ts] {1,4}
import { createConfig } from "bponder";

export default createConfig({
  chains: { /* ... */ },
  contracts: { /* ... */ },
});
```

By default, `ponder dev` and `start` look for `ponder.config.ts` in the current working directory. Use the `--config-file` CLI option to specify a different path.

## `createConfig`

### `database`

Here is the logic Ponder uses to determine which database to use:

- If the `database.kind` option is specified, use the specified database.
- If the `DATABASE_URL` environment variable is defined, use Postgres with that connection string.
- If `DATABASE_URL` is not defined, use PGlite.

| field    |           type           |                                          |
| :------- | :----------------------: | :--------------------------------------- |
| **kind** | `"pglite" \| "postgres"` | **Default: See above.** Database to use. |

#### PGlite

| field         |    type    |                                                                                 |
| :------------ | :--------: | :------------------------------------------------------------------------------ |
| **kind**      | `"pglite"` |                                                                                 |
| **directory** |  `string`  | **Default: `.ponder/pglite`**. Directory path to use for PGlite database files. |

Set `directory` to `"memory://"` to use an in-memory database (data will not persist across restarts).

```ts [ponder.config.ts] {4-7}
import { createConfig } from "bponder";

export default createConfig({
  database: {
    kind: "pglite",
    directory: "./.ponder/pglite",
  },
  // ...
});
```

#### Postgres

| field                |                        type                         |                                                                           |
| :------------------- | :-------------------------------------------------: | :------------------------------------------------------------------------ |
| **kind**             |                    `"postgres"`                     |                                                                           |
| **connectionString** |                      `string`                       | **Default: `DATABASE_URL` env var**. Postgres database connection string. |
| **poolConfig**       | [`PoolConfig`](https://node-postgres.com/apis/pool) | **Default: `{ max: 30 }`**. Pool options for the `pg` escape hatch (`PONDER_DATABASE_DRIVER=pg`). Under Bun, Postgres defaults to Bun.SQL; `max` maps to the Bun.SQL pool size when that driver is active. |

```ts [ponder.config.ts] {4-10}
import { createConfig } from "bponder";

export default createConfig({
  database: {
    kind: "postgres",
    connectionString: "postgresql://user:password@localhost:5432/dbname",
    poolConfig: {
      max: 100,
      ssl: true,
    },
  },
  // ...
});
```

### `ordering`

Specifies how events across multiple chains should be ordered. For single-chain apps, `ordering` has no effect.

#### Usage

```ts [ponder.config.ts] {4}
import { createConfig } from "bponder";

export default createConfig({
  ordering: "multichain",
  chains: { /* ... */ },
  // ... more config
});
```

#### Parameters

| field        |             type                            |                                                       |
| :----------- | :-----------------------------------------: | :---------------------------------------------------- |
| **ordering** | `"omnichain" \| "multichain" \| "experimental_isolated"` | **Default:** `"multichain"` |

#### Guarantees

The ordering strategies offer different guarantees. Omnichain ordering combines all chains into a single, unified stream of events. Multichain and isolated ordering treat each chain independently, with isolated enforcing additional constraints but taking advantage of multiple CPU cores for better performance.

> **Note:**   Isolated ordering (experimental): When using ordering: "experimental_isolated", all tables in your schema must include a chainId column that is part of the primary key. This ensures complete isolation between chains and prevents any cross-chain data access.

|                                      | Omnichain                                                                   | Multichain (default)                                       | Isolated                                                   | 
| :----------------------------------- | :-------------------------------------------------------------------------- | :--------------------------------------------------------- | :--------------------------------------------------------- |
| Event order for any individual chain | Deterministic, by EVM execution                                             | Deterministic, by EVM execution                            | Deterministic, by EVM execution                            |
| Event order across chains            | Deterministic, by (block timestamp, chain ID, block number)                 | Non-deterministic, no ordering guarantee                   | Non-deterministic, no ordering guarantee                   |
| Live indexing latency                | Medium-high, must wait for the slowest chain to maintain ordering guarantee | Low, each chain indexes blocks as soon as they arrive      | Low, each chain is processed independently                 |
| Indexing logic constraints           | None                                                                        | Must avoid cross-chain writes **or** use commutative logic | Cross-chain reads and write are no possible                |
| Use cases                            | Bridges, cross-chain contract calls, global constraints                     | Same protocol deployed to multiple chains                  | Same protocol deployed to multiple chains                  |

### `chains`

An object mapping chain names to chain configuration.

> **Warning:**   Most Ponder apps require a paid RPC provider plan to avoid rate limits.

#### Usage

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { BlitmapAbi } from "./abis/Blitmap";

export default createConfig({
  chains: {
    mainnet: {
      id: 1,
      rpc: process.env.PONDER_RPC_URL_1,
      ws: process.env.PONDER_WS_URL_1,
    },
  },
  // ...
});
```

#### Parameters

| field                     |    type                            |                                                                                                                                                                                 |
| :------------------------ | :---------------------------------:| :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **name**                  |  `string`                          | **Required**. A unique name for the chain. Must be unique across all chains. _Provided as the object property name._                                                            |
| **id**                    |  `number`                          | **Required**. The [chain ID](https://chainlist.org) for the chain.                                                                                                              |
| **rpc**                   |  `string \| string[] \| Transport` | **Required**. One or more RPC endpoints or a Viem [Transport](https://viem.sh/docs/clients/transports/http) e.g. `http` or `fallback`.                                          |
| **ws**                    |  `string`                          | **Default: `undefined`**. A webSocket endpoint for realtime indexing on this chain.                                                                                             |
| **pollingInterval**       |  `number`                          | **Default: `1_000`**. Frequency (in ms) used when polling for new events on this chain.                                                                                         |
| **reorgWindow**           |  `number`                          | **Default: `180`**. Duration, in seconds between block timestamps, for which Ponder retains the data required to recover from reorgs. Must be an integer between `0` and `600`. |
| **cacheRpcRequests**      |  `boolean`                         | **Default: `true`**. Cache JSON-RPC data in the database and reuse it between runs. [Read more](../../config/chains.md#rpc-request-cache) about RPC request caching. |
| **ethGetLogsBlockRange** |  `number`                          | **Default: `undefined`**. Maximum block range for `eth_getLogs` requests. If undefined, Ponder will attempt to determine the block range automatically based on error messages. |

### `contracts`

An object mapping contract names to contract configuration. Ponder will fetch RPC data and run indexing functions according to the options you provide.

#### Usage

**ponder.config.ts**

```ts
import { createConfig } from "bponder";
import { BlitmapAbi } from "./abis/Blitmap";

export default createConfig({
  contracts: {
    Blitmap: {
      abi: BlitmapAbi,
      chain: "mainnet",
      address: "0x8d04a8c79cEB0889Bdd12acdF3Fa9D207eD3Ff63",
      startBlock: 12439123,
    },
  },
  // ...
});
```

#### Parameters

| field                          |                  type                   |                                                                                                                                                                                                                                        |
| :----------------------------- | :-------------------------------------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **name**                       |                `string`                 | **Required**. A unique name for the smart contract. Must be unique across all contracts. _Provided as the object property name._                                                                                                       |
| **abi**                        |              `abitype.Abi`              | **Required**. The contract [ABI](https://docs.soliditylang.org/en/v0.8.17/abi-spec.html) as an array as const. Must be asserted as constant, see [ABIType documentation](https://abitype.dev/guide/getting-started#usage) for details. |
| **chain**                    |        `string \| ChainConfig`        | **Required**. The name of the chain this contract is deployed to. References the `chains` field. Also supports [multiple chains](../../config/contracts.md#multiple-chains).                                                |
| **address**                    | `0x{string} \| 0x{string}[] \| Factory` | **Default: `undefined`**. One or more contract addresses or factory configuration.                                                                                                                                                     |
| **startBlock**                 |          `number \| "latest"`           | **Default: `0`**. Block number or tag to start indexing. Usually set to the contract deployment block number.                                                                                                                          |
| **endBlock**                   |          `number \| "latest"`           | **Default: `undefined`**. Block number or tag to stop indexing. If this field is specified, the contract will not be indexed in realtime. This field can be used alongside `startBlock` to index a specific block range.               |
| **filter**                     |         [`Filter`](#filter)             | **Default: `undefined`**. Event filter criteria. [Read more](../../config/contracts.md#filter-by-indexed-parameter-value).                                                                                                                               |
| **includeTransactionReceipts** |                `boolean`                | **Default: `false`**. If this field is `true`, `transactionReceipt` will be included in `event`.                                                                                                                                       |
| **includeCallTraces**          |                `boolean`                | **Default: `false`**. If this field is `true`, each function in the abi will be available as an indexing function event name. [Read more](../../guides/call-traces.md).                                            |

#### `filter`

> **Tip:**   The `filter` option is typically only necessary if you have not specified an
>   `address`. By default, Ponder only fetches and indexes events for which you
>   have registered an indexing function.

The `filter` option is used to filter event logs by argument value. [Read more](../../config/contracts.md#filter-by-indexed-parameter-value) about log filters.

| field     |         type         |                                                                                                                                       |
| :-------- | :------------------: | :------------------------------------------------------------------------------------------------------------------------------------ |
| **event** | `string \| string[]` | **Required**. One or more event names present in the provided ABI.                                                                    |
| **args**  |       `object`       | **Required**. An object containing indexed argument values to filter for. Only allowed if **one** event name was provided in `event`. |

### `accounts`

An object mapping account names to account configuration. Accounts are used to index transactions or native transfers.

#### Usage

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  accounts: {
    coinbasePrime: {
      chain: "mainnet",
      address: "0xCD531Ae9EFCCE479654c4926dec5F6209531Ca7b",
      startBlock: 12111233,
    },
  },
  // ...
});
```

#### Parameters

| field                          |                  type                   |                                                                                                                                                                                                                         |
| :----------------------------- | :-------------------------------------: | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **name**                       |                `string`                 | **Required**. A unique name for the smart contract. Must be unique across all contracts. _Provided as the object property name._                                                                                        |
| **chain**                    |                `string`                 | **Required**. The name of the chain this contract is deployed to. References the `chains` field. Also supports [multiple chains](../../config/contracts.md#chain).                                 |
| **address**                    | `0x{string} \| 0x{string}[] \| Factory` | **Default: `undefined`**. One or more contract addresses or factory configuration.                                                                                                                                      |
| **startBlock**                 |                `number`                 | **Default: `0`**. Block number to start syncing events.                                                                                                                                                                 |
| **endBlock**                   |                `number`                 | **Default: `undefined`**. Block number to stop syncing events. If this field is specified, the contract will not be indexed in realtime. This field can be used alongside `startBlock` to index a specific block range. |
| **includeTransactionReceipts** |                `boolean`                | **Default: `false`**. If this field is `true`, `transactionReceipt` will be included in `event`.                                                                                                                        |

### `blocks`

An object mapping block interval names to block interval configuration.

#### Usage

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  blocks: {
    ChainlinkPriceOracle: {
      chain: "mainnet",
      startBlock: 19_750_000,
      interval: 5, every minute
    },
  },
  // ...
});
```

#### Parameters

| field     |                         type                         |                                                                                            |
| :-------- | :--------------------------------------------------: | :----------------------------------------------------------------------------------------- |
| **name**  |                `string`                | **Required**. A unique name for the block interval. Must be unique across all block intervals. _Provided as the object property name._ |
| **chain** |                `string`                | **Required**. The name of the chain this block interval is deployed to. References the `chains` field. Also supports [multiple chains](../../config/contracts.md#chain). |
| **startBlock** |                `number`                | **Default: `0`**. Block number to start syncing events. |
| **endBlock** |                `number`                | **Default: `undefined`**. Block number to stop syncing events. If this field is specified, the contract will not be indexed in realtime. This field can be used alongside `startBlock` to index a specific block range. |
| **interval** |                `number`                | **Default: `0`**. The interval between blocks to index. |

## `factory`

Specifies a list of addresses collected from decoded event logs. Both [`contracts`](#contracts) and [`accounts`](#accounts) support `factory()` in their `address` field. [Read more](../../guides/factory.md) in the factory pattern guide.

| field         |                         type                         |                                                                                            |
| :------------ | :--------------------------------------------------: | :----------------------------------------------------------------------------------------- |
| **address**   |     `0x{string} \| 0x{string}[] \| undefined`        | **Optional**. Address of the factory contract that creates instances of this contract.     |
| **event**     | [`AbiEvent`](https://abitype.dev/api/types#abievent) | **Required**. ABI item of the event that announces the creation of a new child contract.   |
| **parameter** |                       `string`                       | **Optional**. Name of the parameter within `event` that contains child contract addresses. |
| **location**  |       `topic{1\|2\|3} \| offset{number}`        | **Optional**. Low-level alternative to `parameter`. Specifies the exact location (e.g. topic or offset) of the child contract address in `event`. Most users should prefer `parameter` instead. |

```ts [ponder.config.ts] {8-14}
import { createConfig, factory } from "bponder";

export default createConfig({
  contracts: {
    uniswapV2: {
      // ...
      address: factory({
        address: "0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f",
        event: parseAbiItem(
          "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)"
        ),
        parameter: "pair",
      }),
    },
  },
  // ...
});
```

## Types

The `ponder` package exports several utility types. Use these types to maintain type safety when generating config options dynamically.

### DatabaseConfig

```ts [ponder.config.ts] {1,6}
import { createConfig, type DatabaseConfig } from "bponder";

const database = {
  kind: "postgres",
  connectionString: process.env.DATABASE_URL,
} as const satisfies DatabaseConfig;

export default createConfig({
  database,
  // ...
});
```

### ChainConfig

**ponder.config.ts**

```ts
import { createConfig, type ChainConfig } from "bponder";

const mainnet = {
  id: 1,
  rpc: process.env.PONDER_RPC_URL_1,
  ws: process.env.PONDER_WS_URL_1,
} as const satisfies ChainConfig;

export default createConfig({
  chains: {
    mainnet,
  }
  // ...
});
```

### ContractConfig

```ts [ponder.config.ts] {1}
import { createConfig, type ContractConfig } from "bponder";
import { Erc20Abi } from "./abis/Erc20Abi.ts";

const Erc20 = {
  chain: "mainnet"
  abi: Erc20Abi,
  address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
} as const satisfies ContractConfig;

export default createConfig({
  contracts: {
    Erc20,
  },
  // ...
});
```

### BlockConfig

**ponder.config.ts**

```ts
import { createConfig, type BlockConfig } from "bponder";

const ChainlinkPriceOracle = {
  chain: "mainnet",
  startBlock: 19_750_000,
  interval: 5,
} as const satisfies BlockConfig;

export default createConfig({
  blocks: {
    ChainlinkPriceOracle,
  },
  // ...
});
```
