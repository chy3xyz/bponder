# Indexing

Write indexing functions that populate the database

An indexing function is a TypeScript function that's triggered by onchain activity (an event log, call trace, transaction, transfer, or block).

The purpose of indexing functions is to transform onchain data and insert it into the tables you've defined in `ponder.schema.ts`.

## Register an indexing function

To register an indexing function, use `ponder.on(...)`. The first argument is the event name, and the second argument is the function / callback that the indexing engine runs to process the event.

**src/index.ts**

```ts
import { ponder } from "bponder:registry";

ponder.on("Blitmap:MetadataChanged", async ({ event, context }) => {
  await context.db
    .insert(tokens)
    .values({
      id: event.args.tokenId,
      metadata: event.args.newMetadata,
    })
    .onConflictDoUpdate({
      metadata: event.args.newMetadata,
    });
});
```

Read more about how to [write to the database](./write.md) and [read contract data](./read-contracts.md) within indexing functions.

## Frequently asked questions

### Ordering

For each chain, the indexing engine calls indexing functions according to EVM execution order (block number, transaction index, log index). [Read more](../api-reference/ponder/config.md#ordering) about the ordering guarantee across multiple chains, which is more complex. 

### Reorgs

The indexing engine automatically handles reorgs within each chain's configured [`reorgWindow`](../config/chains.md#reorg-window). You do not need to adjust your indexing function logic to handle them. Here's how it works.

- The indexing engine records all changes (insert, update, delete) to each table defined in `ponder.schema.ts` using a trigger-based [transaction log](https://en.wikipedia.org/wiki/Transaction_log).
- When the indexing engine detects a reorg, it follows these steps to reconcile the database state with the new canonical chain.
  1. Evict all non-canonical data from the RPC cache.
  2. Roll back the database to the common ancestor block height using the transaction log.
  3. Fetch the new canonical data from the RPC / remote chain.
  4. Run indexing functions to process the new canonical data.
- Ponder treats a block as finalized once it is outside the `reorgWindow`, then removes its rollback records to limit database growth.
- If a reorg crosses this finalized boundary, Ponder errors rather than continue with inconsistent data.

### Crash recovery

If the process crashes and starts back up again using the same exact configuration, the indexing engine attempts a crash recovery. This process is similar to reorg reconciliation, except all changes within the `reorgWindow` are rolled back. Then, indexing resumes from the most recent block that Ponder treated as finalized.

### Backfill vs. live indexing

Internally, the indexing engine has two distinct modes – **backfill** and **live** indexing – which use different approaches for fetching data from the RPC.

However, indexing function logic works the same way in both modes. As long as the logic is compatible with the expected onchain activity, indexing will work fine in both modes.
