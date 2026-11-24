import path from "node:path";
import { createClient } from "bponder-client";
import { rmSync } from "node:fs";
import { parseEther, zeroAddress } from "viem";
import { beforeEach, expect, test } from "vitest";
import { ALICE } from "@/_test/constants.js";
import {
  setupAnvil,
  setupCommon,
  setupIsolatedDatabase,
} from "@/_test/setup.js";
import { deployErc20, mintErc20 } from "@/_test/simulate.js";
import { getFreePort, waitForIndexedBlock } from "@/_test/utils.js";
import { start } from "@/bin/commands/start.js";

const rootDir = path.join(".", "src", "_test", "e2e", "erc20");
beforeEach(() => {
  rmSync(path.join(rootDir, ".ponder"), { recursive: true, force: true });
  rmSync(path.join(rootDir, "generated"), { recursive: true, force: true });
});

beforeEach(setupCommon);
beforeEach(setupAnvil);
beforeEach(setupIsolatedDatabase);

const cliOptions = {
  schema: "public",
  root: rootDir,
  config: "ponder.config.ts",
  logLevel: "error",
  logFormat: "pretty",
};

test("erc20", async () => {
  const port = await getFreePort();
  const client = createClient({ url: `http://localhost:${port}` });

  const shutdown = await start({
    cliOptions: {
      ...cliOptions,
      command: "start",
      port,
      version: "0.0.0",
    },
  });

  const { address } = await deployErc20({ sender: ALICE });

  await mintErc20({
    erc20: address,
    to: ALICE,
    amount: parseEther("1"),
    sender: ALICE,
  });
  await waitForIndexedBlock({
    port,
    chainName: "mainnet",
    block: { number: 2 },
  });

  const { rows } = await client.sql(
    `SELECT address, balance FROM "public"."account" ORDER BY address`,
  );

  expect(rows).toHaveLength(2);
  const byAddress = Object.fromEntries(
    rows.map((row) => [
      String(row.address).toLowerCase(),
      BigInt(row.balance as string | number | bigint),
    ]),
  );
  expect(byAddress[zeroAddress]).toBe(-1n * 10n ** 18n);
  expect(byAddress[ALICE.toLowerCase()]).toBe(10n ** 18n);

  await shutdown!();
}, 15_000);
