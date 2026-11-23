# Tables

Define database tables and columns

Ponder's schema definition API is built on [Drizzle](https://orm.drizzle.team/), a modern TypeScript ORM. To define a table, use the `onchainTable` function and include column definitions.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const pets = onchainTable("pets", (t) => ({
  name: t.text().primaryKey(),
  age: t.integer().notNull(),
}));
```

Each table _must_ be a named export from the `ponder.schema.ts` file. The build step ignores tables that are not exported.

## Column types

The schema definition API supports most PostgreSQL data types – here's a quick reference for the most common options. Read the [Drizzle documentation](https://orm.drizzle.team/docs/column-types/pg) for a complete list.

| name             | description                        | TypeScript type          | SQL data type     |
| :--------------- | :--------------------------------- | :----------------------- | :---------------- |
| `text{:ts}`      | UTF‐8 character sequence           | `string`                 | `TEXT{:sql}`      |
| `integer{:ts}`   | Signed 4‐byte integer              | `number`                 | `INTEGER{:sql}`   |
| `real{:ts}`      | Signed 4-byte floating‐point value | `number`                 | `REAL{:sql}`      |
| `boolean{:ts}`   | `true` or `false`                  | `boolean`                | `BOOLEAN{:sql}`   |
| `timestamp{:ts}` | Date and time value (no time zone) | `Date`                   | `TIMESTAMP{:sql}` |
| `json{:ts}`      | JSON object                        | `any` or [custom](#json) | `JSON{:sql}`      |

Ponder also includes a few extra column types built specifically for EVM indexing.

| name          | description                                  | TypeScript type | SQL data type         |
| :------------ | :------------------------------------------- | :-------------- | :-------------------- |
| `bigint{:ts}` | Large integer (holds `uint256` and `int256`) | `bigint`        | `NUMERIC(78,0){:sql}` |
| `hex{:ts}`    | UTF‐8 character sequence with `0x` prefix    | `0x${string}`   | `TEXT{:sql}`          |

### `bigint`

Use the `bigint` column type to store EVM `uint256` or `int256` values.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const accounts = onchainTable("accounts", (t) => ({
  address: t.hex().primaryKey(),
  balance: t.bigint().notNull(),
}));
```

