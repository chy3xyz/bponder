import { describe, expect, test } from "bun:test";
import {
  createBunNativeHttpFetch,
  isBunNativeReservedApiPath,
  validateBunNativeHonoRoutes,
} from "./bunNativeHttp.js";

describe("createBunNativeHttpFetch", () => {
  test("routes /health and /v1 to the v1 fetch handler", async () => {
    const calls: string[] = [];
    const fetch = createBunNativeHttpFetch({
      v1Fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("v1", { status: 200 });
      },
      honoApp: {
        fetch: async () => new Response("hono", { status: 200 }),
      },
    });

    expect(await (await fetch(new Request("http://x/health"))).text()).toBe(
      "v1",
    );
    expect(await (await fetch(new Request("http://x/v1/status"))).text()).toBe(
      "v1",
    );
    expect(calls).toEqual(["/health", "/v1/status"]);
  });

  test("falls through to Hono for other paths", async () => {
    const fetch = createBunNativeHttpFetch({
      v1Fetch: async () => new Response("v1", { status: 200 }),
      honoApp: {
        fetch: async () => new Response("hello", { status: 200 }),
      },
    });

    const res = await fetch(new Request("http://x/hello"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("hello");
  });

  test("returns 404 when Hono is absent", async () => {
    const fetch = createBunNativeHttpFetch({
      v1Fetch: async () => new Response("v1", { status: 200 }),
    });
    const res = await fetch(new Request("http://x/hello"));
    expect(res.status).toBe(404);
  });

  test("GET /ready uses ops.getReady", async () => {
    let ready = false;
    const fetch = createBunNativeHttpFetch({
      v1Fetch: async () => new Response("v1", { status: 200 }),
      ops: {
        getReady: () => ready,
      },
    });

    let res = await fetch(new Request("http://x/ready"));
    expect(res.status).toBe(503);
    expect(await res.text()).toBe("Historical indexing is not complete.");

    ready = true;
    res = await fetch(new Request("http://x/ready"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  test("GET /metrics uses ops.getMetrics", async () => {
    const fetch = createBunNativeHttpFetch({
      v1Fetch: async () => new Response("v1", { status: 200 }),
      ops: {
        getMetrics: () => "# HELP test\n",
      },
    });

    const res = await fetch(new Request("http://x/metrics"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(await res.text()).toBe("# HELP test\n");
  });

  test("GET /metrics returns 500 when getMetrics throws", async () => {
    const fetch = createBunNativeHttpFetch({
      v1Fetch: async () => new Response("v1", { status: 200 }),
      ops: {
        getMetrics: () => {
          throw new Error("boom");
        },
      },
    });

    const res = await fetch(new Request("http://x/metrics"));
    expect(res.status).toBe(500);
  });

  test("GET /status uses ops.getStatus", async () => {
    const body = {
      mainnet: { id: 1, block: { number: 10, timestamp: 100 } },
    };
    const fetch = createBunNativeHttpFetch({
      v1Fetch: async () => new Response("v1", { status: 200 }),
      ops: {
        getStatus: () => body,
      },
    });

    const res = await fetch(new Request("http://x/status"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(body);
  });

  test("classic routes return 404 when ops handlers are missing", async () => {
    const fetch = createBunNativeHttpFetch({
      v1Fetch: async () => new Response("v1", { status: 200 }),
      honoApp: {
        fetch: async () => new Response("hono", { status: 200 }),
      },
    });

    expect((await fetch(new Request("http://x/ready"))).status).toBe(404);
    expect((await fetch(new Request("http://x/metrics"))).status).toBe(404);
    expect((await fetch(new Request("http://x/status"))).status).toBe(404);
  });

  test("classic routes do not fall through to Hono when ops are present", async () => {
    const fetch = createBunNativeHttpFetch({
      v1Fetch: async () => new Response("v1", { status: 200 }),
      honoApp: {
        fetch: async () => new Response("hono", { status: 200 }),
      },
      ops: {
        getReady: () => true,
        getMetrics: () => "m",
        getStatus: () => ({}),
      },
    });

    expect(await (await fetch(new Request("http://x/ready"))).text()).toBe("");
    expect(await (await fetch(new Request("http://x/metrics"))).text()).toBe(
      "m",
    );
    expect(await (await fetch(new Request("http://x/status"))).json()).toEqual(
      {},
    );
  });

  test("non-GET classic routes return 404", async () => {
    const fetch = createBunNativeHttpFetch({
      v1Fetch: async () => new Response("v1", { status: 200 }),
      ops: {
        getReady: () => true,
        getMetrics: () => "m",
        getStatus: () => ({}),
      },
    });

    expect(
      (await fetch(new Request("http://x/ready", { method: "PUT" }))).status,
    ).toBe(404);
    expect(
      (await fetch(new Request("http://x/metrics", { method: "PUT" }))).status,
    ).toBe(404);
    expect(
      (await fetch(new Request("http://x/status", { method: "PUT" }))).status,
    ).toBe(404);
  });
});

describe("validateBunNativeHonoRoutes", () => {
  test("rejects reserved paths including /v1", () => {
    expect(
      validateBunNativeHonoRoutes({
        fetch: async () => new Response(),
        routes: [{ path: "/health" }],
      }),
    ).toContain("/health");
    expect(
      validateBunNativeHonoRoutes({
        fetch: async () => new Response(),
        routes: [{ path: "/v1/sql" }],
      }),
    ).toContain("/v1/sql");
    expect(isBunNativeReservedApiPath("/v1")).toBe(true);
  });
});
