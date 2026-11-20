import { describe, expect, test } from "bun:test";
import { integer, onchainTable, text } from "@ponder/schema";
import {
  type BunSqlDatabase,
  createBunSqlDatabase,
} from "../database/bunSql.js";
import { migrateUser } from "../database/migrateUser.js";
import { syncBunIsolatedEvents } from "./bunIsolatedWorkers.js";

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

const chain1Events = [
  {
    name: "Token:Transfer",
    id: "1-100-0",
    chainId: 1,
    blockNumber: 100,
    args: { from: "alice", to: "bob", value: 10 },
  },
  {
    name: "Token:Transfer",
    id: "1-101-0",
    chainId: 1,
    blockNumber: 101,
    args: { from: "bob", to: "carol", value: 7 },
  },
];

const chain2Events = [
  {
    name: "Token:Transfer",
    id: "2-200-0",
    chainId: 2,
    blockNumber: 200,
    args: { from: "dave", to: "erin", value: 4 },
  },
  {
    name: "Token:Transfer",
    id: "2-201-0",
    chainId: 2,
    blockNumber: 201,
    args: { from: "erin", to: "frank", value: 2 },
  },
];

if (skip) {
  test.skip("Bun isolated workers require a non-empty DATABASE_URL", () => {});
} else {
  const createHarness = async () => {
    const schema = `ponder_isolated_${crypto.randomUUID().replaceAll("-", "")}`;
    const transfer = onchainTable("transfer", {
      id: text(),
      chainId: integer(),
      sender: text(),
      recipient: text(),
      amount: integer(),
      blockNumber: integer(),
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

  describe("Bun isolated workers", () => {
    test("indexes ordered batches from two workers without a flush race", async () => {
      const harness = await createHarness();
      let concurrentFlushes = 0;
      let maxConcurrentFlushes = 0;

      try {
        const checkpoint = await syncBunIsolatedEvents({
          database: harness.database,
          table: harness.transfer,
          shards: [chain1Events, chain2Events],
          beforeFlush: async () => {
            concurrentFlushes++;
            maxConcurrentFlushes = Math.max(
              maxConcurrentFlushes,
              concurrentFlushes,
            );
            await Bun.sleep(25);
          },
          afterFlush: () => {
            concurrentFlushes--;
          },
        });

        const rows = await harness.database.user`
          SELECT id, "chainId", sender, recipient, amount, "blockNumber"
          FROM transfer
          ORDER BY "chainId", "blockNumber"
        `;
        expect(rows).toEqual([
          {
            id: "1-100-0",
            chainId: 1,
            sender: "alice",
            recipient: "bob",
            amount: 10,
            blockNumber: 100,
          },
          {
            id: "1-101-0",
            chainId: 1,
            sender: "bob",
            recipient: "carol",
            amount: 7,
            blockNumber: 101,
          },
          {
            id: "2-200-0",
            chainId: 2,
            sender: "dave",
            recipient: "erin",
            amount: 4,
            blockNumber: 200,
          },
          {
            id: "2-201-0",
            chainId: 2,
            sender: "erin",
            recipient: "frank",
            amount: 2,
            blockNumber: 201,
          },
        ]);

        expect(checkpoint).toEqual({
          chains: {
            1: { blockNumber: 101, id: "1-101-0" },
            2: { blockNumber: 201, id: "2-201-0" },
          },
        });

        const meta = await harness.database.admin`
          SELECT value FROM ponder_bun_meta WHERE key = ${"isolated_checkpoint"}
        `;
        expect(meta[0]?.value).toBe(JSON.stringify(checkpoint));
        expect(maxConcurrentFlushes).toBe(1);
      } finally {
        await destroyHarness(harness);
      }
    });
  });
}
