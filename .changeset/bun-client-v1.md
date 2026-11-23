---
"bponder-client": patch
---

Rewrote `bponder-client` to query the Bun `/v1` HTTP contract with `createClient({ url })`, `getStatus`, `sql`/`query`, and live SSE status updates.
