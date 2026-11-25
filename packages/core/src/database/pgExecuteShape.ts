/**
 * Userland `import { db } from "ponder"` (bponder:api) historically assumed
 * node-postgres `execute()` → `{ rows }`. Under Bun.SQL / drizzle-orm/bun-sql,
 * raw `execute()` returns a row array, so `result.rows` is undefined and APIs
 * silently return empty data.
 */
export const withPgExecuteShape = <T extends object>(db: T): T => {
  const rawExecute = (db as { execute?: (...args: unknown[]) => unknown })
    .execute;
  if (typeof rawExecute !== "function") return db;

  const execute = rawExecute.bind(db);

  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "execute") {
        return async (...args: unknown[]) => {
          const result = await execute(...args);
          if (Array.isArray(result)) {
            return { rows: result };
          }
          return result;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function"
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
};

/** Inline source for Vite / Bun virtual `bponder:api` modules (no import graph). */
export const API_DB_EXPORT_SOURCE = `export const db = (() => {
  const raw = globalThis.PONDER_DATABASE.readonlyQB.raw;
  const execute = raw.execute.bind(raw);
  return new Proxy(raw, {
    get(target, prop, receiver) {
      if (prop === "execute") {
        return async (...args) => {
          const result = await execute(...args);
          return Array.isArray(result) ? { rows: result } : result;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
})();
`;
