/**
 * Isolated entry for `drizzle-orm/bun-sql` so Node/vitest never evaluate the
 * `bun` import unless `PONDER_DATABASE_DRIVER=bun` selects this path.
 *
 * Cast at the boundary: drizzle returns BunSQLDatabase, which is not assignable
 * to the shared `Drizzle` alias used by createQB, but the runtime shape matches.
 */
import { drizzle as drizzleBunSqlImpl } from "drizzle-orm/bun-sql";
import type { DrizzleConfig } from "drizzle-orm";
import type { Schema } from "@/internal/types.js";
import type { Drizzle } from "@/types/db.js";
import type { BunSqlClient } from "./bunSqlDriver.js";

export function drizzleBunSql<
  TSchema extends Schema = { [name: string]: never },
>(
  client: BunSqlClient,
  config?: DrizzleConfig<TSchema>,
): Drizzle<TSchema> & { $client: BunSqlClient } {
  // Overloads require config to be present or omitted, not `undefined`.
  const db =
    config === undefined
      ? drizzleBunSqlImpl(client)
      : drizzleBunSqlImpl(client, config);
  return db as unknown as Drizzle<TSchema> & { $client: BunSqlClient };
}
