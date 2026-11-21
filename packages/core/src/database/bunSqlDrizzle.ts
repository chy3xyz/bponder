/**
 * Isolated entry for `drizzle-orm/bun-sql` so Node/vitest never evaluate the
 * `bun` import unless `PONDER_DATABASE_DRIVER=bun` selects this path.
 *
 * Runtime shape matches shared Drizzle/QB usage; types are asserted at this
 * boundary because BunSQLDatabase is not in the NodePg | Pglite union.
 */
import { drizzle as drizzleBunSqlImpl } from "drizzle-orm/bun-sql";
import type { Schema } from "@/internal/types.js";
import type { Drizzle } from "@/types/db.js";
import type { BunSqlClient } from "./bunSqlDriver.js";

export function drizzleBunSql<TSchema extends Schema = Schema>(
  client: BunSqlClient,
  config?: object,
): Drizzle<TSchema> & { $client: BunSqlClient } {
  // biome-ignore lint: Bun.SQL / BunSQLDatabase are outside the shared Drizzle union
  return (drizzleBunSqlImpl as any)(client, config);
}