> **Note:**   Ponder's `bigint` type takes precedence over the Drizzle
>   [`bigint`](https://orm.drizzle.team/docs/column-types/pg#bigint) type, which
>   is an 8-byte integer (too small for EVM integer values). To
>   create an 8-byte integer column, use the `int8` alias.

### `hex`

Use the `hex` column type to store EVM `address`, `bytes`, or any other hex-encoded value.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const accounts = onchainTable("accounts", (t) => ({
  address: t.hex().primaryKey(),
  balance: t.bigint().notNull(), 
}));
```

## Enums

To define an enum, use the `onchainEnum` function. Then, use the value returned by `onchainEnum` as a column type. Under the hood, `onchainEnum` creates a PostgreSQL [enumerated type](https://www.postgresql.org/docs/current/datatype-enum.html).

**ponder.schema.ts**

```ts
import { onchainEnum, onchainTable } from "bponder";

export const color = onchainEnum("color", ["ORANGE", "BLACK"]);

export const cats = onchainTable("cats", (t) => ({
  name: t.text().primaryKey(),
  color: color("color"),
}));
```

## Arrays

To define an array column, use the `.array(){:ts}` modifier. Arrays are a good fit for small one-dimensional collections. Don't use arrays for [relationships](./relations.md) between records.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const cats = onchainTable("cats", (t) => ({
  name: t.text().primaryKey(),
  vaccinations: t.text().array(), // ["rabies", "distemper", "parvo"]
}));
```

## Not null

To mark a column as not null, use the `.notNull(){:ts}` modifier. If you attempt to insert a row that does not include a value for a `NOT NULL{:sql}` column, the database will throw an error.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const cats = onchainTable("cats", (t) => ({
  name: t.text().primaryKey(),
  age: t.integer().notNull(),
}));
```

## Default value

To set a default value for a column, use the `.default(){:ts}` modifier and pass a string, number, boolean, or `null`.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const cats = onchainTable("cats", (t) => ({
  name: t.text().primaryKey(),
  livesRemaining: t.integer().default(9),
}));
```

Alternatively, use the `.$default(){:ts}` modifier to specify a JavaScript function that returns the default value. With this approach, the database driver calls the function to generate a default value for each row dynamically.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";
import { generateId } from "../utils";

export const cats = onchainTable("cats", (t) => ({
  name: t.text().primaryKey(),
  age: t.integer().$default(() => generateId()),
}));
```

## Primary key

Every table **must** have a primary key. To define a primary key on a single column, use the `.primaryKey(){:ts}` modifier.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const tokens = onchainTable("tokens", (t) => ({
  id: t.bigint().primaryKey(),
}));
```

### Composite primary key

To create a composite primary key, use the `primaryKey()` function exported by `ponder`. Each column that forms the primary key must be not null. [Read more](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-PRIMARY-KEYS) about composite primary keys.

**ponder.schema.ts**

```ts
import { onchainTable, primaryKey } from "bponder";

export const poolStates = onchainTable(
  "pool_states",
  (t) => ({
    poolId: t.bigint().notNull(),
    address: t.hex().notNull(),
    balance: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.poolId, table.address] }),
  })
);
```

## Indexes

To create a database index, use the `index(){:ts}` function. This example defines B-tree indexes on the `persons.name` column to support search queries, and on the `dogs.ownerId` column to support the `persons.dogs` relational query.

**ponder.schema.ts**

```ts
import { onchainTable, relations, index } from "bponder";

export const persons = onchainTable(
  "persons",
  (t) => ({
    id: t.text().primaryKey(),
    name: t.text(),
  }),
  (table) => ({
    nameIdx: index().on(table.name),
  })
);

export const personsRelations = relations(persons, ({ many }) => ({
  dogs: many(dogs),
}));

export const dogs = onchainTable(
  "dogs",
  (t) => ({
    id: t.text().primaryKey(),
    ownerId: t.text().notNull(),
  }),
  (table) => ({
    ownerIdx: index().on(table.ownerId),
  })
);

export const dogsRelations = relations(dogs, ({ one }) => ({
  owner: one(persons, { fields: [dogs.ownerId], references: [persons.id] }),
}));
```

The `index(){:ts}` function supports specifying multiple columns, ordering, and custom index types like GIN and GIST. Read more in the [Drizzle](https://orm.drizzle.team/docs/indexes-constraints#indexes) and [PostgreSQL](https://www.postgresql.org/docs/current/indexes.html) documentation.

> **Note:**   To improve performance, the indexing engine creates database indexes _after_ the backfill is complete, just before the app becomes healthy.

## Best practices

### Primary keys

Select a primary key that matches the access pattern of your indexing logic. If a table has two or more columns that together form a unique identifier for a row, use a composite primary key – don't use a concatenated string.

**ponder.schema.ts**

```ts
import { onchainTable, primaryKey } from "bponder";

// ❌ Don't concatenate strings to form a primary key
export const allowances = onchainTable("allowances", (t) => ({
  id: t.string().primaryKey(), // `${owner}_${spender}`
  owner: t.hex(),
  spender: t.hex(),
  amount: t.bigint(),
}));

// ✅ Use a composite primary key
export const allowances = onchainTable(
  "allowances",
  (t) => ({
    owner: t.hex(),
    spender: t.hex(),
    amount: t.bigint(),
  }),
  (table) => ({ pk: primaryKey({ columns: [table.owner, table.spender] }) })
);
```

### Timestamps

Use the `bigint` column type to store block timestamps using their EVM-native Unix timestamp representation. This maintains consistency with Viem's approach, and avoids error-prone timezone manipulation code.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const events = onchainTable("events", (t) => ({
  id: t.text().primaryKey(),
  timestamp: t.bigint(), // Unix timestamp in seconds
}));
```

If you strongly prefer working with JavaScript `Date` objects, you can also use the `timestamp` column type, but we recommend doing this conversion in the view layer.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const events = onchainTable("events", (t) => ({
  id: t.text().primaryKey(),
  timestamp: t.timestamp(), // JavaScript Date object
}));
```

### Custom types

Use the `.$type()` modifier to customize the TypeScript type for a column. Note that the `.$type()` modifier does not validate data at runtime or in the database, it only enforces a TypeScript type.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const tokens = onchainTable("tokens", (t) => ({
  id: t.bigint().primaryKey(),
  metadata: t.json().$type<{ name: string; symbol: string; decimals: number }>(),
}));
```

### `camelCase` vs `snake_case`

Use `camelCase` for TypeScript names and `snake_case` for SQL names. This guideline applies to all database objects and properties, including tables, columns, relations, and indexes.

**ponder.schema.ts**

```ts
import { onchainTable } from "bponder";

export const registrationEvents = onchainTable(
  "registration_events", // Use snake_case for the SQL table name
  (t) => ({
    createdAt: t.bigint(), // Drizzle automatically converts this to `created_at`
    invitedBy: t.text("invited_by"), // Avoid manual case conversion for columns
    // ...
  })
);
```

## Examples

### ERC20

Here's a schema for a simple ERC20 app.

**ponder.schema.ts**

```ts
import { index, onchainTable, primaryKey } from "bponder";

export const account = onchainTable("account", (t) => ({
  address: t.hex().primaryKey(),
  balance: t.bigint().notNull(),
  isOwner: t.boolean().notNull(),
}));

export const allowance = onchainTable(
  "allowance",
  (t) => ({
    owner: t.hex(),
    spender: t.hex(),
    amount: t.bigint().notNull(),
  }),
  (table) => ({
    pk: primaryKey({ columns: [table.owner, table.spender] }),
  })
);

export const transferEvent = onchainTable(
  "transfer_event",
  (t) => ({
    id: t.text().primaryKey(),
    amount: t.bigint().notNull(),
    timestamp: t.integer().notNull(),
    from: t.hex().notNull(),
    to: t.hex().notNull(),
  }),
  (table) => ({
    fromIdx: index().on(table.from),
  })
);

export const approvalEvent = onchainTable("approval_event", (t) => ({
  id: t.text().primaryKey(),
  amount: t.bigint().notNull(),
  timestamp: t.integer().notNull(),
  owner: t.hex().notNull(),
  spender: t.hex().notNull(),
}));
```
