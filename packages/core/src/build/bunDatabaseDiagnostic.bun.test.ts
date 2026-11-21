import { expect, test } from "bun:test";
import { createLogger } from "@/internal/logger.js";
import { MetricsService } from "@/internal/metrics.js";
import { buildOptions } from "@/internal/options.js";
import { createShutdown } from "@/internal/shutdown.js";
import { bunDatabaseDiagnostic } from "./bunDatabaseDiagnostic.js";

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

test("bunDatabaseDiagnostic rejects missing connection string under Bun.SQL", async () => {
  const previous = process.env.PONDER_DATABASE_DRIVER;
  process.env.PONDER_DATABASE_DRIVER = "bun";
  try {
    const shutdown = createShutdown();
    const common = {
      options: buildOptions({
        cliOptions: {
          command: "list",
          config: "",
          root: "",
          logLevel: "silent",
          logFormat: "pretty",
          version: "0.0.0",
        },
      }),
      logger: createLogger({ level: "silent" }),
      metrics: new MetricsService(),
      shutdown,
      apiShutdown: shutdown,
      buildShutdown: shutdown,
    };

    const result = await bunDatabaseDiagnostic({
      common,
      preBuild: {
        databaseConfig: {
          kind: "postgres",
          poolConfig: { max: 1 },
        },
        ordering: "omnichain",
      },
    });
    expect(result.status).toBe("error");
  } finally {
    if (previous === undefined) {
      delete process.env.PONDER_DATABASE_DRIVER;
    } else {
      process.env.PONDER_DATABASE_DRIVER = previous;
    }
  }
});

if (skip) {
  test.skip("bunDatabaseDiagnostic requires DATABASE_URL", () => {});
} else {
  test("bunDatabaseDiagnostic connects with Bun.SQL", async () => {
    const shutdown = createShutdown();
    const common = {
      options: buildOptions({
        cliOptions: {
          command: "list",
          config: "",
          root: "",
          logLevel: "silent",
          logFormat: "pretty",
          version: "0.0.0",
        },
      }),
      logger: createLogger({ level: "silent" }),
      metrics: new MetricsService(),
      shutdown,
      apiShutdown: shutdown,
      buildShutdown: shutdown,
    };

    const result = await bunDatabaseDiagnostic({
      common,
      preBuild: {
        databaseConfig: {
          kind: "postgres",
          poolConfig: { connectionString: url, max: 1 },
        },
        ordering: "omnichain",
      },
    });
    expect(result.status).toBe("success");
  });
}
