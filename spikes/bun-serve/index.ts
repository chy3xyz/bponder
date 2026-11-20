const port = Number.parseInt(process.env.PORT ?? "3000", 10);

let ready = true;
let stopping = false;

const json = (body: unknown, init?: ResponseInit) =>
  Response.json(body, {
    headers: { "cache-control": "no-store" },
    ...init,
  });

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({ status: "ok" });
    }

    if (url.pathname === "/ready") {
      return ready
        ? json({ status: "ready" })
        : json({ status: "stopping" }, { status: 503 });
    }

    if (url.pathname === "/slow") {
      const delayMs = Number.parseInt(url.searchParams.get("ms") ?? "5000", 10);
      await Bun.sleep(Number.isFinite(delayMs) ? delayMs : 5000);
      return json({ status: "complete" });
    }

    return json({ error: "not found" }, { status: 404 });
  },
});

console.log(`Bun.serve lifecycle spike listening at ${server.url}`);

const stop = async (signal: NodeJS.Signals) => {
  if (stopping) return;

  stopping = true;
  ready = false;
  console.log(`${signal} received; calling server.stop(true)`);
  await server.stop(true);
  console.log("Server stopped");
};

process.on("SIGINT", (signal) => {
  void stop(signal);
});

process.on("SIGTERM", (signal) => {
  void stop(signal);
});
