import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { integer, onchainTable, text } from "@ponder/schema";
import { ponder } from "../app/ponder.js";
import {
  type BunSqlDatabase,
  createBunSqlDatabase,
} from "../database/bunSql.js";
import { migrateUser } from "../database/migrateUser.js";
import { startBunServer } from "../server/bunServe.js";
import {
  createBunHistoricalStatusFetch,
  syncBunHistoricalEvents,
} from "./bunHistoricalSlice.js";

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

if (skip) {
  test.skip("Bun historical slice requires a non-empty DATABASE_URL", () => {});
} else {
  describe("Bun historical slice", () => {
    const schema = `ponder_historical_${crypto.randomUUID().replaceAll("-", "")}`;
    const transfer = onchainTable("transfer", {
      id: text(),
      sender: text(),
      recipient: text(),
      amount: integer(),
      blockNumber: integer(),
    });
    const events = [
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
    let database: BunSqlDatabase;

    beforeAll(async () => {
      database = createBunSqlDatabase({ url });
      await database.admin.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await database.close();

      const schemaUrl = new URL(url);
      schemaUrl.searchParams.set("options", `-csearch_path=${schema}`);
      database = createBunSqlDatabase({ url: schemaUrl.toString() });
      await database.migrate();
      await migrateUser(database, transfer);
    });

    afterAll(async () => {
      ponder.fns.length = 0;
      await database.admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await database.close();
    });

    test("indexes fixture events and serves the persisted checkpoint", async () => {
      ponder.on("Token:Transfer", ({ event }) => ({
        id: event.id,
        sender: event.args.from,
        recipient: event.args.to,
        amount: event.args.value,
        blockNumber: event.blockNumber,
      }));

      await syncBunHistoricalEvents({
        database,
        table: transfer,
        events,
        registrations: ponder.fns,
      });

      const rows = await database.user`
        SELECT id, sender, recipient, amount, "blockNumber"
        FROM transfer
        ORDER BY "blockNumber"
      `;
      expect(rows).toEqual([
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
          id: "103-0",
          sender: "carol",
          recipient: "dave",
          amount: 3,
          blockNumber: 103,
        },
      ]);

      const server = startBunServer({
        port: 0,
        fetch: createBunHistoricalStatusFetch(database),
      });
      try {
        const health = await fetch(`http://127.0.0.1:${server.port}/health`);
        expect(health.status).toBe(200);

        const status = await fetch(`http://127.0.0.1:${server.port}/status`);
        expect(status.status).toBe(200);
        expect(await status.json()).toEqual({
          checkpoint: { blockNumber: 103, id: "103-0" },
        });
      } finally {
        await server.stop();
      }

      await database.admin`DROP TABLE ponder_bun_meta`;
      await expect(
        syncBunHistoricalEvents({
          database,
          table: transfer,
          events: [
            {
              name: "Token:Transfer",
              id: "104-0",
              blockNumber: 104,
              args: { from: "dave", to: "erin", value: 1 },
            },
          ],
          registrations: ponder.fns,
        }),
      ).rejects.toThrow();

      const rolledBackRows = await database.user`
        SELECT id FROM transfer WHERE id = '104-0'
      `;
      expect(rolledBackRows).toEqual([]);
    });
  });
}
