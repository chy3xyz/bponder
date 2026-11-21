import {
  type BunSqlDatabase,
  createBunSqlDatabase,
  isBunSqlSchemaIdentifier,
  normalizeBunSqlSchema,
} from "@/database/bunSql.js";
import {
  type BunServer,
  startBunServer,
  stopBunServer,
} from "@/server/bunServe.js";
import { createBunV1ApiFetch } from "@/server/bunV1Api.js";

const TRUTHY_ENV = new Set(["1", "true", "yes"]);

export const bunNativeServeEnvName = "PONDER_BUN_NATIVE";
export const bunUseViteEnvName = "PONDER_USE_VITE";

function isTruthyEnvValue(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  return TRUTHY_ENV.has(value.trim().toLowerCase());
}

/**
 * Bun-native indexing for `ponder start` / `ponder dev`.
 * On when `process.versions.bun` is set, unless `PONDER_USE_VITE=1`.
 * `--native` / `PONDER_BUN_NATIVE=1` still enable explicitly.
 */
export function isBunNativeEnabled({
  native,
  env = process.env,
  versions = process.versions,
}: {
  native?: boolean;
  env?: NodeJS.Dict<string>;
  versions?: { bun?: string };
} = {}): boolean {
  if (native === true) return true;
  if (isTruthyEnvValue(env[bunUseViteEnvName])) return false;
  if (isTruthyEnvValue(env[bunNativeServeEnvName])) return true;
  return versions.bun !== undefined;
}

/** Opt-in Bun-native `/v1` for `ponder serve` (no indexing). Never default-on. */
export function isBunNativeServeEnabled({
  native,
  env = process.env,
}: {
  native?: boolean;
  env?: NodeJS.Dict<string>;
} = {}): boolean {
  if (native === true) return true;
  return isTruthyEnvValue(env[bunNativeServeEnvName]);
}

/** Returns an invalid identifier if `--schema` / DATABASE_SCHEMA cannot be used as a schema name. */
export function getUnsupportedBunNativeSchema({
  schema,
  env = process.env,
}: {
  schema?: string;
  env?: NodeJS.Dict<string>;
} = {}): string | undefined {
  const requested = schema ?? env.DATABASE_SCHEMA;
  if (typeof requested !== "string") return undefined;

  const trimmed = requested.trim();
  if (trimmed.length === 0 || isBunSqlSchemaIdentifier(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export function formatBunNativeOrigin({
  hostname,
  port,
}: {
  hostname?: string;
  port: number;
}): string {
  const host =
    hostname === undefined ||
    hostname === "0.0.0.0" ||
    hostname === "::" ||
    hostname === "[::]"
      ? "127.0.0.1"
      : hostname;
  const wrapped =
    host.includes(":") && host.startsWith("[") === false ? `[${host}]` : host;

  return `http://${wrapped}:${port}`;
}

export type BunNativeServe = {
  database: BunSqlDatabase;
  server: BunServer;
  origin: string;
  stop: () => Promise<void>;
};

export async function startBunNativeServe({
  url,
  port,
  hostname,
  schema,
}: {
  url: string;
  port: number;
  hostname?: string;
  schema?: string;
}): Promise<BunNativeServe> {
  const database = createBunSqlDatabase({
    url,
    schema: normalizeBunSqlSchema(schema),
  });

  try {
    await database.migrate();

    const server = startBunServer({
      fetch: createBunV1ApiFetch({ database }),
      hostname,
      port,
    });
    const origin = formatBunNativeOrigin({
      hostname,
      port: server.port,
    });

    return {
      database,
      server,
      origin,
      stop: async () => {
        await stopBunServer(server);
        await database.close();
      },
    };
  } catch (error) {
    await database.close();
    throw error;
  }
}
