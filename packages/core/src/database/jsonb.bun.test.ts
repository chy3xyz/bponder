import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { asJsonb, jsonbSetOnValue } from "./jsonb.js";

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

test("asJsonb and jsonbSetOnValue are SQL fragments", () => {
  expect(asJsonb({ a: 1 }).queryChunks.length).toBeGreaterThan(0);
  expect(
    jsonbSetOnValue("{is_ready}", sql`to_jsonb(1)`).queryChunks.length,
  ).toBeGreaterThan(0);
});

if (skip) {
  test.skip("jsonb helpers require DATABASE_URL", () => {});
} else {
  describe("Bun.SQL jsonb object round-trip", () => {
    const table = pgTable("_ponder_jsonb_probe", {
      key: text().primaryKey(),
      value: jsonb().$type<Record<string, unknown>>().notNull(),
    });
    let client: Bun.SQL;
    let db: ReturnType<typeof drizzle>;

    beforeAll(async () => {
      client = new Bun.SQL({ url: url!, max: 1 });
      db = drizzle(client);
      await client.unsafe(`DROP TABLE IF EXISTS _ponder_jsonb_probe`);
      await client.unsafe(
        `CREATE TABLE _ponder_jsonb_probe (key text primary key, value jsonb not null)`,
      );
    });

    afterAll(async () => {
      await client.unsafe(`DROP TABLE IF EXISTS _ponder_jsonb_probe`);
      await client.close();
    });

    test("asJsonb stores an object; jsonbSetOnValue updates paths", async () => {
      await db.insert(table).values({
        key: "app",
        value: asJsonb({ version: "6", is_ready: 0, heartbeat_at: 1 }),
      });

      const typed = await client.unsafe(
        `SELECT jsonb_typeof(value) AS t FROM _ponder_jsonb_probe WHERE key = 'app'`,
      );
      expect(typed[0]?.t).toBe("object");

      await db
        .update(table)
        .set({
          value: jsonbSetOnValue("{heartbeat_at}", sql`to_jsonb(${99})`),
        })
        .where(eq(table.key, "app"));

      await db
        .update(table)
        .set({ value: jsonbSetOnValue("{is_ready}", sql`to_jsonb(1)`) })
        .where(eq(table.key, "app"));

      const rows = await client.unsafe(
        `SELECT value FROM _ponder_jsonb_probe WHERE key = 'app'`,
      );
      expect(rows[0]?.value).toMatchObject({
        version: "6",
        is_ready: 1,
        heartbeat_at: 99,
      });
    });
  });
}
