/**
 * Normalize drizzle `execute()` / prepared-query results across drivers.
 *
 * - `drizzle-orm/bun-sql` returns a row array (`client.unsafe(...)`)
 * - `drizzle-orm/node-postgres` and PGlite return `{ rows: [...] }`
 *
 * Call sites that assume `result.rows` (pg shape) crash under Bun.SQL with
 * `TypeError: undefined is not an object (evaluating 'result.rows[0]')`.
 */
export const normalizeExecuteRows = <
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  result: unknown,
): T[] => {
  if (Array.isArray(result)) {
    return result as T[];
  }
  if (
    result !== null &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
};
