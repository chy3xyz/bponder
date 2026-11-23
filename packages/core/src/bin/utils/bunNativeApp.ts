import { eq } from "drizzle-orm";
import { compileBunNative, loadBunApiApp } from "@/build/bunNativeBuild.js";
import { createDatabase, type Database, SCHEMATA } from "@/database/index.js";
import type { Logger } from "@/internal/logger.js";
import { MetricsService } from "@/internal/metrics.js";
import type { Options } from "@/internal/options.js";
import { createShutdown } from "@/internal/shutdown.js";
import { runMultichain } from "@/runtime/multichain.js";
import { runOmnichain } from "@/runtime/omnichain.js";
import {
  type BunHonoLike,
  createBunNativeHttpFetch,
} from "@/server/bunNativeHttp.js";
import { createBunNativeHttpOps } from "@/server/bunNativeHttpOps.js";
import {
  type BunFetchHandler,
  startBunServer,
  stopBunServer,
} from "@/server/bunServe.js";
import { createBunV1ApiFetch } from "@/server/bunV1Api.js";
import { createBunV1HandlersFromReadonlyQB } from "@/server/bunV1Readonly.js";
import { isolatedController } from "../isolatedController.js";
import type { CliOptions } from "../ponder.js";
import {
  reloadBunNativeApiApp,
  startBunNativeDevWatcher,
} from "./bunNativeDevReload.js";
import {
  formatBunNativeOrigin,
  getUnsupportedBunNativeSchema,
} from "./bunNativeServe.js";
import { createExit } from "./exit.js";

const composeFetch = ({
  v1Fetch,
  honoApp,
  ops,
}: {
  v1Fetch: BunFetchHandler;
  honoApp?: BunHonoLike;
  ops: ReturnType<typeof createBunNativeHttpOps>;
}) => createBunNativeHttpFetch({ v1Fetch, honoApp, ops });

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
        isolatedController({
          common,
          preBuild,
          namespaceBuild,
          schemaBuild,
          indexingBuild,
          crashRecoveryCheckpoint,
          database,
        });
        break;
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
    const apiResult = await loadBunApiApp({
      apiFile: common.options.apiFile,
      common,
      database,
      indexingBuild,
      preBuild,
      namespaceBuild,
    });
    if (apiResult.status === "error") {
      common.logger.error({
        msg: "Failed to load Bun-native Hono API",
        error: apiResult.error,
      });
      await exit({ code: 1 });
      return;
    }

    const { getStatus, executeSql } = createBunV1HandlersFromReadonlyQB(
      database.readonlyQB,
    );
    const v1Fetch = createBunV1ApiFetch({ getStatus, executeSql });
    const ops = createBunNativeHttpOps({ metrics, database });
    const honoApp: BunHonoLike | undefined = apiResult.result.app;

    const server = startBunServer({
      fetch: composeFetch({ v1Fetch, honoApp, ops }),
      hostname: options.hostname,
      port: options.port,
    });
    metrics.port = server.port;
    const origin = formatBunNativeOrigin({
      hostname: options.hostname,
      port: server.port,
    });

    logger.info(
      {
        msg: "Started Bun-native HTTP server",
        url: origin,
        port: server.port,
        hono: honoApp !== undefined,
      },
      ["url"],
    );
    logger.info({
      msg: "Started returning 200 responses",
      endpoint: "/health",
    });
    logger.info({
      msg: "Started returning ready and metrics responses",
      endpoints: ["/ready", "/metrics", "/status"],
    });
    if (honoApp !== undefined) {
      logger.info({
        msg: "Mounted Hono API from src/api on Bun.serve",
      });
    }

    if (cliOptions.command === "dev") {
      let apiReloadInFlight = false;
      let apiReloadQueued = false;
      const runApiReload = () => {
        if (apiReloadInFlight) {
          apiReloadQueued = true;
          return;
        }
        apiReloadInFlight = true;
        void reloadBunNativeApiApp({
          apiFile: common.options.apiFile,
          common,
          database,
          indexingBuild,
          preBuild,
          namespaceBuild,
          logger,
          composeFetch: (nextHono) =>
            composeFetch({ v1Fetch, honoApp: nextHono, ops }),
          setFetch: server.setFetch,
        }).finally(() => {
          apiReloadInFlight = false;
          if (apiReloadQueued) {
            apiReloadQueued = false;
            runApiReload();
          }
        });
      };
      const stopWatcher = startBunNativeDevWatcher({
        options,
        logger,
        onReload: (kind) => {
          if (kind === "indexing") {
            logger.warn({
              msg: "Bun-native indexing source changed; restart `ponder dev` to apply (API-only hot reload is supported)",
            });
            return;
          }
          runApiReload();
        },
      });
      shutdown.add(stopWatcher);
    }

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

