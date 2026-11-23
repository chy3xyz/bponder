# Isolated indexing

Index each chain independently

The **isolated** ordering mode runs each chain independently across several worker threads.

> **Warning:**   Isolated indexing is currently marked as *experimental*.

## When to use

Isolated indexing is a good choice for projects with the following characteristics.

* The project was already using `"multichain"` ordering.
* The indexing logic on each chain is **completely independent**. This means that indexing on each chain can logically proceed regardless of indexing progress on other chains.
* Backfill duration is a priority, and other performance optimizations are already in place (minimize raw SQL, minimize contract calls).

## Guide

### Enable isolated mode

To enable isolated mode, use the `ordering` option in `ponder.config.ts`.

**ponder.config.ts**

```ts
import { createConfig } from "bponder";

export default createConfig({
  ordering: "experimental_isolated",
  // ...
});
```

### Update primary keys

When using isolated mode, each table must have a **composite primary key** that includes a column named `chainId`. If any tables don't, the build step will fail.

In this example, the `balance` column value would represent the balance on a specific chain.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const account = onchainTable(
  "account",
  (t) => ({
    chainId: t.integer().notNull(),
    address: t.hex().notNull(),
    balance: t.bigint().notNull(), 
  }),
  (table) => ({ pk: primaryKey({ columns: [table.chainId, table.address] }) })
);
```

> **Note:**   Under the hood, the composite primary key design enables Ponder to use partitioned tables with one partition per chain. This design avoids any contention between concurrent writers across chains, and also speeds up queries that only access one chain.

It also generally makes sense to include the `chainId` column in index definitions.

**ponder.schema.ts**

```ts
export const transferEvent = onchainTable(
  "transfer_event",
  (t) => ({
    chainId: t.integer().notNull(),
    id: t.text().notNull(),
    from: t.hex().notNull(),
    to: t.hex().notNull(),
    amount: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.chainId, table.id] }),
    fromIdx: index().on(table.chainId, table.from),
  })
);
```

### Update indexing logic

Next, update your indexing logic to include `chainId` when inserting data using the `context.chain.id` value.

**src/index.ts**

```ts
import { ponder } from "bponder:registry";

ponder.on("ERC20:Transfer", async ({ event, context }) => {
  await context.db
    .insert(account)
    .values({
      chainId: context.chain.id,
      address: event.args.to,
      balance: 0,
    })
    .onConflictDoUpdate((row) => ({ balance: row.balance + event.args.value }));

  // ...
})
```

## Frequently asked questions

#### How many threads does it use?

At the moment, Ponder uses a maximum of 4 threads. If there are more than 4 chains, the chains will be distributed evenly across the 4 threads. The maximum thread count will likely be made configurable as the feature matures.
