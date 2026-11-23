import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { boolean, integer, onchainTable, text } from "bponder-schema";
import { type BunSqlDatabase, createBunSqlDatabase } from "./bunSql.js";
import { migrateUser } from "./migrateUser.js";

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

type SqlWithUnsafe = BunSqlDatabase["admin"] & {
  unsafe(query: string): Promise<unknown>;
};

if (skip) {
  test.skip("migrateUser requires a non-empty DATABASE_URL", () => {});
} else {
  describe("migrateUser", () => {
    const schema = `ponder_user_${crypto.randomUUID().replaceAll("-", "")}`;
    const account = onchainTable("account", {
      id: text(),
      balance: integer(),
      active: boolean(),
    });
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

    test("applies DDL and supports an insert/select round trip", async () => {
      await migrateUser(database, account);
      await database.user`
        INSERT INTO account (id, balance, active)
        VALUES (${"alice"}, ${42}, ${true})
      `;

      const rows = await database.user`
        SELECT id, balance, active FROM account WHERE id = ${"alice"}
      `;

      expect(rows).toEqual([{ id: "alice", balance: 42, active: true }]);
    });
  });
}
