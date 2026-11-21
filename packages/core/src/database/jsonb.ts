import { type SQL, sql } from "drizzle-orm";

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
 * `jsonb_set` on `value` that tolerates string-scalar rows left by Bun.SQL.
 */
export const jsonbSetOnValue = (path: JsonbPath, rhs: SQL): SQL =>
  sql`jsonb_set(CASE WHEN jsonb_typeof(value) = 'string' THEN (value #>> '{}')::jsonb ELSE value END, ${sql.raw(`'${path}'`)}::text[], ${rhs})`;
