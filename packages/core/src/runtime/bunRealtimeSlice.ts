import type { OnchainTable } from "bponder-schema";
import type { Registration } from "../app/ponder.js";
import type { BunSqlDatabase } from "../database/bunSql.js";
import {
  type BunHistoricalCheckpoint,
  type BunHistoricalEvent,
  createBunHistoricalStatusFetch,
  syncBunHistoricalEvents,
} from "./bunHistoricalSlice.js";

export type BunRealtimeEvent = BunHistoricalEvent;
export type BunRealtimeCheckpoint = BunHistoricalCheckpoint;

export const applyBunRealtimeEvents = syncBunHistoricalEvents;
export const createBunRealtimeStatusFetch = createBunHistoricalStatusFetch;

const checkpointKey = "historical_checkpoint";

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;

export const reorgBunRealtime = async ({
  database,
  table,
  parent,
  events = [],
  registrations = [],
}: {
  database: BunSqlDatabase;
  table: OnchainTable;
  parent: BunRealtimeCheckpoint;
  events?: BunRealtimeEvent[];
  registrations?: Registration[];
}): Promise<BunRealtimeCheckpoint> => {
  await database.user.begin(async (sql) => {
    await sql.unsafe(
      `DELETE FROM ${quoteIdentifier(table.name)} WHERE ${quoteIdentifier("blockNumber")} > $1`,
      [parent.blockNumber],
    );
    await sql`
      INSERT INTO ponder_bun_meta (key, value)
      VALUES (${checkpointKey}, ${JSON.stringify(parent)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  });

  if (events.length === 0) return parent;

  return (
    (await syncBunHistoricalEvents({
      database,
      table,
      events,
      registrations,
    })) ?? parent
  );
};
