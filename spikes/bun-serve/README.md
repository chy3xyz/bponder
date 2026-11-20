# Bun.serve lifecycle spike

This spike exposes:

- `GET /health`, which returns `200 {"status":"ok"}`
- `GET /ready`, which returns `200 {"status":"ready"}` while serving
- `GET /slow?ms=5000`, a delayed response used only to inspect shutdown
  behavior

## Run

Use Bun 1.4.5:

```bash
cd /Users/n0x/ws_xfinal/w3_scalfold/bponder
/Users/n0x/.bun/bin/bun run spikes/bun-serve/index.ts
```

Press Ctrl-C to send `SIGINT`. The same shutdown path handles `SIGTERM`. The
handler marks the server unready, calls `server.stop(true)`, waits for it to
resolve, and prints `Server stopped` before the process exits cleanly.

## In-flight request behavior

`server.stop(true)` is a forced stop. Bun 1.4.5 stops accepting connections
and immediately closes active connections, so it does **not** drain in-flight
requests. This was verified by starting `/slow?ms=5000`, sending `SIGTERM`
while that request was pending, and observing that the client failed without
receiving a response while the server exited with status 0.

To drain in-flight requests, Bun's graceful form is `await server.stop()`
without the `true` argument. This spike deliberately uses `true` because that
is the lifecycle behavior required by the task.
