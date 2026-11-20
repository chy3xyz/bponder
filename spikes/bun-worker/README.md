# Bun.Worker message-boundary spike

This spike uses Bun's Web Worker API directly, without `node:worker_threads`.
The main thread sends a ping followed by 1,000 fake events, and the worker
returns results that are checked for count, order, identity, and payload shape.

## Run

Use Bun 1.4.5:

```bash
cd /Users/n0x/ws_xfinal/w3_scalfold/bponder
/Users/n0x/.bun/bin/bun run spikes/bun-worker/main.ts
```

The command prints one `[PASS]` line and exits zero when the protocol checks
succeed.

## Payload and transfer limits

Bun Worker messages use the HTML Structured Clone Algorithm. This spike
verified round trips for `Date`, `Uint8Array`, `Map`, nested objects, and a
16 MiB binary payload. The sender's `Uint8Array` remained attached, confirming
that the protocol currently uses cloning rather than ownership transfer.

Bun does not document a fixed maximum Worker message size. The 16 MiB check is
therefore a verified lower bound, not a claimed maximum; practical batch size
is constrained by serialization cost and transient memory because the payload
is cloned in both directions. Functions and streams are not structured-clone
payloads, and transferable streams are unsupported. Phase 1 should keep batch
sizes configurable and benchmark them with production-shaped events.

## Recommendation

**GO for Phase 1.** Bun 1.4.5 preserves event ordering and the structured
payload types needed at the Worker boundary. Together with the acceptable SQL
transaction and `Bun.serve` lifecycle spikes, no Phase 0 blocker was found.
Phase 1 should not assume zero-copy transfer or an unlimited message size.
