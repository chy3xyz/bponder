import type { OnchainTable } from "bponder-schema";
import type { Registration } from "../app/ponder.js";
import type { BunSqlDatabase, BunSqlTransaction } from "../database/bunSql.js";
import type { BunFetchHandler } from "../server/bunServe.js";

export type BunHistoricalEvent = {
  name: string;
  id: string;
  blockNumber: number;
  [key: string]: unknown;
};

export type BunHistoricalCheckpoint = {
  blockNumber: number;
  id: string;
};

const checkpointKey = "historical_checkpoint";

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;

const postgresType = {
  text: "text",
  integer: "integer",
  boolean: "boolean",
} as const;

const flushRows = async ({
  sql,
  table,
  rows,
}: {
  sql: BunSqlTransaction;
  table: OnchainTable;
  rows: Record<string, unknown>[];
}) => {
  if (rows.length === 0) return;

  const columns = Object.entries(table.columns);
  const columnSql = columns.map(([name]) => quoteIdentifier(name)).join(", ");
  const unnestSql = columns
    .map(([, column], index) => `$${index + 1}::${postgresType[column.type]}[]`)
    .join(", ");
  const values = columns.map(([name]) => rows.map((row) => row[name]));

  await sql.unsafe(
    `INSERT INTO ${quoteIdentifier(table.name)} (${columnSql})
     SELECT * FROM UNNEST(${unnestSql})`,
    values,
  );
};

export const syncBunHistoricalEvents = async ({
  database,
  table,
  events,
  registrations,
}: {
  database: BunSqlDatabase;
  table: OnchainTable;
  events: BunHistoricalEvent[];
  registrations: Registration[];
}): Promise<BunHistoricalCheckpoint | undefined> => {
  const rows: Record<string, unknown>[] = [];

  for (const event of events) {
    for (const registration of registrations) {
      if (registration.name !== event.name) continue;

      const row = await registration.fn({ event });
      if (row !== undefined) rows.push(row);
    }
  }

  const event = events.reduce<BunHistoricalEvent | undefined>(
    (latest, candidate) =>
      latest === undefined || candidate.blockNumber >= latest.blockNumber
        ? candidate
        : latest,
    undefined,
  );
  if (event === undefined) return undefined;

  const checkpoint = { blockNumber: event.blockNumber, id: event.id };
  await database.user.begin(async (sql) => {
    await flushRows({ sql, table, rows });
    await sql`
      INSERT INTO ponder_bun_meta (key, value)
      VALUES (${checkpointKey}, ${JSON.stringify(checkpoint)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `;
  });

  return checkpoint;
};

export const createBunHistoricalStatusFetch =
  (database: BunSqlDatabase): BunFetchHandler =>
  async (request) => {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(null, { status: 200 });
    }

    if (request.method === "GET" && url.pathname === "/status") {
      const rows = await database.admin`
        SELECT value FROM ponder_bun_meta WHERE key = ${checkpointKey}
      `;
      const value = rows[0]?.value;
      const checkpoint =
        typeof value === "string"
          ? (JSON.parse(value) as BunHistoricalCheckpoint)
          : null;

      return Response.json({ checkpoint });
    }

    return new Response("Not Found", { status: 404 });
  };
