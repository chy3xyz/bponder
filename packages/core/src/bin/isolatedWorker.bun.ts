/**
 * Bun.Worker entry for isolated indexing.
 *
 * Parity with isolatedWorker.ts: createBuild → createDatabase → runIsolated
 * per chainId. Messages:
 *   parent → worker: `{ type: "kill" }`
 *   worker → parent: `{ type: "ready" | "done", chainId }`, `{ type: "error" }`,
 *   plus a test ping: `{ type: "ping" }` → `{ type: "pong", worker: "bun" }`.
 *
 * Initial payload comes from `Worker.data` (Bun's workerData equivalent).
 * Uses the same Vite-backed createBuild as the Node worker so protocol and
 * indexing stay shared; Bun-native compile without Vite is a follow-up.
 */

import { createBuild } from "@/build/index.js";
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
  cliOptions: unknown;
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

  const build = await createBuild({
    common,
    cliOptions: workerData.cliOptions as Parameters<
      typeof createBuild
    >[0]["cliOptions"],
  });

  globalThis.PONDER_NAMESPACE_BUILD = namespaceBuild;

  const configResult = await build.executeConfig();
  if (configResult.status === "error") {
    throw configResult.error;
  }

  const schemaResult = await build.executeSchema();
  if (schemaResult.status === "error") {
    throw schemaResult.error;
  }
  const preBuildResult = build.preCompile(configResult.result);
  if (preBuildResult.status === "error") {
    throw preBuildResult.error;
  }

  const schemaBuildResult = build.compileSchema({
    ...schemaResult.result,
    preBuild: preBuildResult.result,
  });
  if (schemaBuildResult.status === "error") {
    throw schemaBuildResult.error;
  }

  const configBuildResult = build.compileConfig({
    configResult: configResult.result,
  });
  if (configBuildResult.status === "error") {
    throw configBuildResult.error;
  }

  const indexingResult = await build.executeIndexingFunctions();
  if (indexingResult.status === "error") {
    throw indexingResult.error;
  }

  const indexingBuildResult = await build.compileIndexing({
    configResult: configResult.result,
    schemaResult: schemaResult.result,
    indexingResult: indexingResult.result,
    configBuild: configBuildResult.result,
  });
  if (indexingBuildResult.status === "error") {
    throw indexingBuildResult.error;
  }

  options.indexingCacheMaxBytes = Math.floor(
    options.indexingCacheMaxBytes / indexingBuildResult.result.chains.length,
  );
  options.rpcMaxConcurrency = Math.floor(
    options.rpcMaxConcurrency / indexingBuildResult.result.chains.length,
  );
  options.syncEventsQuerySize = Math.floor(
    options.syncEventsQuerySize / indexingBuildResult.result.chains.length,
  );

  const database = createDatabase({
    common,
    namespace: namespaceBuild,
    preBuild: preBuildResult.result,
    schemaBuild: schemaBuildResult.result,
  });

  await Promise.all(
    chainIds.map(async (chainId) => {
      const chainIndex = indexingBuildResult.result.chains.findIndex(
        (c) => c.id === chainId,
      );

      const indexingBuild = {
        ...indexingBuildResult.result,
        chains: [indexingBuildResult.result.chains[chainIndex]!],
        rpcs: [indexingBuildResult.result.rpcs[chainIndex]!],
        finalizedBlocks: [
          indexingBuildResult.result.finalizedBlocks[chainIndex]!,
        ],
        eventCallbacks: [
          indexingBuildResult.result.eventCallbacks[chainIndex]!,
        ],
        setupCallbacks: [
          indexingBuildResult.result.setupCallbacks[chainIndex]!,
        ],
        contracts: [indexingBuildResult.result.contracts[chainIndex]!],
      };

      common.metrics.initializeIndexingMetrics({
        indexingBuild,
        schemaBuild: schemaBuildResult.result,
      });

      await runIsolated({
        common,
        preBuild: preBuildResult.result,
        namespaceBuild,
        schemaBuild: schemaBuildResult.result,
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
