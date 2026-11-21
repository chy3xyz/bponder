import { runCodegen } from "@/bin/utils/codegen.js";
import {
  BUN_NATIVE_ISOLATED_ORDERING_ERROR,
  compileBunNative,
  getPostgresConnectionString,
} from "@/build/bunNativeBuild.js";
import { createBuild } from "@/build/index.js";
import { createDatabase, type Database } from "@/database/index.js";
import type { Common } from "@/internal/common.js";
import { createLogger, type Logger } from "@/internal/logger.js";
import { MetricsService } from "@/internal/metrics.js";
import { buildOptions, type Options } from "@/internal/options.js";
import { createShutdown } from "@/internal/shutdown.js";
import type {
  ApiBuild,
  CrashRecoveryCheckpoint,
  IndexingBuild,
  NamespaceBuild,
  PreBuild,
  SchemaBuild,
} from "@/internal/types.js";
import { runMultichain } from "@/runtime/multichain.js";
import { runOmnichain } from "@/runtime/omnichain.js";
import { createServer } from "@/server/index.js";
import { isolatedController } from "../isolatedController.js";
import type { CliOptions } from "../ponder.js";
import { assertBunRuntime } from "../utils/assertBun.js";
import {
  getUnsupportedBunNativeSchema,
  isBunNativeServeEnabled,
  startBunNativeServe,
} from "../utils/bunNativeServe.js";
import { createExit } from "../utils/exit.js";

export type PonderApp = {
  common: Common;
  preBuild: PreBuild;
  namespaceBuild: NamespaceBuild;
  schemaBuild: SchemaBuild;
  indexingBuild: IndexingBuild;
  apiBuild: ApiBuild;
  crashRecoveryCheckpoint: CrashRecoveryCheckpoint;
  database: Database;
};

export async function start({
  cliOptions,
  onBuild,
}: {
  cliOptions: CliOptions;
  onBuild?: (app: PonderApp) => Promise<PonderApp>;
}) {
  const options = buildOptions({ cliOptions });

  const logger = createLogger({
    level: options.logLevel,
    mode: options.logFormat,
  });

  assertBunRuntime(logger);

  if (isBunNativeServeEnabled({ native: cliOptions.native })) {
    return startBunNative({ cliOptions, options, logger });
  }

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

  runCodegen({ common });

  const build = await createBuild({ common, cliOptions });

  // biome-ignore lint/style/useConst: `database` is assigned in later startup branches.
  let database: Database | undefined;

  const namespaceResult = build.namespaceCompile();
  if (namespaceResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "namespace",
      error: namespaceResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  const configResult = await build.executeConfig();
  if (configResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "config",
      error: configResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  const schemaResult = await build.executeSchema();
  if (schemaResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "schema",
      error: schemaResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  const preCompileResult = build.preCompile(configResult.result);

  if (preCompileResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "pre-compile",
      error: preCompileResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  const databaseDiagnostic = await build.databaseDiagnostic({
    preBuild: preCompileResult.result,
  });
  if (databaseDiagnostic.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "diagnostic",
      error: databaseDiagnostic.error,
    });
    await exit({ code: 75 });
    return;
  }

  const compileSchemaResult = build.compileSchema({
    ...schemaResult.result,
    preBuild: preCompileResult.result,
  });

  if (compileSchemaResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "schema",
      error: compileSchemaResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  const configBuildResult = build.compileConfig({
    configResult: configResult.result,
  });
  if (configBuildResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "config",
      error: configBuildResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  const rpcDiagnosticResult = await build.rpcDiagnostic({
    configBuild: configBuildResult.result,
  });
  if (rpcDiagnosticResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "diagnostic",
      error: rpcDiagnosticResult.error,
    });
    await exit({ code: 75 });
    return;
  }

  const indexingResult = await build.executeIndexingFunctions();
  if (indexingResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "indexing",
      error: indexingResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  const indexingBuildResult = await build.compileIndexing({
    configResult: configResult.result,
    schemaResult: schemaResult.result,
    indexingResult: indexingResult.result,
    configBuild: configBuildResult.result,
  });

  if (indexingBuildResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "indexing",
      error: indexingBuildResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  database = createDatabase({
    common,
    namespace: namespaceResult.result,
    preBuild: preCompileResult.result,
    schemaBuild: compileSchemaResult.result,
  });
  const crashRecoveryCheckpoint = await database.migrate({
    buildId: indexingBuildResult.result.buildId,
    chains: indexingBuildResult.result.chains,
    finalizedBlocks: indexingBuildResult.result.finalizedBlocks,
  });

  await database.migrateSync();

  const apiResult = await build.executeApi({
    preBuild: preCompileResult.result,
    configBuild: configBuildResult.result,
    database,
  });
  if (apiResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "api",
      error: apiResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  const apiBuildResult = await build.compileApi({
    apiResult: apiResult.result,
  });

  if (apiBuildResult.status === "error") {
    common.logger.error({
      msg: "Build failed",
      stage: "api",
      error: apiBuildResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  metrics.ponder_settings_info.set(
    {
      ordering: preCompileResult.result.ordering,
      database: preCompileResult.result.databaseConfig.kind,
      command: cliOptions.command,
    },
    1,
  );

  let app: PonderApp = {
    common,
    preBuild: preCompileResult.result,
    namespaceBuild: namespaceResult.result,
    schemaBuild: compileSchemaResult.result,
    indexingBuild: indexingBuildResult.result,
    apiBuild: apiBuildResult.result,
    crashRecoveryCheckpoint,
    database,
  };

  if (onBuild) {
    app = await onBuild(app);
  }

  metrics.initializeIndexingMetrics(app);

  switch (preCompileResult.result.ordering) {
    case "omnichain":
      runOmnichain(app);
      break;
    case "multichain":
      runMultichain(app);
      break;
    case "experimental_isolated": {
      isolatedController(app);
      break;
    }
  }

  createServer(app);

  return shutdown.kill;
}

async function startBunNative({
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

  const databaseUrl = getPostgresConnectionString(preBuild);
  if (databaseUrl === undefined) {
    logger.info({
      msg: "Skipped Bun-native HTTP server because DATABASE_URL is not set",
    });
    return shutdown.kill;
  }

  const unsupportedSchema = getUnsupportedBunNativeSchema({
    schema: schemaName,
  });
  if (unsupportedSchema !== undefined) {
    logger.error({
      msg: "The Bun-native 'ponder start --native' command requires a valid database schema identifier",
      schema: unsupportedSchema,
    });
    await exit({ code: 1 });
    return;
  }

  try {
    const native = await startBunNativeServe({
      url: databaseUrl,
      port: options.port,
      hostname: options.hostname,
      schema: schemaName,
    });

    logger.info(
      {
        msg: "Started Bun-native HTTP server",
        url: native.origin,
        port: native.server.port,
      },
      ["url"],
    );
    logger.info({
      msg: "Started returning 200 responses",
      endpoint: "/health",
    });

    shutdown.add(() => native.stop());
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
