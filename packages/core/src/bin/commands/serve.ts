import { eq } from "drizzle-orm";
import { createBuild } from "@/build/index.js";
import { createDatabase, SCHEMATA } from "@/database/index.js";
import { createLogger, type Logger } from "@/internal/logger.js";
import { MetricsService } from "@/internal/metrics.js";
import { buildOptions, type Options } from "@/internal/options.js";
import { createShutdown } from "@/internal/shutdown.js";
import { createServer } from "@/server/index.js";
import type { CliOptions } from "../ponder.js";
import { assertBunRuntime } from "../utils/assertBun.js";
import {
  getUnsupportedBunNativeSchema,
  isBunNativeServeEnabled,
  startBunNativeServe,
} from "../utils/bunNativeServe.js";
import { createExit } from "../utils/exit.js";

export async function serve({ cliOptions }: { cliOptions: CliOptions }) {
  const options = buildOptions({ cliOptions });

  const logger = createLogger({
    level: options.logLevel,
    mode: options.logFormat,
  });

  assertBunRuntime(logger);

  if (isBunNativeServeEnabled({ native: cliOptions.native })) {
    return serveBunNative({ cliOptions, options, logger });
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

  const build = await createBuild({ common, cliOptions });

  const exit = createExit({ common, options });
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

  if (preCompileResult.result.databaseConfig.kind === "pglite") {
    common.logger.error({
      msg: "The 'ponder serve' command does not support PGlite",
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
      stage: "indexing",
      error: configBuildResult.error,
    });
    await exit({ code: 1 });
    return;
  }

  // Note: RPC diagnostic is skipped

  const database = createDatabase({
    common,
    namespace: namespaceResult.result,
    preBuild: preCompileResult.result,
    schemaBuild: compileSchemaResult.result,
  });

  const schemaExists = await database.adminQB
    .wrap((db) =>
      db
        .select()
        .from(SCHEMATA)
        .where(eq(SCHEMATA.schemaName, namespaceResult.result.schema)),
    )
    .then((res) => res.length > 0);

  if (schemaExists === false) {
    common.logger.error({
      msg: "Schema does not exist.",
      schema: namespaceResult.result.schema,
    });
    await exit({ code: 1 });
    return;
  }

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
      database: preCompileResult.result.databaseConfig.kind,
      command: cliOptions.command,
    },
    1,
  );

  createServer({ common, database, apiBuild: apiBuildResult.result });

  return shutdown.kill;
}

async function serveBunNative({
  cliOptions,
  options,
  logger,
}: {
  cliOptions: CliOptions;
  options: Options;
  logger: Logger;
}) {
  const shutdown = createShutdown();
  const exit = createExit({
    common: {
      logger,
      shutdown,
      buildShutdown: shutdown,
      apiShutdown: shutdown,
    },
    options,
  });

  const schema = cliOptions.schema ?? process.env.DATABASE_SCHEMA;
  const unsupportedSchema = getUnsupportedBunNativeSchema({ schema });
  if (unsupportedSchema !== undefined) {
    logger.error({
      msg: "The Bun-native 'ponder serve --native' command requires a valid database schema identifier",
      schema: unsupportedSchema,
    });
    await exit({ code: 1 });
    return;
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    logger.error({
      msg: "The Bun-native 'ponder serve --native' command requires DATABASE_URL",
    });
    await exit({ code: 1 });
    return;
  }

  try {
    const native = await startBunNativeServe({
      url: databaseUrl,
      port: options.port,
      hostname: options.hostname,
      schema,
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
