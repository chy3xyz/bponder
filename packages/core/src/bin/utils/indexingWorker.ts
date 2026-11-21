import path from "node:path";
import { fileURLToPath } from "node:url";
import { Worker as NodeWorker } from "node:worker_threads";
import { isBunRuntime } from "./assertBun.js";

export type IndexingWorkerOptions = {
  workerData?: unknown;
  data?: unknown;
};

export type IndexingWorkerHandle = {
  threadId: number;
  postMessage: (message: unknown) => void;
  on: (
    event: "message" | "error" | "exit",
    listener: (arg: any) => void,
  ) => void;
  terminate: () => void | Promise<number>;
};

let nextBunThreadId = 1;

export function getIndexingWorkerEntryUrl(): string {
  if (isBunRuntime()) {
    return new URL("../isolatedWorker.bun.ts", import.meta.url).href;
  }

  return path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../isolatedWorker.js",
  );
}

export function createIndexingWorker(
  filename: string = getIndexingWorkerEntryUrl(),
  options: IndexingWorkerOptions = {},
): IndexingWorkerHandle {
  if (isBunRuntime()) {
    return wrapBunWorker(filename, options);
  }

  return wrapNodeWorker(filename, options);
}

function wrapBunWorker(
  filename: string,
  options: IndexingWorkerOptions,
): IndexingWorkerHandle {
  const workerData = options.data ?? options.workerData;
  // Global `Worker` is Bun's Worker API (not node:worker_threads).
  const worker = new Worker(filename, {
    ref: true,
    data: workerData,
  } as WorkerOptions);

  const threadId = nextBunThreadId++;
  const messageListeners: Array<(message: unknown) => void> = [];
  const errorListeners: Array<(error: Error) => void> = [];
  const exitListeners: Array<(code: number) => void> = [];

  worker.addEventListener("message", (event: MessageEvent) => {
    for (const listener of messageListeners) listener(event.data);
  });
  worker.addEventListener("error", (event: ErrorEvent) => {
    const error =
      event.error instanceof Error ? event.error : new Error(event.message);
    for (const listener of errorListeners) listener(error);
  });

  return {
    threadId,
    postMessage: (message) => worker.postMessage(message),
    on(event, listener) {
      if (event === "message") messageListeners.push(listener);
      else if (event === "error") errorListeners.push(listener);
      else exitListeners.push(listener);
    },
    terminate: () => worker.terminate(),
  };
}

function wrapNodeWorker(
  filename: string,
  options: IndexingWorkerOptions,
): IndexingWorkerHandle {
  const worker = new NodeWorker(filename, {
    workerData: options.workerData ?? options.data,
  });

  return {
    threadId: worker.threadId,
    postMessage: (message) => worker.postMessage(message),
    on(event, listener) {
      worker.on(event, listener);
    },
    terminate: () => worker.terminate(),
  };
}
