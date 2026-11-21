import {
  BUN_NATIVE_ISOLATED_ORDERING_ERROR,
  compileBunNative,
} from "@/build/bunNativeBuild.js";
import { createDatabase, type Database } from "@/database/index.js";
import type { Logger } from "@/internal/logger.js";
import { MetricsService } from "@/internal/metrics.js";
import type { Options } from "@/internal/options.js";
import { createShutdown } from "@/internal/shutdown.js";
import { runMultichain } from "@/runtime/multichain.js";
import { runOmnichain } from "@/runtime/omnichain.js";
import { startBunServer, stopBunServer } from "@/server/bunServe.js";
import { createBunV1ApiFetch } from "@/server/bunV1Api.js";
import { createBunV1HandlersFromReadonlyQB } from "@/server/bunV1Readonly.js";
import type { CliOptions } from "../ponder.js";
import { formatBunNativeOrigin } from "./bunNativeServe.js";
import { createExit } from "./exit.js";

/** Shared Bun-native `ponder start` / `ponder dev` indexing + `/v1` path. */
export async function runBunNativeApp({
  cliOptions,
  options,
  logger,
}: {
  cliOptions: CliOptions;
  options: Options;
  logger: Logger;
}) {
  const metrics = new MetricsService();
  const shutdown = createShutdown();
  const common = {
    options,
    logger,
    metrics,
    shutdown,
    buildShutdown: shutdown,
    apiShutdown: shutdown,
  };
  const exit = createExit({ common, options });

  if (options.version) {
    metrics.ponder_version_info.set(
      {
        version: options.version.version,
        major: options.version.major,
        minor: options.version.minor,
        patch: options.version.patch,
      },
      1,
    );
  }

  const schemaName = cliOptions.schema ?? process.env.DATABASE_SCHEMA;
  const viewsSchema =
    cliOptions.viewsSchema ?? process.env.DATABASE_VIEWS_SCHEMA;

  const buildResult = await compileBunNative({
    common,
    schema: schemaName,
    viewsSchema,
  });
  if (buildResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "native",
      error: buildResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  const { preBuild, namespaceBuild, schemaBuild, indexingBuild } =
    buildResult.result;

  logger.info(
    {
      msg: "Loaded Bun-native config",
      chains: indexingBuild.chains.map((chain) => chain.name),
      ordering: preBuild.ordering,
    },
    ["chains"],
  );
  logger.info(
    {
      msg: "Loaded Bun-native indexing functions",
      events: indexingBuild.indexingFunctions.map((entry) => entry.name),
    },
    ["events"],
  );

  let database: Database;
  try {
    database = createDatabase({
      common,
      namespace: namespaceBuild,
      preBuild,
      schemaBuild,
    });
    const crashRecoveryCheckpoint = await database.migrate({
      buildId: indexingBuild.buildId,
      chains: indexingBuild.chains,
      finalizedBlocks: indexingBuild.finalizedBlocks,
    });
    await database.migrateSync();

    metrics.ponder_settings_info.set(
      {
        ordering: preBuild.ordering,
        database: preBuild.databaseConfig.kind,
        command: cliOptions.command,
      },
      1,
    );
    metrics.initializeIndexingMetrics({ indexingBuild, schemaBuild });

    switch (preBuild.ordering) {
      case "omnichain":
        runOmnichain({
          common,
          preBuild,
          namespaceBuild,
          schemaBuild,
          indexingBuild,
          crashRecoveryCheckpoint,
          database,
        });
        break;
      case "multichain":
        runMultichain({
          common,
          preBuild,
          namespaceBuild,
          schemaBuild,
          indexingBuild,
          crashRecoveryCheckpoint,
          database,
        });
        break;
      case "experimental_isolated":
        throw new Error(BUN_NATIVE_ISOLATED_ORDERING_ERROR);
    }
  } catch (error) {
    common.logger.error({
      msg: "Failed to start Bun-native indexing",
      error: error instanceof Error ? error : new Error(String(error)),
    });
    await exit({ code: 1 });
    return;
  }

  try {
    const { getStatus, executeSql } = createBunV1HandlersFromReadonlyQB(
      database.readonlyQB,
    );
    const server = startBunServer({
      fetch: createBunV1ApiFetch({ getStatus, executeSql }),
      hostname: options.hostname,
      port: options.port,
    });
    const origin = formatBunNativeOrigin({
      hostname: options.hostname,
      port: server.port,
    });

    logger.info(
      {
        msg: "Started Bun-native HTTP server",
        url: origin,
        port: server.port,
      },
      ["url"],
    );
    logger.info({
      msg: "Started returning 200 responses",
      endpoint: "/health",
    });

    shutdown.add(() => stopBunServer(server));
    return shutdown.kill;
  } catch (error) {
    logger.error({
      msg: "Failed to start Bun-native HTTP server",
      error: error instanceof Error ? error : new Error(String(error)),
    });
    await exit({ code: 1 });
    return;
  }
}
