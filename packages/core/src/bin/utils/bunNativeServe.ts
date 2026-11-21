import {
  type BunSqlDatabase,
  createBunSqlDatabase,
} from "@/database/bunSql.js";
import {
  type BunServer,
  startBunServer,
  stopBunServer,
} from "@/server/bunServe.js";
import { createBunV1ApiFetch } from "@/server/bunV1Api.js";

const TRUTHY_ENV = new Set(["1", "true", "yes"]);

export const bunNativeServeEnvName = "PONDER_BUN_NATIVE";

export function isBunNativeServeEnabled({
  native,
  env = process.env,
}: {
  native?: boolean;
  env?: NodeJS.Dict<string>;
} = {}): boolean {
  if (native === true) return true;

  const value = env[bunNativeServeEnvName];
  if (typeof value !== "string") return false;

  return TRUTHY_ENV.has(value.trim().toLowerCase());
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
}: {
  url: string;
  port: number;
  hostname?: string;
}): Promise<BunNativeServe> {
  const database = createBunSqlDatabase({ url });

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