/** Bun-native `ponder serve`: existing schema + `/v1` + optional Hono `src/api` (no indexing). */
export async function runBunNativeServe({
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
  const unsupportedSchema = getUnsupportedBunNativeSchema({
    schema: schemaName,
  });
  if (unsupportedSchema !== undefined) {
    logger.error({
      msg: "The Bun-native 'ponder serve' command requires a valid database schema identifier",
      schema: unsupportedSchema,
    });
    await exit({ code: 1 });
    return;
  }

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

  if (preBuild.databaseConfig.kind === "pglite") {
    common.logger.error({
      msg: "The 'ponder serve' command does not support PGlite",
    });
    await exit({ code: 1 });
    return;
  }

  let database: Database;
  try {
    database = createDatabase({
      common,
      namespace: namespaceBuild,
      preBuild,
      schemaBuild,
    });

    const schemaExists = await database.adminQB
      .wrap((db) =>
        db
          .select()
          .from(SCHEMATA)
          .where(eq(SCHEMATA.schemaName, namespaceBuild.schema)),
      )
      .then((res) => res.length > 0);

    if (schemaExists === false) {
      common.logger.error({
        msg: "Schema does not exist.",
        schema: namespaceBuild.schema,
      });
      await exit({ code: 1 });
      return;
    }

    metrics.ponder_settings_info.set(
      {
        database: preBuild.databaseConfig.kind,
        command: cliOptions.command,
      },
      1,
    );
  } catch (error) {
    common.logger.error({
      msg: "Failed to open Bun-native database for serve",
      error: error instanceof Error ? error : new Error(String(error)),
    });
    await exit({ code: 1 });
    return;
  }

  try {
    const apiResult = await loadBunApiApp({
      apiFile: common.options.apiFile,
      common,
      database,
      indexingBuild,
      preBuild,
      namespaceBuild,
    });
    if (apiResult.status === "error") {
      common.logger.error({
        msg: "Failed to load Bun-native Hono API",
        error: apiResult.error,
      });
      await exit({ code: 1 });
      return;
    }

    const { getStatus, executeSql } = createBunV1HandlersFromReadonlyQB(
      database.readonlyQB,
    );
    const v1Fetch = createBunV1ApiFetch({ getStatus, executeSql });
    const ops = createBunNativeHttpOps({ metrics, database });
    const server = startBunServer({
      fetch: composeFetch({
        v1Fetch,
        honoApp: apiResult.result.app,
        ops,
      }),
      hostname: options.hostname,
      port: options.port,
    });
    metrics.port = server.port;
    const origin = formatBunNativeOrigin({
      hostname: options.hostname,
      port: server.port,
    });

    logger.info(
      {
        msg: "Started Bun-native HTTP server",
        url: origin,
        port: server.port,
        hono: apiResult.result.app !== undefined,
      },
      ["url"],
    );
    logger.info({
      msg: "Started returning 200 responses",
      endpoint: "/health",
    });
    logger.info({
      msg: "Started returning ready and metrics responses",
      endpoints: ["/ready", "/metrics", "/status"],
    });
    if (apiResult.result.app !== undefined) {
      logger.info({
        msg: "Mounted Hono API from src/api on Bun.serve",
      });
    }

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
