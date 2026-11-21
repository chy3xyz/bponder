import {
  applyBunRealtimeEvents,
  createBunRealtimeStatusFetch,
  createBunSqlDatabase,
  migrateUser,
  ponder,
  reorgBunRealtime,
  startBunServer,
  stopBunServer,
  syncBunHistoricalEvents,
} from "../../../packages/core/src/index.ts";
import { transfer } from "../ponder.schema.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

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
];

const liveEvents = [
  {
    name: "Token:Transfer",
    id: "104-0",
    blockNumber: 104,
    args: { from: "carol", to: "dave", value: 3 },
  },
];

const forkEvents = [
  {
    name: "Token:Transfer",
    id: "102-0",
    blockNumber: 102,
    args: { from: "carol", to: "erin", value: 4 },
  },
];

const schema = `ponder_bun_live_${crypto.randomUUID().replaceAll("-", "")}`;
const root = createBunSqlDatabase({ url: databaseUrl });
await root.admin.unsafe(`CREATE SCHEMA "${schema}"`);
await root.close();

const scopedUrl = new URL(databaseUrl);
scopedUrl.searchParams.set("options", `-csearch_path=${schema}`);
const database = createBunSqlDatabase({ url: scopedUrl.toString() });
let server: ReturnType<typeof startBunServer> | undefined;

try {
  await database.migrate();
  await migrateUser(database, transfer);

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
    events: historicalEvents,
    registrations: ponder.fns,
  });

  await applyBunRealtimeEvents({
    database,
    table: transfer,
    events: liveEvents,
    registrations: ponder.fns,
  });

  const liveRows =
    await database.user`SELECT id FROM transfer ORDER BY "blockNumber"`;
  assert(
    Array.isArray(liveRows) && liveRows.length === 3,
    `expected 3 transfer rows after live apply, got ${liveRows.length}`,
  );

  server = startBunServer({
    port: 0,
    fetch: createBunRealtimeStatusFetch(database),
  });
  const origin = `http://127.0.0.1:${server.port}`;

  const health = await fetch(`${origin}/health`);
  assert(health.status === 200, `/health returned ${health.status}`);

  const liveStatus = (await (await fetch(`${origin}/status`)).json()) as {
    checkpoint: { blockNumber: number; id: string } | null;
  };
  assert(
    liveStatus.checkpoint?.id === "104-0",
    `/status checkpoint after live apply was ${liveStatus.checkpoint?.id}`,
  );

  await reorgBunRealtime({
    database,
    table: transfer,
    parent: { blockNumber: 101, id: "101-0" },
  });

  const rolledBack =
    await database.user`SELECT id FROM transfer ORDER BY "blockNumber"`;
  assert(
    Array.isArray(rolledBack) && rolledBack.length === 2,
    `expected 2 transfer rows after reorg, got ${rolledBack.length}`,
  );

  const reorgStatus = (await (await fetch(`${origin}/status`)).json()) as {
    checkpoint: { blockNumber: number; id: string } | null;
  };
  assert(
    reorgStatus.checkpoint?.id === "101-0",
    `/status checkpoint after reorg was ${reorgStatus.checkpoint?.id}`,
  );

  await reorgBunRealtime({
    database,
    table: transfer,
    parent: { blockNumber: 101, id: "101-0" },
    events: forkEvents,
    registrations: ponder.fns,
  });

  const forked =
    await database.user`SELECT id FROM transfer ORDER BY "blockNumber"`;
  assert(
    Array.isArray(forked) && forked.length === 3 && forked[2]?.id === "102-0",
    `expected fork row 102-0 after reorg apply, got ${JSON.stringify(forked)}`,
  );

  const forkStatus = (await (await fetch(`${origin}/status`)).json()) as {
    checkpoint: { blockNumber: number; id: string } | null;
  };
  assert(
    forkStatus.checkpoint?.id === "102-0",
    `/status checkpoint after fork was ${forkStatus.checkpoint?.id}`,
  );

  console.log("Bun realtime slice smoke passed");
} finally {
  ponder.fns.length = 0;
  if (server) await stopBunServer(server);
  await database.close();

  const cleanup = createBunSqlDatabase({ url: databaseUrl });
  await cleanup.admin.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await cleanup.close();
}
