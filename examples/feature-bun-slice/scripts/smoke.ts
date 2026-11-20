import {
  createBunHistoricalStatusFetch,
  createBunSqlDatabase,
  migrateUser,
  ponder,
  startBunServer,
  stopBunServer,
  syncBunHistoricalEvents,
} from "ponder";
import { transfer } from "../ponder.schema";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

const schema = `ponder_bun_slice_${crypto.randomUUID().replaceAll("-", "")}`;
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
    events: [
      {
        name: "Token:Transfer",
        id: "100-0",
        blockNumber: 100,
        args: { from: "alice", to: "bob", value: 10 },
      },
    ],
    registrations: ponder.fns,
  });

  server = startBunServer({
    port: 0,
    fetch: createBunHistoricalStatusFetch(database),
  });
  const origin = `http://127.0.0.1:${server.port}`;
  const health = await fetch(`${origin}/health`);
  const status = await fetch(`${origin}/status`);
  const body = (await status.json()) as {
    checkpoint: { blockNumber: number; id: string } | null;
  };

  assert(health.status === 200, `/health returned ${health.status}`);
  assert(status.status === 200, `/status returned ${status.status}`);
  assert(body.checkpoint?.id === "100-0", "/status checkpoint was incorrect");
  console.log("Bun historical slice smoke passed");
} finally {
  ponder.fns.length = 0;
  if (server) await stopBunServer(server);
  await database.close();

  const cleanup = createBunSqlDatabase({ url: databaseUrl });
  await cleanup.admin.unsafe(`DROP SCHEMA "${schema}" CASCADE`);
  await cleanup.close();
}
