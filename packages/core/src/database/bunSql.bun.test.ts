import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type BunSqlDatabase,
  createBunSqlDatabase,
  getBunSqlState,
} from "./bunSql.js";

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

type SqlWithUnsafe = BunSqlDatabase["admin"] & {
  unsafe(query: string): Promise<unknown>;
};

if (skip) {
  test.skip("createBunSqlDatabase requires a non-empty DATABASE_URL", () => {});
} else {
  describe("createBunSqlDatabase", () => {
    const schema = `ponder_bun_${crypto.randomUUID().replaceAll("-", "")}`;
    let database: BunSqlDatabase;

    beforeAll(async () => {
      database = createBunSqlDatabase({ url });
      const admin = database.admin as SqlWithUnsafe;
      const user = database.user as SqlWithUnsafe;
      await admin.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await admin.unsafe(`SET search_path TO ${schema}`);
      await user.unsafe(`SET search_path TO ${schema}`);
    });

    afterAll(async () => {
      const admin = database.admin as SqlWithUnsafe;
      await admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await database.close();
    });

    test("opens separate admin and user pools and migrates metadata", async () => {
      expect(database.admin).not.toBe(database.user);

      await database.migrate();
      await database.user`
        INSERT INTO ponder_bun_meta (key, value)
        VALUES (${"test"}, ${"ready"})
      `;

      const rows = await database.user`
        SELECT value FROM ponder_bun_meta WHERE key = ${"test"}
      `;

      expect(rows).toEqual([{ value: "ready" }]);
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
