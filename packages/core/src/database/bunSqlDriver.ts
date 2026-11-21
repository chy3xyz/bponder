import type { SQL } from "bun";
import {
  DEFAULT_BUN_SQL_SCHEMA,
  isBunSqlSchemaIdentifier,
  normalizeBunSqlSchema,
} from "./bunSql.js";

export const bunSqlDatabaseDriverEnvName = "PONDER_DATABASE_DRIVER";

const BUN_DRIVER_VALUES = new Set(["bun", "bun-sql"]);
const PG_DRIVER_VALUES = new Set(["pg", "node-postgres", "postgres"]);

/** Bun.SQL client; matches `drizzle-orm/bun-sql` and `import("bun").SQL`. */
export type BunSqlClient = SQL;

type BunSqlConstructor = new (options: {
  url: string;
  max?: number;
  connectionTimeout: number;
  connection?: Record<string, string | number | boolean>;
}) => BunSqlClient;

type BunRuntime = {
  SQL: BunSqlConstructor;
};

/**
 * Bun.SQL driver for createDatabase.
 * - `PONDER_DATABASE_DRIVER=bun` / `bun-sql` forces Bun.SQL
 * - `PONDER_DATABASE_DRIVER=pg` forces node-postgres
 * - Under Bun with the env unset, defaults to Bun.SQL
 * - Under Node, defaults to pg
 */
export function isBunSqlDatabaseDriver({
  env = process.env,
  versions = process.versions,
}: {
  env?: NodeJS.Dict<string>;
  versions?: { bun?: string };
} = {}): boolean {
  const value = env[bunSqlDatabaseDriverEnvName];
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (PG_DRIVER_VALUES.has(normalized)) return false;
    if (BUN_DRIVER_VALUES.has(normalized)) return true;
  }
  return versions.bun !== undefined;
}

export function resolveBunSqlConnectionUrl(poolConfig: {
  connectionString?: string | null;
}): string {
  const url = poolConfig.connectionString?.trim();
  if (typeof url === "string" && url.length > 0) {
    return url;
  }

  throw new Error(
    `Invalid database configuration: '${bunSqlDatabaseDriverEnvName}=bun' requires poolConfig.connectionString (or DATABASE_URL).`,
  );
}

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;

export function createBunSqlClient({
  url,
  schema,
  max,
  applicationName,
  readonly = false,
}: {
  url: string;
  schema?: string;
  max?: number;
  applicationName?: string;
  readonly?: boolean;
}): BunSqlClient {
  const resolvedSchema = normalizeBunSqlSchema(schema);
  if (isBunSqlSchemaIdentifier(resolvedSchema) === false) {
    throw new Error(`Invalid database schema identifier: ${resolvedSchema}`);
  }

  const { SQL } = (globalThis as typeof globalThis & { Bun: BunRuntime }).Bun;

  const connection: Record<string, string | number | boolean> = {};
  if (resolvedSchema !== DEFAULT_BUN_SQL_SCHEMA) {
    connection.search_path = resolvedSchema;
  }
  if (typeof applicationName === "string" && applicationName.length > 0) {
    connection.application_name = applicationName;
  }
  if (readonly) {
    connection.default_transaction_read_only = "on";
  }

  return new SQL({
    url,
    connectionTimeout: 5,
    ...(typeof max === "number" ? { max } : {}),
    ...(Object.keys(connection).length > 0 ? { connection } : {}),
  });
}

export async function ensureBunSqlSchema({
  client,
  schema,
}: {
  client: BunSqlClient;
  schema: string;
}): Promise<void> {
  const resolvedSchema = normalizeBunSqlSchema(schema);
  if (resolvedSchema === DEFAULT_BUN_SQL_SCHEMA) return;
  if (isBunSqlSchemaIdentifier(resolvedSchema) === false) {
    throw new Error(`Invalid database schema identifier: ${resolvedSchema}`);
  }

  await client.unsafe(
    `CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(resolvedSchema)}`,
  );
}

export async function closeBunSqlClient(client: BunSqlClient): Promise<void> {
  await client.close();
}
