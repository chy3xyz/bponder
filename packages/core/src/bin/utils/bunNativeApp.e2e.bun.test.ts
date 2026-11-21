/**
 * Production closed-loop smoke: ponder start (Bun-native) → index → /v1.
 * Requires DATABASE_URL (Postgres) and the Anvil proxy from bunfig preload.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { rimrafSync } from "rimraf";
import { parseEther, zeroAddress } from "viem";
import { ALICE } from "@/_test/constants.js";
import {
  setupAnvil,
  setupCommon,
  setupIsolatedDatabase,
} from "@/_test/setup.js";
import { deployErc20, mintErc20 } from "@/_test/simulate.js";
import { getFreePort } from "@/_test/utils.js";
import { start } from "@/bin/commands/start.js";
import { isBunSqlDatabaseDriver } from "@/database/bunSqlDriver.js";
import { isBunNativeEnabled } from "./bunNativeServe.js";

const rootDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../_test/e2e/erc20",
);

const databaseUrl = process.env.DATABASE_URL;
const skip = typeof databaseUrl !== "string" || databaseUrl.length === 0;

if (skip) {
  test.skip("bunNativeApp e2e requires DATABASE_URL", () => {});
} else {
  describe("bunNativeApp start → backfill → /v1", () => {
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
      "indexes ERC20 transfers and serves them on /v1",
      async () => {
        expect(isBunNativeEnabled()).toBe(true);
        expect(isBunSqlDatabaseDriver()).toBe(true);

        await setupIsolatedDatabase();

        const port = await getFreePort();
        const schema = `bun_native_e2e_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;

        const shutdown = await start({
          cliOptions: {
            command: "start",
            schema,
            root: rootDir,
            config: "ponder.config.ts",
            logLevel: "warn",
            logFormat: "pretty",
            port,
            version: "0.0.0",
            native: true,
          },
        });

        try {
          const health = await fetch(`http://127.0.0.1:${port}/health`);
          expect(health.status).toBe(200);

          const { address } = await deployErc20({ sender: ALICE });
          await mintErc20({
            erc20: address,
            to: ALICE,
            amount: parseEther("1"),
            sender: ALICE,
          });

          const deadline = Date.now() + 45_000;
          let blockNumber = 0;
          let lastStatus: unknown;
          while (Date.now() < deadline) {
            const statusRes = await fetch(`http://127.0.0.1:${port}/v1/status`);
            if (statusRes.status === 200) {
              const status = (await statusRes.json()) as {
                checkpoint: { blockNumber: number } | null;
              };
              lastStatus = status;
              blockNumber = status.checkpoint?.blockNumber ?? 0;
              if (blockNumber >= 2) break;
            }
            await Bun.sleep(100);
          }
          expect(lastStatus).toBeDefined();
          expect(blockNumber).toBeGreaterThanOrEqual(2);

          const sqlRes = await fetch(`http://127.0.0.1:${port}/v1/sql`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sql: `select address, balance from "${schema}"."account" order by address`,
            }),
          });
          expect(sqlRes.status).toBe(200);
          const body = (await sqlRes.json()) as {
            rows: Array<{ address: string; balance: string | number | bigint }>;
          };
          expect(body.rows.length).toBeGreaterThanOrEqual(2);

          const alice = body.rows.find(
            (row) => row.address.toLowerCase() === ALICE.toLowerCase(),
          );
          const zero = body.rows.find(
            (row) => row.address.toLowerCase() === zeroAddress.toLowerCase(),
          );
          expect(alice).toBeDefined();
          expect(zero).toBeDefined();
          expect(BigInt(alice!.balance)).toBe(10n ** 18n);
          expect(BigInt(zero!.balance)).toBe(-(10n ** 18n));
        } finally {
          if (typeof shutdown === "function") {
            await shutdown();
          }
        }
      },
      { timeout: 60_000 },
    );
  });
}
