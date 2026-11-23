# Transaction receipts

Fetch transaction receipts

A **transaction receipt** is an object containing the *post-execution* results of a transaction, including the price and amount of gas consumed, the revert status, the logs emitted, and more.

> **Tip:** In contrast, the **transaction input** only includes *pre-execution* data like the from and to addresses, input, and native transfer amount. Ponder includes transaction inputs automatically at `event.transaction`.

## Guide

Ponder supports transaction receipts with the `includeTransactionReceipts` option, **or** dynamic RPC requests through `context.client`.

### Include receipts for every event

> **Warning:** Transaction receipts fetched using `includeTransactionReceipts` do not include the `logs` array.

To fetch the transaction receipt associated with every event produced by a contract, use the `includeTransactionReceipts` option.

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
      includeTransactionReceipts: true,
      startBlock: 12439123,
    },
  },
  // ...
});
```

Once enabled, the `event.transactionReceipt` object will become available in your indexing functions.

**src/index.ts**

```ts
import { ponder } from "bponder:registry";

ponder.on("Blitmap:Mint", async ({ event }) => {
  console.log(event.transactionReceipt);

  // ...
});
```

### Fetch receipts ad-hoc

If you only need the transaction receipt in special cases, or you need the `logs` array, use the `context.client.getTransactionReceipt` method within your indexing function logic.

**src/index.ts**

```ts
import { ponder } from "bponder:registry";

ponder.on("Blitmap:Mint", async ({ event }) => {
  const receipt = await context.client.getTransactionReceipt({
    hash: event.transaction.hash
  });
  console.log(receipt);

  // ...
});
```
