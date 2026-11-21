import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { createLogger } from "@/internal/logger.js";
import { MetricsService } from "@/internal/metrics.js";
import { buildOptions } from "@/internal/options.js";
import { createShutdown } from "@/internal/shutdown.js";
import {
  type BunSqlClient,
  bunSqlDatabaseDriverEnvName,
  createBunSqlClient,
  isBunSqlDatabaseDriver,
  resolveBunSqlConnectionUrl,
} from "./bunSqlDriver.js";
import { createDatabase } from "./index.js";

test("isBunSqlDatabaseDriver defaults on under Bun and honors env", () => {
  expect(isBunSqlDatabaseDriver({ env: {}, versions: { bun: "1.4.5" } })).toBe(
    true,
  );
  expect(isBunSqlDatabaseDriver({ env: {}, versions: {} })).toBe(false);
  expect(
    isBunSqlDatabaseDriver({
      env: { [bunSqlDatabaseDriverEnvName]: "bun" },
      versions: {},
    }),
  ).toBe(true);
  expect(
    isBunSqlDatabaseDriver({
      env: { [bunSqlDatabaseDriverEnvName]: "bun-sql" },
      versions: {},
    }),
  ).toBe(true);
  expect(
    isBunSqlDatabaseDriver({
      env: { [bunSqlDatabaseDriverEnvName]: "pg" },
      versions: { bun: "1.4.5" },
    }),
  ).toBe(false);
});

test("resolveBunSqlConnectionUrl requires connectionString", () => {
  expect(
    resolveBunSqlConnectionUrl({
      connectionString: "postgres://localhost/ponder",
    }),
  ).toBe("postgres://localhost/ponder");
  expect(() => resolveBunSqlConnectionUrl({})).toThrow(/connectionString/);
});

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

if (skip) {
  test.skip("createDatabase Bun.SQL driver requires DATABASE_URL", () => {});
} else {
  describe("createDatabase with PONDER_DATABASE_DRIVER=bun", () => {
    const schema = `ponder_bun_drv_${crypto.randomUUID().replaceAll("-", "")}`;
    const previousDriver = process.env[bunSqlDatabaseDriverEnvName];
    let database: ReturnType<typeof createDatabase>;
    let shutdown: ReturnType<typeof createShutdown>;
    let cleanupClient: BunSqlClient;

    beforeAll(() => {
      process.env[bunSqlDatabaseDriverEnvName] = "bun";
      shutdown = createShutdown();
      const common = {
        options: buildOptions({
          cliOptions: {
            command: "start",
            config: "",
            root: "",
            logLevel: "silent",
            logFormat: "pretty",
            version: "0.0.0",
          },
        }),
        logger: createLogger({ level: "silent" }),
        metrics: new MetricsService(),
        shutdown,
        apiShutdown: shutdown,
        buildShutdown: shutdown,
      };

      database = createDatabase({
        common,
        namespace: { schema, viewsSchema: undefined },
        preBuild: {
          databaseConfig: {
            kind: "postgres",
            poolConfig: { connectionString: url, max: 8 },
          },
          ordering: "omnichain",
        },
        schemaBuild: {
          schema: {},
          statements: {
            tables: { sql: [], json: [] },
            enums: { sql: [], json: [] },
            indexes: { sql: [], json: [] },
          },
        } as any,
      });

      cleanupClient = createBunSqlClient({ url });
    });

    afterAll(async () => {
      try {
        await cleanupClient.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } catch {
        // Schema may not exist if migrateSync never created it.
      }
      try {
        await cleanupClient.close();
      } catch {
        // ignore
      }
      try {
        await shutdown.kill();
      } catch {
        // Unlock during shutdown can race with an already-closed Bun.SQL client.
      }

      if (previousDriver === undefined) {
        delete process.env[bunSqlDatabaseDriverEnvName];
      } else {
        process.env[bunSqlDatabaseDriverEnvName] = previousDriver;
      }
    });

    test("uses Bun.SQL engine and can execute a wrapped query", async () => {
      expect(database.driver.dialect).toBe("postgres");
      expect(
        database.driver.dialect === "postgres" && database.driver.engine,
      ).toBe("bun");

      await database.migrateSync();

      const rows = await database.adminQB.wrap((db) =>
        db.execute(sql`select 1::int as value`),
      );
      expect(rows).toBeDefined();
    });
  });
}
