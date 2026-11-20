# Bun.serve lifecycle spike

This spike exposes:

- `GET /health`, which returns `200 {"status":"ok"}`
- `GET /ready`, which returns `200 {"status":"ready"}` while serving
- `GET /slow?ms=...`, which `await Bun.sleep(ms)` (default 5000) then
  returns `200 {"status":"complete"}`. Used only to inspect shutdown.

## Run

Use Bun 1.4.5:

```bash
cd /Users/n0x/ws_xfinal/w3_scalfold/bponder
/Users/n0x/.bun/bin/bun run spikes/bun-serve/index.ts
```

Press Ctrl-C to send `SIGINT`. The same shutdown path handles `SIGTERM`. The
handler marks the server unready, calls `await server.stop(true)`, and prints
`Server stopped` only after that promise resolves. The process then exits
cleanly. That await can outlive the TCP close: in-flight `fetch` handlers
(including `Bun.sleep` on `/slow`) still block resolution.

## In-flight request behavior

`server.stop(true)` is a forced stop with two distinct sides. Bun 1.4.5 does
**not** drain the HTTP response to the client, but `await server.stop(true)`
still waits for in-flight `fetch` handlers to finish.

**Client (immediate cut-off).** Bun stops accepting connections and
immediately closes active TCP sockets. A pending `/slow?ms=8000` client does
not receive `{"status":"complete"}`. Observed failures were `curl: (52) Empty
reply from server` and, depending on timing, `ECONNRESET`.

**Server (await still blocked).** The `/slow` handler `await Bun.sleep(...)`
keeps running after the client is gone. `await server.stop(true)` does not
resolve until that handler returns, so `Server stopped` and process exit can
happen several seconds later even though the client already disconnected.
Verified with `/slow?ms=8000`: `SIGTERM` at ~0.8s produced an empty client
reply in ~0.7s, while the server process stayed up until ~8.2s (status 0).

To drain in-flight requests for the client as well, Bun's graceful form is
`await server.stop()` without the `true` argument. This spike deliberately
uses `true` because that is the lifecycle behavior required by the task.
`stop(true)` still does not let the process exit while `fetch` is in flight.
