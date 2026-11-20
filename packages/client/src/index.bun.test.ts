import { expect, test } from "bun:test";
import { startBunServer } from "../../core/src/server/bunServe.js";
import { createBunV1ApiFetch } from "../../core/src/server/bunV1Api.js";
import { createClient, type Status } from "./index.js";

const encodeSse = (event: string, data = "") =>
  `event: ${event}\ndata: ${data}\n\n`;

const startStub = (
  fetch: (request: Request) => Response | Promise<Response>,
) => {
  const server = Bun.serve({ port: 0, fetch });
  return {
    url: `http://127.0.0.1:${server.port}`,
    stop: () => server.stop(true),
  };
};

const waitUntil = async (predicate: () => boolean, timeoutMs = 1_000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await Bun.sleep(10);
  }
  throw new Error("timed out");
};

const waitForStatus = (
  client: ReturnType<typeof createClient>,
  timeoutMs = 1_000,
) =>
  new Promise<Status>((resolve, reject) => {
    let subscription: { unsubscribe: () => void } | undefined;
    const timeout = setTimeout(() => {
      subscription?.unsubscribe();
      reject(new Error("timed out waiting for live status"));
    }, timeoutMs);
    subscription = client.live(
      (status) => {
        clearTimeout(timeout);
        subscription?.unsubscribe();
        resolve(status);
      },
      (error) => {
        clearTimeout(timeout);
        subscription?.unsubscribe();
        reject(error);
      },
    );
  });

test("getStatus GETs /v1/status", async () => {
  const status = { checkpoint: { blockNumber: 42, id: "42-0" } };
  const stub = startStub((request) => {
    const url = new URL(request.url);
    expect(request.method).toBe("GET");
    expect(url.pathname).toBe("/v1/status");
    return Response.json(status);
  });

  try {
    const client = createClient({ url: stub.url });
    expect(await client.getStatus()).toEqual(status);
  } finally {
    await stub.stop();
  }
});

test("sql POSTs /v1/sql with { sql } and returns { rows }", async () => {
  const stub = startStub(async (request) => {
    const url = new URL(request.url);
    expect(request.method).toBe("POST");
    expect(url.pathname).toBe("/v1/sql");
    expect(request.headers.get("content-type")).toContain("application/json");
    expect(await request.json()).toEqual({ sql: "SELECT 1 AS n" });
    return Response.json({ rows: [{ n: 1 }] });
  });

  try {
    const client = createClient({ url: stub.url });
    expect(await client.sql("SELECT 1 AS n")).toEqual({ rows: [{ n: 1 }] });
  } finally {
    await stub.stop();
  }
});

test("query POSTs /v1/sql with { query } and returns { rows }", async () => {
  const stub = startStub(async (request) => {
    const url = new URL(request.url);
    expect(request.method).toBe("POST");
    expect(url.pathname).toBe("/v1/sql");
    expect(await request.json()).toEqual({ query: "SELECT 2 AS n" });
    return Response.json({ rows: [{ n: 2 }] });
  });

  try {
    const client = createClient({ url: stub.url });
    expect(await client.query("SELECT 2 AS n")).toEqual({ rows: [{ n: 2 }] });
  } finally {
    await stub.stop();
  }
});

test("sql throws when the server returns an error payload", async () => {
  const stub = startStub(() =>
    Response.json(
      { error: "Only readonly SELECT statements are allowed" },
      { status: 400 },
    ),
  );

  try {
    const client = createClient({ url: stub.url });
    await expect(client.sql("INSERT INTO t VALUES (1)")).rejects.toThrow(
      "Only readonly SELECT statements are allowed",
    );
  } finally {
    await stub.stop();
  }
});

test("live subscribes to GET /v1/live status events", async () => {
  const status = { checkpoint: { blockNumber: 7, id: "7-0" } };
  const stub = startStub((request) => {
    const url = new URL(request.url);
    expect(request.method).toBe("GET");
    expect(url.pathname).toBe("/v1/live");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(encodeSse("heartbeat")));
        controller.enqueue(
          encoder.encode(encodeSse("status", JSON.stringify(status))),
        );
      },
    });

    return new Response(stream, {
      headers: { "content-type": "text/event-stream" },
    });
  });

  try {
    const client = createClient({ url: stub.url });
    expect(await waitForStatus(client)).toEqual(status);
  } finally {
    await stub.stop();
  }
});

test("createClient talks to createBunV1ApiFetch + startBunServer", async () => {
  let checkpoint = { blockNumber: 1, id: "1-0" };
  const server = startBunServer({
    port: 0,
    fetch: createBunV1ApiFetch({
      getStatus: () => ({ checkpoint }),
      executeSql: async (sql) => {
        expect(sql).toBe("SELECT 1 AS n");
        return [{ n: 1 }];
      },
      pollIntervalMs: 20,
      heartbeatIntervalMs: 10_000,
    }),
  });

  try {
    const client = createClient({ url: `http://127.0.0.1:${server.port}` });

    expect(await client.getStatus()).toEqual({ checkpoint });
    expect(await client.sql("SELECT 1 AS n")).toEqual({ rows: [{ n: 1 }] });
    expect(await client.query("SELECT 1 AS n")).toEqual({ rows: [{ n: 1 }] });

    const statuses: Status[] = [];
    const { unsubscribe } = client.live((status) => {
      statuses.push(status);
    });

    try {
      await waitUntil(() => statuses.length > 0);
      expect(statuses[0]).toEqual({ checkpoint });

      checkpoint = { blockNumber: 2, id: "2-0" };
      await waitUntil(() => statuses.length > 1);
      expect(statuses.at(-1)).toEqual({ checkpoint });
    } finally {
      unsubscribe();
    }
  } finally {
    await server.stop();
  }
});
