import { drizzle as drizzleNodePg } from "drizzle-orm/node-postgres";
import {
  createBunSqlClient,
  isBunSqlDatabaseDriver,
  resolveBunSqlConnectionUrl,
} from "@/database/bunSqlDriver.js";
import { createQB } from "@/database/queryBuilder.js";
import type { Common } from "@/internal/common.js";
import { RetryableError } from "@/internal/errors.js";
import type { PreBuild } from "@/internal/types.js";
import { createPool, getDatabaseName } from "@/utils/pg.js";
import { createPglite } from "@/utils/pglite.js";
import type { Result } from "@/utils/result.js";
import { startClock } from "@/utils/timer.js";

/** Vite-free DB connectivity check for Bun CLI commands. */
export async function bunDatabaseDiagnostic({
  common,
  preBuild,
}: {
  common: Common;
  preBuild: PreBuild;
}): Promise<Result<void>> {
  const endClock = startClock();
  const context = {
    logger: common.logger.child({ action: "database_diagnostic" }),
  };
  const dialect = preBuild.databaseConfig.kind;

  if (dialect === "pglite" || dialect === "pglite_test") {
    const driver =
      dialect === "pglite"
        ? createPglite(preBuild.databaseConfig.options)
        : preBuild.databaseConfig.instance;
    try {
      await driver.query("SELECT version()");
    } catch (e) {
      const error = new RetryableError(
        `Failed to connect to PGlite database. Please check your database connection settings.\n\n${(e as Error).message}`,
      );
      error.stack = undefined;
      return { status: "error", error };
    } finally {
      if (dialect === "pglite") {
        await driver.close();
      }
    }

    const pgliteDir =
      dialect === "pglite"
        ? preBuild.databaseConfig.options.dataDir
        : "memory://";
    common.logger.info({
      msg: "Connected to database",
      type: dialect,
      database: pgliteDir === "memory://" ? "memory://" : pgliteDir,
      duration: endClock(),
    });
    return { status: "success", result: undefined };
  }

  if (isBunSqlDatabaseDriver()) {
    let client: ReturnType<typeof createBunSqlClient> | undefined;
    try {
      const url = resolveBunSqlConnectionUrl(
        preBuild.databaseConfig.poolConfig,
      );
      client = createBunSqlClient({
        url,
        max: 1,
        applicationName: "test",
      });
      await client.unsafe("SELECT version()");
    } catch (e) {
      const error = new RetryableError(
        `Failed to connect to database. Please check your database connection settings.\n\n${(e as Error).message}`,
      );
      error.stack = undefined;
      return { status: "error", error };
    } finally {
      await client?.close();
    }

    common.logger.info({
      msg: "Connected to database",
      type: "postgres",
      engine: "bun",
      database: getDatabaseName(preBuild.databaseConfig.poolConfig),
      duration: endClock(),
    });
    return { status: "success", result: undefined };
  }

  const pool = createPool(
    {
      ...preBuild.databaseConfig.poolConfig,
      application_name: "test",
      max: 1,
      statement_timeout: 10_000,
    },
    common.logger,
  );
  const qb = createQB(drizzleNodePg(pool), { common });
  try {
    await qb.wrap((db) => db.execute("SELECT version()"), context);
  } catch (e) {
    const error = new RetryableError(
      `Failed to connect to database. Please check your database connection settings.\n\n${(e as Error).message}`,
    );
    error.stack = undefined;
    return { status: "error", error };
  } finally {
    await pool.end();
  }

  common.logger.info({
    msg: "Connected to database",
    type: "postgres",
    database: getDatabaseName(preBuild.databaseConfig.poolConfig),
    duration: endClock(),
  });

  return { status: "success", result: undefined };
}
