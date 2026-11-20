import type { OnchainTable } from "@ponder/schema";
import type { BunSqlDatabase, BunSqlTransaction } from "../database/bunSql.js";

export type BunIsolatedEvent = {
  name: string;
  id: string;
  chainId: number;
  blockNumber: number;
  args: { from: string; to: string; value: number };
  [key: string]: unknown;
};

export type BunIsolatedRow = {
  id: string;
  chainId: number;
  sender: string;
  recipient: string;
  amount: number;
  blockNumber: number;
};

export type BunIsolatedChainCheckpoint = {
  blockNumber: number;
  id: string;
};

export type BunIsolatedCheckpoint = {
  chains: Record<number, BunIsolatedChainCheckpoint>;
};

export type BunIsolatedWorkerCheckpoint = BunIsolatedChainCheckpoint & {
  chainId: number;
};

export type BunIsolatedBatchResult = {
  rows: BunIsolatedRow[];
  checkpoint: BunIsolatedWorkerCheckpoint | undefined;
};

type WorkerRequest =
  | { type: "ping"; requestId: number }
  | { type: "batch"; requestId: number; events: BunIsolatedEvent[] };

type WorkerReply =
  | { type: "pong"; requestId: number; worker: "bun" }
  | ({ type: "batchResult"; requestId: number } & BunIsolatedBatchResult);

const checkpointKey = "isolated_checkpoint";

const quoteIdentifier = (identifier: string) =>
  `"${identifier.replaceAll('"', '""')}"`;

const postgresType = {
  text: "text",
  integer: "integer",
  boolean: "boolean",
} as const;

export const computeBunIsolatedRows = (
  events: BunIsolatedEvent[],
): BunIsolatedBatchResult => {
  const rows: BunIsolatedRow[] = [];

  for (const event of events) {
    if (event.name !== "Token:Transfer") continue;
    rows.push({
      id: event.id,
      chainId: event.chainId,
      sender: event.args.from,
      recipient: event.args.to,
      amount: event.args.value,
      blockNumber: event.blockNumber,
    });
  }

  const latest = events.reduce<BunIsolatedEvent | undefined>(
    (head, candidate) =>
      head === undefined || candidate.blockNumber >= head.blockNumber
        ? candidate
        : head,
    undefined,
  );

  return {
    rows,
    checkpoint:
      latest === undefined
        ? undefined
        : {
            chainId: latest.chainId,
            blockNumber: latest.blockNumber,
            id: latest.id,
          },
  };
};

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

const mergeCheckpoint = (
  current: BunIsolatedCheckpoint | undefined,
  update: BunIsolatedWorkerCheckpoint,
): BunIsolatedCheckpoint => ({
  chains: {
    ...current?.chains,
    [update.chainId]: { blockNumber: update.blockNumber, id: update.id },
  },
});

type Pending = {
  resolve: (reply: WorkerReply) => void;
  reject: (error: Error) => void;
};

const createWorkerClient = (worker: Worker) => {
  const pending = new Map<number, Pending>();
  let nextRequestId = 0;

  worker.onmessage = (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    const request = pending.get(reply.requestId);
    if (request === undefined) return;
    pending.delete(reply.requestId);
    request.resolve(reply);
  };

  worker.onerror = (event) => {
    const error = event.error ?? new Error(event.message);
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };

  const request = (message: Omit<WorkerRequest, "requestId">) =>
    new Promise<WorkerReply>((resolve, reject) => {
      const requestId = ++nextRequestId;
      pending.set(requestId, { resolve, reject });
      worker.postMessage({ ...message, requestId });
    });

  return { request };
};

export const syncBunIsolatedEvents = async ({
  database,
  table,
  shards,
  beforeFlush,
  afterFlush,
}: {
  database: BunSqlDatabase;
  table: OnchainTable;
  shards: BunIsolatedEvent[][];
  beforeFlush?: () => Promise<void> | void;
  afterFlush?: () => Promise<void> | void;
}): Promise<BunIsolatedCheckpoint | undefined> => {
  if (shards.length === 0) return undefined;

  const workers = shards.map(
    () => new Worker(new URL("./bunIsolatedWorker.ts", import.meta.url).href),
  );
  const clients = workers.map(createWorkerClient);

  let checkpoint: BunIsolatedCheckpoint | undefined;
  let flushTail = Promise.resolve();

  const enqueueFlush = (result: BunIsolatedBatchResult) => {
    const run = flushTail.then(async () => {
      await beforeFlush?.();
      try {
        if (result.checkpoint !== undefined) {
          checkpoint = mergeCheckpoint(checkpoint, result.checkpoint);
        }
        if (result.rows.length === 0 && checkpoint === undefined) return;

        await database.user.begin(async (sql) => {
          await flushRows({ sql, table, rows: result.rows });
          if (checkpoint === undefined) return;
          await sql`
            INSERT INTO ponder_bun_meta (key, value)
            VALUES (${checkpointKey}, ${JSON.stringify(checkpoint)})
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
          `;
        });
      } finally {
        await afterFlush?.();
      }
    });
    flushTail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  try {
    await Promise.all(
      shards.map(async (events, index) => {
        const client = clients[index]!;
        const pong = await client.request({ type: "ping" });
        if (pong.type !== "pong" || pong.worker !== "bun") {
          throw new Error("isolated worker ping must receive a bun pong");
        }

        const reply = await client.request({ type: "batch", events });
        if (reply.type !== "batchResult") {
          throw new Error("isolated worker batch must receive batchResult");
        }

        await enqueueFlush({
          rows: reply.rows,
          checkpoint: reply.checkpoint,
        });
      }),
    );

    return checkpoint;
  } finally {
    for (const worker of workers) worker.terminate();
  }
};
