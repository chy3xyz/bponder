/**
 * Isolated entry for `drizzle-orm/bun-sql` so Node/vitest never evaluate the
 * `bun` import unless `PONDER_DATABASE_DRIVER=bun` selects this path.
 */
export { drizzle as drizzleBunSql } from "drizzle-orm/bun-sql";
