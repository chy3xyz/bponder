# Get started

An introduction to Ponder

## What is Ponder?

Ponder is an open-source TypeScript framework for EVM data indexing.

You write TypeScript code to transform onchain data into your application's schema. Then, Ponder fetches data from the chain, runs your indexing logic, and writes the result to Postgres.

Once indexed, you can query the data through GraphQL, SQL over HTTP, or directly in Postgres.

## Quickstart

### Run `create-bponder`

The quickest way to create a new Ponder project is `create-bponder`, which sets up everything automatically for you. Ponder is Bun-native: run `create-bponder` with Bun. [Read more](./requirements.md).

**bun**

```bash
bun create ponder
```

**pnpm**

```bash
pnpm create ponder
```

**yarn**

```bash
yarn create ponder
```

**npm**

```bash
npm init ponder@latest
```

On installation, you'll see a few prompts.

**Default**

```ansi
✔ What's the name of your project? › new-project
✔ Which template would you like to use? › Default

✔ Installed packages with pnpm.
✔ Initialized git repository.
```

**ERC-20 example**

```ansi
✔ What's the name of your project? › new-project
✔ Which template would you like to use? › Reference - ERC20 token

✔ Installed packages with pnpm.
✔ Initialized git repository.
```

This guide follows the ERC-20 example, which indexes a token contract on Ethereum mainnet.

### Start the dev server

After installation, start the local development server.

**bun**

```bash
bun run dev
```

**pnpm**

```bash
pnpm dev
```

**yarn**

```bash
yarn dev
```

**npm**

```bash
npm run dev
```

Ponder will connect to the database, start the HTTP server, and begin indexing.

**Logs**

```ansi
12:16:42.845 INFO  Connected to database type=postgres database=localhost:5432/demo (35ms)
12:16:42.934 INFO  Connected to JSON-RPC chain=mainnet hostnames=["eth-mainnet.g.alchemy.com"] (85ms)
12:16:43.199 INFO  Created database tables count=4 tables=["account","transfer_event","allowance","approval_event"] (17ms)
12:16:43.324 INFO  Created HTTP server port=42069 (5ms)
12:16:43.325 INFO  Started returning 200 responses endpoint=/health
12:16:43.553 INFO  Started backfill indexing chain=mainnet block_range=[13142655,13150000]
12:16:43.555 INFO  Started fetching backfill JSON-RPC data chain=mainnet cached_block=13145448 cache_rate=38.0%
12:16:43.796 INFO  Indexed block range chain=mainnet event_count=4259 block_range=[13142655,13145448] (164ms)
12:16:43.840 INFO  Indexed block range chain=mainnet event_count=33 block_range=[13145449,13145474] (4ms)
```

**Terminal UI**

```ansi
Chains

│ Chain   │ Status   │ Block    │ RPC (req/s) │
├─────────┼──────────┼──────────┼─────────────┤
│ mainnet │ backfill │ 13145260 │        27.5 │

Indexing (backfill)

│ Event          │ Count │ Duration (ms) │
├────────────────┼───────┼───────────────┤
│ ERC20:Transfer │  3345 │         0.015 │
│ ERC20:Approval │   384 │         0.011 │

████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 35.1% (1m 22s eta)

API endpoints
Live at http://localhost:42069
```

### Query the database

