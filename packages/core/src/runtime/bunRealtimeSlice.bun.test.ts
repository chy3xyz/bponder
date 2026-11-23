import { describe, expect, test } from "bun:test";
import { integer, onchainTable, text } from "bponder-schema";
import { ponder } from "../app/ponder.js";
import {
  type BunSqlDatabase,
  createBunSqlDatabase,
} from "../database/bunSql.js";
import { migrateUser } from "../database/migrateUser.js";
import { startBunServer } from "../server/bunServe.js";
import { syncBunHistoricalEvents } from "./bunHistoricalSlice.js";
import {
  applyBunRealtimeEvents,
  createBunRealtimeStatusFetch,
  reorgBunRealtime,
} from "./bunRealtimeSlice.js";

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

const historicalEvents = [
  {
    name: "Token:Transfer",
    id: "100-0",
    blockNumber: 100,
    args: { from: "alice", to: "bob", value: 10 },
  },
  {
    name: "Token:Transfer",
    id: "101-0",
    blockNumber: 101,
    args: { from: "bob", to: "carol", value: 7 },
  },
  {
    name: "Token:Transfer",
    id: "103-0",
    blockNumber: 103,
    args: { from: "carol", to: "dave", value: 3 },
  },
];

const liveEvents = [
  {
    name: "Token:Transfer",
    id: "104-0",
    blockNumber: 104,
    args: { from: "dave", to: "erin", value: 2 },
  },
  {
    name: "Token:Transfer",
    id: "105-0",
    blockNumber: 105,
    args: { from: "erin", to: "frank", value: 1 },
  },
];

const forkEvents = [
  {
    name: "Token:Transfer",
    id: "102-0",
    blockNumber: 102,
    args: { from: "carol", to: "gina", value: 4 },
  },
];

if (skip) {
  test.skip("Bun realtime slice requires a non-empty DATABASE_URL", () => {});
} else {
  const createHarness = async () => {
    const schema = `ponder_realtime_${crypto.randomUUID().replaceAll("-", "")}`;
    const transfer = onchainTable("transfer", {
      id: text(),
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

    ponder.on("Token:Transfer", ({ event }) => ({
      id: event.id,
      sender: event.args.from,
      recipient: event.args.to,
      amount: event.args.value,
      blockNumber: event.blockNumber,
    }));

    return { schema, transfer, database };
  };

  const destroyHarness = async ({
    schema,
    database,
  }: {
    schema: string;
    database: BunSqlDatabase;
  }) => {
    ponder.fns.length = 0;
    await database.admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await database.close();
  };

  const fetchStatus = async (database: BunSqlDatabase) => {
    const server = startBunServer({
      port: 0,
      fetch: createBunRealtimeStatusFetch(database),
    });
    try {
      const status = await fetch(`http://127.0.0.1:${server.port}/status`);
      expect(status.status).toBe(200);
      return (await status.json()) as {
        checkpoint: { blockNumber: number; id: string } | null;
      };
    } finally {
      await server.stop();
    }
  };

  describe("Bun realtime slice", () => {
    test("applies a live batch and advances the /status checkpoint", async () => {
      const harness = await createHarness();
      try {
        await syncBunHistoricalEvents({
          database: harness.database,
          table: harness.transfer,
          events: historicalEvents,
          registrations: ponder.fns,
        });

        await applyBunRealtimeEvents({
          database: harness.database,
          table: harness.transfer,
          events: liveEvents,
          registrations: ponder.fns,
        });

        const rows = await harness.database.user`
          SELECT id, "blockNumber" FROM transfer ORDER BY "blockNumber"
        `;
        expect(rows).toEqual([
          { id: "100-0", blockNumber: 100 },
          { id: "101-0", blockNumber: 101 },
          { id: "103-0", blockNumber: 103 },
          { id: "104-0", blockNumber: 104 },
          { id: "105-0", blockNumber: 105 },
        ]);

        expect(await fetchStatus(harness.database)).toEqual({
          checkpoint: { blockNumber: 105, id: "105-0" },
        });
      } finally {
        await destroyHarness(harness);
      }
    });

    test("reorg rolls back user rows and the /status head", async () => {
      const harness = await createHarness();
      try {
        await syncBunHistoricalEvents({
          database: harness.database,
          table: harness.transfer,
          events: historicalEvents,
          registrations: ponder.fns,
        });
        await applyBunRealtimeEvents({
          database: harness.database,
          table: harness.transfer,
          events: liveEvents,
          registrations: ponder.fns,
        });

        await reorgBunRealtime({
          database: harness.database,
          table: harness.transfer,
          parent: { blockNumber: 101, id: "101-0" },
        });

        const rolledBackRows = await harness.database.user`
          SELECT id, "blockNumber" FROM transfer ORDER BY "blockNumber"
        `;
        expect(rolledBackRows).toEqual([
          { id: "100-0", blockNumber: 100 },
          { id: "101-0", blockNumber: 101 },
        ]);
        expect(await fetchStatus(harness.database)).toEqual({
          checkpoint: { blockNumber: 101, id: "101-0" },
        });

        await reorgBunRealtime({
          database: harness.database,
          table: harness.transfer,
          parent: { blockNumber: 101, id: "101-0" },
          events: forkEvents,
          registrations: ponder.fns,
        });

        const forkedRows = await harness.database.user`
          SELECT id, sender, recipient, amount, "blockNumber"
          FROM transfer
          ORDER BY "blockNumber"
        `;
        expect(forkedRows).toEqual([
          {
            id: "100-0",
            sender: "alice",
            recipient: "bob",
            amount: 10,
            blockNumber: 100,
          },
          {
            id: "101-0",
            sender: "bob",
            recipient: "carol",
            amount: 7,
            blockNumber: 101,
          },
          {
            id: "102-0",
            sender: "carol",
            recipient: "gina",
            amount: 4,
            blockNumber: 102,
          },
        ]);
        expect(await fetchStatus(harness.database)).toEqual({
          checkpoint: { blockNumber: 102, id: "102-0" },
        });
      } finally {
        await destroyHarness(harness);
      }
    });
  });
}
