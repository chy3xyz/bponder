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
