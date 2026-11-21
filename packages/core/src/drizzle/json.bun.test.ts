import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { pgTable, text } from "drizzle-orm/pg-core";
import { PgJsonb } from "./json.js";
import { jsonb } from "./onchain.js";

test("PgJsonb mapToDriverValue passes objects through under Bun", () => {
  const table = pgTable("probe", {
    metadata: jsonb().notNull(),
  });
  expect(table.metadata).toBeInstanceOf(PgJsonb);
  const mapped = table.metadata.mapToDriverValue({
    a: 1,
    nested: { b: true },
  });
  expect(mapped).toEqual({ a: 1, nested: { b: true } });
  expect(typeof mapped).toBe("object");
});

test("PgJsonb mapToDriverValue still rejects BigInt", () => {
  const table = pgTable("probe_bigint", {
    metadata: jsonb().notNull(),
  });
  expect(() => table.metadata.mapToDriverValue({ balance: 1n })).toThrow(
    /BigInt/,
  );
});

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

if (skip) {
  test.skip("onchain jsonb insert requires DATABASE_URL", () => {});
} else {
  describe("onchain jsonb insert under Bun.SQL", () => {
    const probe = pgTable("_ponder_json_col_probe", {
      id: text().primaryKey(),
      metadata: jsonb().$type<{ tags: string[]; count: number }>().notNull(),
    });
    let client: Bun.SQL;
    let db: ReturnType<typeof drizzle>;

    beforeAll(async () => {
      client = new Bun.SQL({ url: url!, max: 1 });
      db = drizzle(client);
      await client.unsafe(`DROP TABLE IF EXISTS _ponder_json_col_probe`);
      await client.unsafe(
        `CREATE TABLE _ponder_json_col_probe (
          id text primary key,
          metadata jsonb not null
        )`,
      );
    });

    afterAll(async () => {
      await client.unsafe(`DROP TABLE IF EXISTS _ponder_json_col_probe`);
      await client.close();
    });

    test("stores jsonb objects not string scalars", async () => {
      await db.insert(probe).values({
        id: "row-1",
        metadata: { tags: ["a", "b"], count: 2 },
      });

      const typed = await client.unsafe(
        `SELECT jsonb_typeof(metadata) AS t, metadata FROM _ponder_json_col_probe WHERE id = 'row-1'`,
      );
      expect(typed[0]?.t).toBe("object");
      expect(typed[0]?.metadata).toEqual({ tags: ["a", "b"], count: 2 });

      await db
        .update(probe)
        .set({ metadata: { tags: ["c"], count: 3 } })
        .where(eq(probe.id, "row-1"));

      const after = await client.unsafe(
        `SELECT jsonb_typeof(metadata) AS t, metadata FROM _ponder_json_col_probe WHERE id = 'row-1'`,
      );
      expect(after[0]?.t).toBe("object");
      expect(after[0]?.metadata).toEqual({ tags: ["c"], count: 3 });
    });
  });
}
