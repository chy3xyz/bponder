import type { OnchainTable } from "@ponder/schema";
import type { BunSqlDatabase, BunSqlTransaction } from "../database/bunSql.js";

// Full simulation-test port of runtime/omnichain.ts and runtime/multichain.ts is deferred.

export type BunOrderingMode = "multichain" | "omnichain";

export type BunOrderingEvent = {
  name: string;
  id: string;
  chainId: number;
  blockNumber: number;
  blockTimestamp: number;
  args: { from: string; to: string; value: number };
  [key: string]: unknown;
};

export type BunOrderingChainCheckpoint = {
  blockNumber: number;
  blockTimestamp: number;
  id: string;
};

export type BunOrderingMultichainCheckpoint = {
  mode: "multichain";
  chains: Record<number, BunOrderingChainCheckpoint>;
};

export type BunOrderingOmnichainCheckpoint = {
  mode: "omnichain";
  checkpoint: BunOrderingChainCheckpoint & { chainId: number };
};

export type BunOrderingCheckpoint =
  | BunOrderingMultichainCheckpoint
  | BunOrderingOmnichainCheckpoint;

export type BunOrderingRow = {
  id: string;
  chainId: number;
  seq: number;
  sender: string;
  recipient: string;
  amount: number;
  blockNumber: number;
  blockTimestamp: number;
};

const checkpointKey = "ordering_checkpoint";

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;

const postgresType = {
  text: "text",
  integer: "integer",
  boolean: "boolean",
} as const;

const compareWithinChain = (a: BunOrderingEvent, b: BunOrderingEvent) =>
  a.blockTimestamp - b.blockTimestamp ||
  a.blockNumber - b.blockNumber ||
  a.id.localeCompare(b.id);

const compareOmnichain = (a: BunOrderingEvent, b: BunOrderingEvent) =>
  a.blockTimestamp - b.blockTimestamp ||
  a.chainId - b.chainId ||
  a.blockNumber - b.blockNumber ||
  a.id.localeCompare(b.id);

const toRows = (
  events: BunOrderingEvent[],
  startSeq: number,
): { rows: BunOrderingRow[]; nextSeq: number } => {
  const rows: BunOrderingRow[] = [];
  let seq = startSeq;

  for (const event of events) {
    if (event.name !== "Token:Transfer") continue;
    seq += 1;
    rows.push({
      id: event.id,
      chainId: event.chainId,
      seq,
      sender: event.args.from,
      recipient: event.args.to,
      amount: event.args.value,
      blockNumber: event.blockNumber,
      blockTimestamp: event.blockTimestamp,
    });
  }

  return { rows, nextSeq: seq };
};

const chainCheckpoint = (
  event: BunOrderingEvent,
): BunOrderingChainCheckpoint => ({
  blockNumber: event.blockNumber,
  blockTimestamp: event.blockTimestamp,
  id: event.id,
});

const latestEvent = (events: BunOrderingEvent[]) =>
  events.reduce<BunOrderingEvent | undefined>(
    (head, candidate) =>
      head === undefined || compareWithinChain(head, candidate) < 0
        ? candidate
        : head,
    undefined,
  );

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

const persistCheckpoint = async (
  sql: BunSqlTransaction,
  checkpoint: BunOrderingCheckpoint,
) => {
  await sql`
    INSERT INTO ponder_bun_meta (key, value)
    VALUES (${checkpointKey}, ${JSON.stringify(checkpoint)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
};

const groupByChain = (events: BunOrderingEvent[]) => {
  const groups = new Map<number, BunOrderingEvent[]>();
  for (const event of events) {
    const group = groups.get(event.chainId);
    if (group === undefined) {
      groups.set(event.chainId, [event]);
    } else {
      group.push(event);
    }
  }
  return [...groups.entries()].sort(([a], [b]) => a - b);
};

export const syncBunOrderingEvents = async ({
  database,
  table,
  events,
  mode,
}: {
  database: BunSqlDatabase;
  table: OnchainTable;
  events: BunOrderingEvent[];
  mode: BunOrderingMode;
}): Promise<BunOrderingCheckpoint | undefined> => {
  if (events.length === 0) return undefined;

  if (mode === "omnichain") {
    const ordered = events.slice().sort(compareOmnichain);
    const { rows } = toRows(ordered, 0);
    const last = ordered[ordered.length - 1];
    if (last === undefined) return undefined;

    const checkpoint: BunOrderingOmnichainCheckpoint = {
      mode: "omnichain",
      checkpoint: { ...chainCheckpoint(last), chainId: last.chainId },
    };

    await database.user.begin(async (sql) => {
      await flushRows({ sql, table, rows });
      await persistCheckpoint(sql, checkpoint);
    });

    return checkpoint;
  }

  let seq = 0;
  let checkpoint: BunOrderingMultichainCheckpoint | undefined;

  for (const [chainId, chainEvents] of groupByChain(events)) {
    const ordered = chainEvents.slice().sort(compareWithinChain);
    const { rows, nextSeq } = toRows(ordered, seq);
    seq = nextSeq;
    const last = latestEvent(ordered);
    if (last === undefined && rows.length === 0) continue;

    const nextCheckpoint: BunOrderingMultichainCheckpoint = {
      mode: "multichain",
      chains: {
        ...checkpoint?.chains,
        ...(last === undefined ? {} : { [chainId]: chainCheckpoint(last) }),
      },
    };

    await database.user.begin(async (sql) => {
      await flushRows({ sql, table, rows });
      await persistCheckpoint(sql, nextCheckpoint);
    });
    checkpoint = nextCheckpoint;
  }

  return checkpoint;
};
