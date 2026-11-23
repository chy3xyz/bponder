import { expect, test } from "bun:test";
import { type BunServer, startBunServer, stopBunServer } from "./bunServe.js";

test("serves GET /health with a 200 response", async () => {
  const server = startBunServer({ port: 0 });

  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/health`);

    expect(response.status).toBe(200);
  } finally {
    await server.stop();
  }
});

test("stops gracefully", async () => {
  const forceArguments: (boolean | undefined)[] = [];
  const server: BunServer = {
    port: 0,
    stop: async (force) => {
      forceArguments.push(force);
    },
    setFetch: () => {},
  };

  await stopBunServer(server, 10);

  expect(forceArguments).toEqual([undefined]);
});

test("forces stop after the graceful shutdown timeout", async () => {
  const forceArguments: (boolean | undefined)[] = [];
  const server: BunServer = {
    port: 0,
    stop: (force) => {
      forceArguments.push(force);
      return force === true ? Promise.resolve() : new Promise(() => {});
    },
    setFetch: () => {},
  };

  await stopBunServer(server, 10);

  expect(forceArguments).toEqual([undefined, true]);
});

test("setFetch swaps the active handler without rebinding the port", async () => {
  const server = startBunServer({
    port: 0,
    fetch: () => new Response("one"),
  });

  try {
    const port = server.port;
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe("one");
    server.setFetch(() => new Response("two"));
    expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe("two");
    expect(server.port).toBe(port);
  } finally {
    await server.stop();
  }
});
