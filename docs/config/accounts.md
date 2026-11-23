# Accounts

Index transactions and native transfers

To index **transactions** or **native transfers** sent to (or from) an address, use the `accounts` field in `ponder.config.ts`.

This guide describes each configuration option and suggests patterns for common use cases. Visit the config [API reference](../api-reference/ponder/config.md) for more information.

> **Warning:**   The RPC methods that power account indexing (`eth_getBlockByNumber`, `debug_traceBlockByNumber`) do not support filtering the way `eth_getLogs` does. Large backfills may consume an impractical amount of RPC credits.

## Example

This config instructs the indexing engine to fetch transactions or native transfers sent by the [Beaver](https://beaverbuild.org/) block builder account.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: {
    mainnet: { id: 1, rpc: process.env.PONDER_RPC_URL_1 },
  },
  accounts: {
    BeaverBuild: {
      chain: "mainnet",
      address: "0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5",
      startBlock: 20000000,
    },
  },
});
```

Now, we can register an indexing function for the `transaction:from` event. The indexing engine will fetch all transactions where `from` matches the specified address, then call the indexing function for each transaction.

**src/index.ts**

```ts
import { ponder } from "bponder:registry";
import { deposits } from "bponder:schema";

ponder.on("BeaverBuild:transaction:from", async ({ event, context }) => {
  await context.db.insert(deposits).values({
    from: event.transaction.from,
    to: event.transaction.to,
    value: event.transaction.value,
    input: event.transaction.input,
  });
});
```

You can also register indexing functions for the `transaction:to`, `transfer:from`, and `transfer:to` events. [Read more](../api-reference/ponder/config.md#accounts) about event types.

> **Tip:**   The indexing engine only fetches data required for _registered_ indexing functions. In this example, native transfers will **not** be fetched because no indexing functions were registered for `transfer:from` and `transfer:to`.

## Name

Every account must have a unique name, provided as a key to the `accounts` object. Names must be unique across accounts, contracts, and block intervals.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  chains: { /* ... */ },
  accounts: {
    BeaverBuild: {
      chain: "mainnet",
      address: "0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5",
      startBlock: 12439123,
    },
  },
});
```

## Chain

The `chain` option for accounts works the same way as it does for contracts. You can specify a different `address`, `startBlock`, and `endBlock` for each chain.

[Read more](./contracts.md#chain) in the contracts guide.

## Address

The `address` option for accounts works the same way as it does for contracts. You can provide a single address, a list of addresses, or an address factory. You can also specify chain-specific overrides.

[Read more](./contracts.md#address) in the contracts guide.

## Block range

The `startBlock` and `endBlock` options for accounts work the same way as it does for contracts.

[Read more](./contracts.md#block-range) in the contracts guide.

## Transaction receipts

The `includeTransactionReceipts` option for accounts works the same way as it does for contracts.

[Read more](./contracts.md#transaction-receipts) in the contracts guide.
