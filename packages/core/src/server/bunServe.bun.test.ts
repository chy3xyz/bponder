import { expect, test } from "bun:test";
import { startBunServer } from "./bunServe.js";

test("serves GET /health with a 200 response", async () => {
  const server = startBunServer({ port: 0 });

  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/health`);

    expect(response.status).toBe(200);
  } finally {
    await server.stop();
  }
});
