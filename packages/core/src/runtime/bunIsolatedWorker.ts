import {
  type BunIsolatedEvent,
  computeBunIsolatedRows,
} from "./bunIsolatedWorkers.js";

type WorkerRequest =
  | { type: "ping"; requestId: number }
  | { type: "batch"; requestId: number; events: BunIsolatedEvent[] };

declare const self: Worker;

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;

  if (message.type === "ping") {
    self.postMessage({
      type: "pong",
      requestId: message.requestId,
      worker: "bun",
    });
    return;
  }

  const { rows, checkpoint } = computeBunIsolatedRows(message.events);
  self.postMessage({
    type: "batchResult",
    requestId: message.requestId,
    rows,
    checkpoint,
  });
};
