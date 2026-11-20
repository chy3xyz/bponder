import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createBunSqlDatabase, getBunSqlState } from "./bunSql.js";

const url =
  process.env.DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/postgres";

describe("createBunSqlDatabase", () => {
  const database = createBunSqlDatabase({ url });

  beforeAll(async () => {
    await database.admin`DROP TABLE IF EXISTS ponder_bun_meta`;
  });

  afterAll(async () => {
    await database.admin`DROP TABLE IF EXISTS ponder_bun_meta`;
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
