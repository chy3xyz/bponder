/**
 * Bun.Worker entry for isolated indexing (Vite-free).
 *
 * Uses compileBunNative (Bun import + plugin) instead of createBuild/Vite.
 * Messages:
 *   parent → worker: `{ type: "kill" }` | `{ type: "ping" }`
 *   worker → parent: `{ type: "ready" | "done", chainId }`, `{ type: "done" }`,
 *     `{ type: "error" }`, `{ type: "pong", worker: "bun" }`
 *
 * Initial payload: `Worker.data` (Bun's workerData equivalent).
 */

import { compileBunNative } from "@/build/bunNativeBuild.js";
import { createDatabase } from "@/database/index.js";
import type { Common } from "@/internal/common.js";
import { createLogger } from "@/internal/logger.js";
import { IsolatedMetricsService } from "@/internal/metrics.js";
import { createShutdown } from "@/internal/shutdown.js";
import type {
  CrashRecoveryCheckpoint,
  NamespaceBuild,
} from "@/internal/types.js";
import { runIsolated } from "@/runtime/isolated.js";

declare const self: Worker;

type Incoming = { type: "kill" } | { type: "ping" };

type IsolatedWorkerData = {
  options: Common["options"];
  namespaceBuild: NamespaceBuild;
  crashRecoveryCheckpoint: CrashRecoveryCheckpoint;
  chainIds: number[];
  cliOptions?: unknown;
};

const post = (message: unknown) => {
  self.postMessage(message);
};

const workerData = (Worker as unknown as { data: IsolatedWorkerData }).data;

async function run() {
  const { options, namespaceBuild, crashRecoveryCheckpoint, chainIds } =
    workerData;

  const logger = createLogger({
    level: options.logLevel,
    mode: options.logFormat,
  });

  const metrics = new IsolatedMetricsService();
  const shutdown = createShutdown();
  const common = {
    options,
    logger,
    metrics,
    shutdown,
    buildShutdown: shutdown,
    apiShutdown: shutdown,
  };

  let isKilled = false;
  self.onmessage = async (event: MessageEvent<Incoming>) => {
    const message = event.data;

    if (message?.type === "ping") {
      post({ type: "pong", worker: "bun" });
      return;
    }

    if (message?.type === "kill") {
      if (isKilled) return;
      isKilled = true;
      await shutdown.kill();
    }
  };

  globalThis.PONDER_NAMESPACE_BUILD = namespaceBuild;

  const buildResult = await compileBunNative({
    common,
    schema: namespaceBuild.schema,
    viewsSchema: namespaceBuild.viewsSchema,
  });
  if (buildResult.status === "error") {
    throw buildResult.error;
  }

  const { preBuild, schemaBuild, indexingBuild: fullIndexingBuild } =
    buildResult.result;

  options.indexingCacheMaxBytes = Math.floor(
    options.indexingCacheMaxBytes / fullIndexingBuild.chains.length,
  );
  options.rpcMaxConcurrency = Math.floor(
    options.rpcMaxConcurrency / fullIndexingBuild.chains.length,
  );
  options.syncEventsQuerySize = Math.floor(
    options.syncEventsQuerySize / fullIndexingBuild.chains.length,
  );

  const database = createDatabase({
    common,
    namespace: namespaceBuild,
    preBuild,
    schemaBuild,
  });

  await Promise.all(
    chainIds.map(async (chainId) => {
      const chainIndex = fullIndexingBuild.chains.findIndex(
        (c) => c.id === chainId,
      );

      const indexingBuild = {
        ...fullIndexingBuild,
        chains: [fullIndexingBuild.chains[chainIndex]!],
        rpcs: [fullIndexingBuild.rpcs[chainIndex]!],
        finalizedBlocks: [fullIndexingBuild.finalizedBlocks[chainIndex]!],
        eventCallbacks: [fullIndexingBuild.eventCallbacks[chainIndex]!],
        setupCallbacks: [fullIndexingBuild.setupCallbacks[chainIndex]!],
        contracts: [fullIndexingBuild.contracts[chainIndex]!],
      };

      common.metrics.initializeIndexingMetrics({
        indexingBuild,
        schemaBuild,
      });

      await runIsolated({
        common,
        preBuild,
        namespaceBuild,
        schemaBuild,
        indexingBuild,
        crashRecoveryCheckpoint,
        database,
        onReady: () => {
          post({ type: "ready", chainId });
        },
      });

      post({ type: "done", chainId });
    }),
  );

  post({ type: "done" });
}

try {
  // Handshake-only path when no worker data was provided (unit tests).
  if (workerData == null) {
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
  } else {
    await run();
  }
} catch (err) {
  const error = err as Error;
  post({
    type: "error",
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  });
}
