/**
 * Bun-native `ponder serve`: existing schema + Hono `src/api` + `/v1`.
 * Requires DATABASE_URL (Postgres). Schema is created via a short `ponder start`.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rimrafSync } from "rimraf";
import {
  setupAnvil,
  setupCommon,
  setupIsolatedDatabase,
} from "@/_test/setup.js";
import { getFreePort } from "@/_test/utils.js";
import { serve } from "@/bin/commands/serve.js";
import { start } from "@/bin/commands/start.js";
import { isBunSqlDatabaseDriver } from "@/database/bunSqlDriver.js";
import { ShutdownError } from "@/internal/errors.js";
import { isBunNativeServeEnabled } from "./bunNativeServe.js";

const rootDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../_test/e2e/erc20",
);

const databaseUrl = process.env.DATABASE_URL;
const skip = typeof databaseUrl !== "string" || databaseUrl.length === 0;

if (skip) {
  test.skip("bunNativeServe e2e requires DATABASE_URL", () => {});
} else {
  describe("bunNativeServe loads Hono + /v1", () => {
    beforeAll(() => {
      rimrafSync(path.join(rootDir, ".ponder"));
      rimrafSync(path.join(rootDir, "generated"));
      setupCommon();
      setupAnvil();
    });

    afterAll(async () => {
      // Isolated DB cleanup happens via shutdown / next run.
    });

    test(
      "serves /health, Hono /hello, and /v1 after schema exists",
      async () => {
        expect(isBunNativeServeEnabled()).toBe(true);
        expect(isBunSqlDatabaseDriver()).toBe(true);

        await setupIsolatedDatabase();

        const schema = `bun_native_serve_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
        const startPort = await getFreePort();

        const ignoreShutdownRejection = (reason: unknown) => {
          if (reason instanceof ShutdownError) return;
          // Bun surfaces async indexing aborts after stop(); ignore those only.
          if (
            reason instanceof Error &&
            reason.name === "ShutdownError"
          ) {
            return;
          }
          throw reason;
        };
        process.on("unhandledRejection", ignoreShutdownRejection);

        const stopStart = await start({
          cliOptions: {
            command: "start",
            schema,
            root: rootDir,
            config: "ponder.config.ts",
            logLevel: "warn",
            logFormat: "pretty",
            port: startPort,
            version: "0.0.0",
            native: true,
          },
        });

        try {
          const deadline = Date.now() + 30_000;
          let ready = false;
          while (Date.now() < deadline) {
            try {
              const health = await fetch(
                `http://127.0.0.1:${startPort}/health`,
              );
              if (health.status === 200) {
                ready = true;
                break;
              }
            } catch {
              // server not up yet
            }
            await Bun.sleep(100);
          }
          expect(ready).toBe(true);
          // Let migrate/meta settle so serve can open the same schema.
          await Bun.sleep(500);
        } finally {
          if (typeof stopStart === "function") {
            try {
              await stopStart();
            } catch {
              // Indexing may reject with ShutdownError while draining.
            }
          }
          await Bun.sleep(500);
          process.off("unhandledRejection", ignoreShutdownRejection);
        }

        const servePort = await getFreePort();
        const stopServe = await serve({
          cliOptions: {
            command: "serve",
            schema,
            root: rootDir,
            config: "ponder.config.ts",
            logLevel: "warn",
            logFormat: "pretty",
            port: servePort,
            version: "0.0.0",
            native: true,
          },
        });

        try {
          const health = await fetch(`http://127.0.0.1:${servePort}/health`);
          expect(health.status).toBe(200);

          const hello = await fetch(`http://127.0.0.1:${servePort}/hello`);
          expect(hello.status).toBe(200);
          expect(await hello.text()).toBe("hono-ok");

          const status = await fetch(`http://127.0.0.1:${servePort}/v1/status`);
          expect(status.status).toBe(200);
          expect(await status.json()).toHaveProperty("checkpoint");

          const metrics = await fetch(`http://127.0.0.1:${servePort}/metrics`);
          expect(metrics.status).toBe(200);
        } finally {
          if (typeof stopServe === "function") {
            await stopServe();
          }
        }
      },
      { timeout: 90_000 },
    );
  });
}
