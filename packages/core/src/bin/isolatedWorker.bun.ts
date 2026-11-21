/**
 * Bun.Worker entry for isolated indexing.
 *
 * Speaks the controller handshake used by isolatedWorker.ts:
 *   parent → worker: `{ type: "kill" }`
 *   worker → parent: `{ type: "done" }`
 * plus a test ping: `{ type: "ping" }` → `{ type: "pong", worker: "bun" }`.
 *
 * TODO: full runIsolated parity with isolatedWorker.ts (createBuild, database,
 * per-chain `{ type: "ready" | "done", chainId }`, `{ type: "error" }`, and
 * IsolatedMetricsService GET_METRICS over the same port). Until that lands,
 * multi-thread isolated indexing under Bun.Worker does not index events.
 */

declare const self: Worker;

type Incoming = { type: "kill" } | { type: "ping" };

const post = (message: unknown) => {
  self.postMessage(message);
};

self.onmessage = (event: MessageEvent<Incoming>) => {
  const message = event.data;

  if (message?.type === "ping") {
    post({ type: "pong", worker: "bun" });
    return;
  }

  if (message?.type === "kill") {
    post({ type: "done" });
  }
};
