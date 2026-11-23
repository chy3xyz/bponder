import { describe, expect, test } from "bun:test";
import { integer, onchainTable, text } from "bponder-schema";
import {
  type BunSqlDatabase,
  createBunSqlDatabase,
} from "../database/bunSql.js";
import { migrateUser } from "../database/migrateUser.js";
import { syncBunOrderingEvents } from "./bunOrderingSlice.js";

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

const fixture = [
  {
    name: "Token:Transfer",
    id: "1-30-0",
    chainId: 1,
    blockNumber: 30,
    blockTimestamp: 300,
    args: { from: "bob", to: "carol", value: 7 },
  },
  {
    name: "Token:Transfer",
    id: "2-10-0",
    chainId: 2,
    blockNumber: 10,
    blockTimestamp: 100,
    args: { from: "dave", to: "erin", value: 4 },
  },
  {
    name: "Token:Transfer",
    id: "1-20-0",
    chainId: 1,
    blockNumber: 20,
    blockTimestamp: 200,
    args: { from: "alice", to: "bob", value: 10 },
  },
  {
    name: "Token:Transfer",
    id: "2-25-0",
    chainId: 2,
    blockNumber: 25,
    blockTimestamp: 250,
    args: { from: "erin", to: "frank", value: 2 },
  },
];

if (skip) {
  test.skip("Bun ordering slice requires a non-empty DATABASE_URL", () => {});
} else {
  const createHarness = async () => {
    const schema = `ponder_ordering_${crypto.randomUUID().replaceAll("-", "")}`;
    const transfer = onchainTable("transfer", {
      id: text(),
      chainId: integer(),
      seq: integer(),
      sender: text(),
      recipient: text(),
      amount: integer(),
      blockNumber: integer(),
      blockTimestamp: integer(),
    });

    let database = createBunSqlDatabase({ url });
    await database.admin.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
    await database.close();

    const schemaUrl = new URL(url);
    schemaUrl.searchParams.set("options", `-csearch_path=${schema}`);
    database = createBunSqlDatabase({ url: schemaUrl.toString() });
    await database.migrate();
    await migrateUser(database, transfer);

    return { schema, transfer, database };
  };

  const destroyHarness = async ({
    schema,
    database,
  }: {
    schema: string;
    database: BunSqlDatabase;
  }) => {
    await database.admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await database.close();
  };

  const loadRows = (database: BunSqlDatabase) =>
    database.user`
      SELECT id, "chainId", seq, sender, recipient, amount, "blockNumber", "blockTimestamp"
      FROM transfer
      ORDER BY seq
    `;

  describe("Bun ordering slice", () => {
    test("same two-chain fixture diverges between multichain and omnichain order", async () => {
      const multi = await createHarness();
      const omni = await createHarness();

      try {
        const multiCheckpoint = await syncBunOrderingEvents({
          database: multi.database,
          table: multi.transfer,
          events: fixture,
          mode: "multichain",
        });
        const omniCheckpoint = await syncBunOrderingEvents({
          database: omni.database,
          table: omni.transfer,
          events: fixture,
          mode: "omnichain",
        });

        const multiRows = await loadRows(multi.database);
        const omniRows = await loadRows(omni.database);

        expect(multiRows.map((row) => row.id)).toEqual([
          "1-20-0",
          "1-30-0",
          "2-10-0",
          "2-25-0",
        ]);
        expect(omniRows.map((row) => row.id)).toEqual([
          "2-10-0",
          "1-20-0",
          "2-25-0",
          "1-30-0",
        ]);
        expect(multiRows.map((row) => row.id)).not.toEqual(
          omniRows.map((row) => row.id),
        );

        expect(multiRows).toEqual([
          {
            id: "1-20-0",
            chainId: 1,
            seq: 1,
            sender: "alice",
            recipient: "bob",
            amount: 10,
            blockNumber: 20,
            blockTimestamp: 200,
          },
          {
            id: "1-30-0",
            chainId: 1,
            seq: 2,
            sender: "bob",
            recipient: "carol",
            amount: 7,
            blockNumber: 30,
            blockTimestamp: 300,
          },
          {
            id: "2-10-0",
            chainId: 2,
            seq: 3,
            sender: "dave",
            recipient: "erin",
            amount: 4,
            blockNumber: 10,
            blockTimestamp: 100,
          },
          {
            id: "2-25-0",
            chainId: 2,
            seq: 4,
            sender: "erin",
            recipient: "frank",
            amount: 2,
            blockNumber: 25,
            blockTimestamp: 250,
          },
        ]);
        expect(omniRows).toEqual([
          {
            id: "2-10-0",
            chainId: 2,
            seq: 1,
            sender: "dave",
            recipient: "erin",
            amount: 4,
            blockNumber: 10,
            blockTimestamp: 100,
          },
          {
            id: "1-20-0",
            chainId: 1,
            seq: 2,
            sender: "alice",
            recipient: "bob",
            amount: 10,
            blockNumber: 20,
            blockTimestamp: 200,
          },
          {
            id: "2-25-0",
            chainId: 2,
            seq: 3,
            sender: "erin",
            recipient: "frank",
            amount: 2,
            blockNumber: 25,
            blockTimestamp: 250,
          },
          {
            id: "1-30-0",
            chainId: 1,
            seq: 4,
            sender: "bob",
            recipient: "carol",
            amount: 7,
            blockNumber: 30,
            blockTimestamp: 300,
          },
        ]);

        expect(multiCheckpoint).toEqual({
          mode: "multichain",
          chains: {
            1: { blockNumber: 30, blockTimestamp: 300, id: "1-30-0" },
            2: { blockNumber: 25, blockTimestamp: 250, id: "2-25-0" },
          },
        });
        expect(omniCheckpoint).toEqual({
          mode: "omnichain",
          checkpoint: {
            chainId: 1,
            blockNumber: 30,
            blockTimestamp: 300,
            id: "1-30-0",
          },
        });

        const multiMeta = await multi.database.admin`
          SELECT value FROM ponder_bun_meta WHERE key = ${"ordering_checkpoint"}
        `;
        const omniMeta = await omni.database.admin`
          SELECT value FROM ponder_bun_meta WHERE key = ${"ordering_checkpoint"}
        `;
        expect(multiMeta[0]?.value).toBe(JSON.stringify(multiCheckpoint));
        expect(omniMeta[0]?.value).toBe(JSON.stringify(omniCheckpoint));
      } finally {
        await destroyHarness(multi);
        await destroyHarness(omni);
      }
    });
  });
}