Visit [localhost:42069/graphql](http://localhost:42069/graphql) in your browser to explore the auto-generated GraphQL API. Here's a query for the top accounts by balance, along with the total number of accounts.

**Query**

```graphql
query {
  accounts(orderBy: "balance", orderDirection: "desc", limit: 2) {
    items {
      address
      balance
    }
    totalCount
  }
}
```

**Result**

```json
{
  "accounts": {
    "items": [
      { "address": "0x1234567890123456789012345678901234567890", "balance": "1000000000000000000" },
      { "address": "0x1234567890123456789012345678901234567891", "balance": "900000000000000000" },
    ],
    "totalCount": 1726,
  }
}
```

> **Tip:** You can also query Ponder tables directly in Postgres, or write custom API endpoints. [Read more](./query/direct-sql.md).

### Customize the schema

Let's add a new column to a table in `ponder.schema.ts`. We want to track which accounts are an owner of the token contract.

**ponder.schema.ts**

```ts
import { index, onchainTable, primaryKey, relations } from "bponder";

export const account = onchainTable("account", (t) => ({
  address: t.hex().primaryKey(),
  balance: t.bigint().notNull(),
  isOwner: t.boolean().notNull(),
}));

// ...
```

Immediately, there's a type error in `src/index.ts` and a runtime error in the terminal. We added a required column, but our indexing logic doesn't include it.

**Terminal**

```ansi
12:16:16 PM ERROR indexing   Error while processing 'ERC20:Transfer' event
NotNullConstraintError: Column 'account.isOwner' violates not-null constraint.
    at /workspace/new-project/src/index.ts:10:3
   8 |
   9 | ponder.on("ERC20:Transfer", async ({ event, context }) => {
> 10 |   await context.db
     |   ^
  11 |     .insert(account)
  12 |     .values({ address: event.args.from, balance: 0n })
  13 |     .onConflictDoUpdate((row) => ({
```

### Update indexing logic

Update the indexing logic to include `isOwner` when inserting new rows into the `account` table.

**src/index.ts**

```ts
import { ponder } from "bponder:registry";
import { account } from "bponder:schema";

const OWNER_ADDRESS = "0x3bf93770f2d4a794c3d9ebefbaebae2a8f09a5e5";

ponder.on("ERC20:Transfer", async ({ event, context }) => {
  await context.db
    .insert(account)
    .values({
      address: event.args.from,
      balance: 0n,
      isOwner: event.args.from === OWNER_ADDRESS,
    })
    .onConflictDoUpdate((row) => ({
    // ...
})
```

As soon as we save the file, the dev server hot reloads and finishes indexing successfully.

**Logs**

```ansi
12:19:31.629 INFO  Hot reload "src/index.ts"
12:19:31.889 WARN  Dropped existing database tables count=4 tables=["account","transfer_event","allowance","approval_event"] (3ms)
12:19:31.901 INFO  Created database tables count=4 tables=["account","transfer_event","allowance","approval_event"] (12ms)
12:19:32.168 INFO  Started backfill indexing chain=mainnet block_range=[13142655,13150000]
12:19:32.169 INFO  Started fetching backfill JSON-RPC data chain=mainnet cached_block=13147325 cache_rate=63.6%
12:19:32.447 INFO  Indexed block range chain=mainnet event_count=6004 block_range=[13142655,13146396] (199ms)
12:19:32.551 INFO  Indexed block range chain=mainnet event_count=3607 block_range=[13146397,13147325] (104ms)
```

**Terminal UI**

```ansi
Chains

│ Chain   │ Status   │ Block    │ RPC (req/s) │
├─────────┼──────────┼──────────┼─────────────┤
│ mainnet │ backfill │ 13146425 │        25.2 │

Indexing (backfill)

│ Event          │ Count │ Duration (ms) │
├────────────────┼───────┼───────────────┤
│ ERC20:Transfer │  5155 │         0.014 │
│ ERC20:Approval │   938 │         0.010 │

████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░ 51.5% (1m 07s eta)

API endpoints
Live at http://localhost:42069
```

## Next steps

This quickstart only scratches the surface of what Ponder can do. Take a look at the [examples directory](https://github.com/ponder-sh/ponder/tree/main/examples) for more complex projects, or the [GitHub dependents](https://github.com/ponder-sh/ponder/network/dependents?package_id=UGFja2FnZS0xMzA2OTEyMw%3D%3D) for a list of real-world repositories using Ponder.

Or, continue reading the guides and API reference here on the documentation site.

- [Contract configuration](./config/contracts.md)
- [Query the database directly](./query/direct-sql.md)
- [Schema design](./schema/tables.md)
