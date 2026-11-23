import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import superjson from "superjson";
import {
  context,
  setupCommon,
  setupDatabaseServices,
  setupIsolatedDatabase,
} from "@/_test/setup.js";
import { getLiveQueryChannelName, onchainTable } from "@/drizzle/onchain.js";
import { client } from "./index.js";

const databaseUrl = process.env.DATABASE_URL;
const skip = typeof databaseUrl !== "string" || databaseUrl.length === 0;

const previousDriver = process.env.PONDER_DATABASE_DRIVER;

afterEach(async () => {
  if (previousDriver === undefined) {
    delete process.env.PONDER_DATABASE_DRIVER;
  } else {
    process.env.PONDER_DATABASE_DRIVER = previousDriver;
  }
  try {
    await context.common?.apiShutdown?.kill?.();
  } catch {
    // already killed
  }
  try {
    await context.common?.shutdown?.kill?.();
  } catch {
    // already killed
  }
});

if (skip) {
  test.skip("client() Bun.SQL tests require DATABASE_URL", () => {});
} else {
  describe("client() under Bun.SQL", () => {
    test(
      "serves /sql/db with prepareQuery and accepts Bun.SQL NOTIFY",
      async () => {
        // Force production-default Bun.SQL even if the suite env set pg.
        delete process.env.PONDER_DATABASE_DRIVER;

        setupCommon();
        await setupIsolatedDatabase();

        const account = onchainTable("account_bun_client", (p) => ({
          address: p.hex().primaryKey(),
          balance: p.bigint(),
        }));

        const { database } = await setupDatabaseServices({
          schemaBuild: { schema: { account } },
        });

        expect(database.driver.engine).toBe("bun");

        globalThis.PONDER_COMMON = context.common;
        globalThis.PONDER_DATABASE = database;
        globalThis.PONDER_PRE_BUILD = {
          ordering: "multichain",
          databaseConfig: context.databaseConfig,
        };
        globalThis.PONDER_NAMESPACE_BUILD = {
          schema: "public",
          viewsSchema: undefined,
        };

        const app = new Hono().use(
          "/sql/*",
          client({
            db: database.readonlyQB.raw,
            schema: { account },
          }),
        );

        const query = { sql: "SELECT * FROM account_bun_client", params: [] };
        const params = new URLSearchParams({
          sql: superjson.stringify(query),
        });
        const response = await app.request(`/sql/db?${params}`);
        expect(response.status).toBe(200);
        const body = (await response.json()) as { rows: unknown[] };
        expect(Array.isArray(body.rows)).toBe(true);

        const channel = getLiveQueryChannelName("public");
        await database.driver.admin.notify(
          channel,
          JSON.stringify(["account_bun_client"]),
        );
        await Bun.sleep(50);
      },
      { timeout: 30_000 },
    );
  });
}
