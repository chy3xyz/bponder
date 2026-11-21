import { expect, test } from "bun:test";
import { isBunRuntime } from "./assertBun.js";
import {
  createIndexingWorker,
  getIndexingWorkerEntryUrl,
} from "./indexingWorker.js";

test("spawns a Bun indexing worker and completes kill/done handshake", async () => {
  expect(isBunRuntime()).toBe(true);
  expect(getIndexingWorkerEntryUrl()).toContain("isolatedWorker.bun.ts");

  const worker = createIndexingWorker();
  const messages: Array<{ type: string; worker?: string }> = [];

  try {
    const done = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error("kill/done handshake timed out")),
        5_000,
      );
      worker.on("message", (message: { type: string; worker?: string }) => {
        messages.push(message);
        if (message.type === "done") {
          clearTimeout(timeout);
          resolve();
        }
      });
      worker.on("error", (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    worker.postMessage({ type: "ping" });
    worker.postMessage({ type: "kill" });
    await done;

    expect(messages).toContainEqual({ type: "pong", worker: "bun" });
    expect(messages).toContainEqual({ type: "done" });
  } finally {
    worker.terminate();
  }
});
