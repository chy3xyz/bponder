import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  type BunSqlDatabase,
  createBunSqlDatabase,
} from "../database/bunSql.js";
import { type BunServer, startBunServer } from "./bunServe.js";
import { createBunV1ApiFetch } from "./bunV1Api.js";

const url = process.env.DATABASE_URL;
const skipSql = typeof url !== "string" || url.length === 0;

const createSseReader = (response: Response) => {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  return {
    async nextEvent(): Promise<{ event: string; data: string }> {
      while (true) {
        const split = buffer.indexOf("\n\n");
        if (split !== -1) {
          const raw = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          if (raw.trim() === "") continue;

          let event = "message";
          const dataLines: string[] = [];
          for (const line of raw.split("\n")) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trimStart());
            } else if (line.startsWith(":")) event = "heartbeat";
          }
          return { event, data: dataLines.join("\n") };
        }

        const { value, done } = await reader.read();
        if (done) throw new Error("SSE stream ended");
        buffer += decoder.decode(value, { stream: true });
      }
    },
    cancel: () => reader.cancel(),
  };
};

describe("Bun v1 HTTP contract", () => {
  test("keeps GET /health available", async () => {
    const server = startBunServer({
      port: 0,
      fetch: createBunV1ApiFetch(),
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/health`);
      expect(response.status).toBe(200);
    } finally {
      await server.stop();
    }
  });

  test("GET /v1/status returns the injected checkpoint", async () => {
    const server = startBunServer({
      port: 0,
      fetch: createBunV1ApiFetch({
        getStatus: () => ({ checkpoint: { blockNumber: 42, id: "42-0" } }),
      }),
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/status`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        checkpoint: { blockNumber: 42, id: "42-0" },
      });
    } finally {
      await server.stop();
    }
  });

  test("POST /v1/sql executes a SELECT through the injected executor", async () => {
    const server = startBunServer({
      port: 0,
      fetch: createBunV1ApiFetch({
        executeSql: async (sql) => {
          expect(sql).toBe("SELECT 1 AS n");
          return [{ n: 1 }];
        },
      }),
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/sql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql: "SELECT 1 AS n" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ rows: [{ n: 1 }] });
    } finally {
      await server.stop();
    }
  });

  test("POST /v1/sql accepts query as an alias of sql", async () => {
    const server = startBunServer({
      port: 0,
      fetch: createBunV1ApiFetch({
        executeSql: async () => [{ n: 2 }],
      }),
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/sql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "SELECT 2 AS n" }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ rows: [{ n: 2 }] });
    } finally {
      await server.stop();
    }
  });

  test("POST /v1/sql rejects non-SELECT statements", async () => {
    let called = false;
    const server = startBunServer({
      port: 0,
      fetch: createBunV1ApiFetch({
        executeSql: async () => {
          called = true;
          return [];
        },
      }),
    });

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/sql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sql: "INSERT INTO t VALUES (1)" }),
      });
      expect(response.status).toBe(400);
      expect(called).toBe(false);
    } finally {
      await server.stop();
    }
  });

  test("GET /v1/live sends an initial status event", async () => {
    const server = startBunServer({
      port: 0,
      fetch: createBunV1ApiFetch({
        getStatus: () => ({ checkpoint: { blockNumber: 7, id: "7-0" } }),
        heartbeatIntervalMs: 10_000,
      }),
    });
    const controller = new AbortController();

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/live`, {
        signal: controller.signal,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "text/event-stream",
      );

      const reader = createSseReader(response);
      const event = await reader.nextEvent();
      expect(event.event).toBe("status");
      expect(JSON.parse(event.data)).toEqual({
        checkpoint: { blockNumber: 7, id: "7-0" },
      });
    } finally {
      controller.abort();
      await server.stop();
    }
  });

  test("GET /v1/live emits status when the checkpoint changes", async () => {
    let checkpoint = { blockNumber: 1, id: "1-0" };
    const server = startBunServer({
      port: 0,
      fetch: createBunV1ApiFetch({
        getStatus: () => ({ checkpoint }),
        pollIntervalMs: 20,
        heartbeatIntervalMs: 10_000,
      }),
    });
    const controller = new AbortController();

    try {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/live`, {
        signal: controller.signal,
      });
      const reader = createSseReader(response);
      const first = await reader.nextEvent();
      expect(JSON.parse(first.data)).toEqual({
        checkpoint: { blockNumber: 1, id: "1-0" },
      });

      checkpoint = { blockNumber: 2, id: "2-0" };
      const second = await reader.nextEvent();
      expect(second.event).toBe("status");
      expect(JSON.parse(second.data)).toEqual({
        checkpoint: { blockNumber: 2, id: "2-0" },
      });
    } finally {
      controller.abort();
      await server.stop();
    }
  });
});

if (skipSql) {
  test.skip("Bun v1 SQL requires a non-empty DATABASE_URL", () => {});
} else {
  describe("Bun v1 SQL against Postgres", () => {
    const schema = `ponder_v1_${crypto.randomUUID().replaceAll("-", "")}`;
    let database: BunSqlDatabase;
    let server: BunServer;

    beforeAll(async () => {
      database = createBunSqlDatabase({ url });
      await database.admin.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await database.close();

      const schemaUrl = new URL(url);
      schemaUrl.searchParams.set("options", `-csearch_path=${schema}`);
      database = createBunSqlDatabase({ url: schemaUrl.toString() });
      await database.migrate();
      await database.user`
        INSERT INTO ponder_bun_meta (key, value)
        VALUES (${"historical_checkpoint"}, ${JSON.stringify({
          blockNumber: 9,
          id: "9-0",
        })})
      `;

      server = startBunServer({
        port: 0,
        fetch: createBunV1ApiFetch({ database }),
      });
    });

    afterAll(async () => {
      await server.stop();
      await database.admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await database.close();
    });

    test("GET /v1/status reads Bun slice meta", async () => {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/status`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        checkpoint: { blockNumber: 9, id: "9-0" },
      });
    });

    test("POST /v1/sql runs a readonly SELECT through Bun.SQL", async () => {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/sql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sql: "SELECT key, value FROM ponder_bun_meta WHERE key = 'historical_checkpoint'",
        }),
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        rows: [
          {
            key: "historical_checkpoint",
            value: JSON.stringify({ blockNumber: 9, id: "9-0" }),
          },
        ],
      });
    });

    test("POST /v1/sql does not execute INSERT", async () => {
      const response = await fetch(`http://127.0.0.1:${server.port}/v1/sql`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sql: "INSERT INTO ponder_bun_meta (key, value) VALUES ('evil', '1')",
        }),
      });
      expect(response.status).toBe(400);

      const rows = await database.user`
        SELECT key FROM ponder_bun_meta WHERE key = ${"evil"}
      `;
      expect(rows).toEqual([]);
    });
  });
}
