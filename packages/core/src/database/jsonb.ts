import { type SQL, sql } from "drizzle-orm";
import { isBunSqlDatabaseDriver } from "./bunSqlDriver.js";

/**
 * Bind a JS value as a Postgres jsonb **object/array**.
 *
 * drizzle-orm's jsonb `mapToDriverValue` JSON.stringifies first; under Bun.SQL
 * that string is stored as a jsonb string scalar, so later `jsonb_set` fails
 * with `cannot set path in scalar`. Passing the object through `::jsonb`
 * lets Bun.SQL encode a real json document.
 */
export const asJsonb = <T>(value: T): SQL => sql`${value}::jsonb`;

type JsonbPath = "{is_ready}" | "{is_locked}" | "{heartbeat_at}";

/**
 * `jsonb_set` on `value`. Under Bun.SQL, tolerate string-scalar rows that were
 * written before the object pass-through fix.
 */
export const jsonbSetOnValue = (path: JsonbPath, rhs: SQL): SQL => {
  if (isBunSqlDatabaseDriver()) {
    return sql`jsonb_set(CASE WHEN jsonb_typeof(value) = 'string' THEN (value #>> '{}')::jsonb ELSE value END, ${sql.raw(`'${path}'`)}::text[], ${rhs})`;
  }
  return sql`jsonb_set(value, ${sql.raw(`'${path}'`)}::text[], ${rhs})`;
};
