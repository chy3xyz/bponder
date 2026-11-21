import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type BunSqlDatabase,
  createBunSqlDatabase,
  getBunSqlState,
  isBunSqlSchemaIdentifier,
} from "./bunSql.js";

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

type SqlWithUnsafe = BunSqlDatabase["admin"] & {
  unsafe(query: string): Promise<unknown>;
};

test("isBunSqlSchemaIdentifier accepts public and custom names", () => {
  expect(isBunSqlSchemaIdentifier("public")).toBe(true);
  expect(isBunSqlSchemaIdentifier("ponder")).toBe(true);
  expect(isBunSqlSchemaIdentifier("ponder_bun_abc")).toBe(true);
});

test("isBunSqlSchemaIdentifier rejects unsafe names", () => {
  expect(isBunSqlSchemaIdentifier("")).toBe(false);
  expect(isBunSqlSchemaIdentifier("ponder-app")).toBe(false);
  expect(isBunSqlSchemaIdentifier("foo;drop")).toBe(false);
  expect(isBunSqlSchemaIdentifier("pg schema")).toBe(false);
  expect(isBunSqlSchemaIdentifier("1abc")).toBe(false);
});

if (skip) {
  test.skip("createBunSqlDatabase requires a non-empty DATABASE_URL", () => {});
} else {
  describe("createBunSqlDatabase", () => {
    const schema = `ponder_bun_${crypto.randomUUID().replaceAll("-", "")}`;
    let database: BunSqlDatabase;

    beforeAll(() => {
      database = createBunSqlDatabase({ url, schema });
    });

    afterAll(async () => {
      const admin = database.admin as SqlWithUnsafe;
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await database.close();
    });

    test("opens separate admin and user pools and migrates metadata", async () => {
      expect(database.admin).not.toBe(database.user);
      expect(database.schema).toBe(schema);

      await database.migrate();
      await database.user`
        INSERT INTO ponder_bun_meta (key, value)
        VALUES (${"test"}, ${"ready"})
      `;

      const rows = await database.user`
        SELECT value FROM ponder_bun_meta WHERE key = ${"test"}
      `;

      expect(rows).toEqual([{ value: "ready" }]);

      const placed = await database.admin`
        SELECT table_schema
        FROM information_schema.tables
        WHERE table_name = ${"ponder_bun_meta"}
          AND table_schema = ${schema}
      `;
      expect(placed).toEqual([{ table_schema: schema }]);
    });

    test("reads PostgreSQL SQLSTATE from errno", async () => {
      try {
        await database.user`SELECT * FROM ponder_bun_missing_table`;
        throw new Error("Expected query to fail");
      } catch (error) {
        expect(getBunSqlState(error)).toBe("42P01");
      }
    });
  });
}
