import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ponder } from "@/app/ponder.js";
import { BuildError } from "@/internal/errors.js";
import { createLogger } from "@/internal/logger.js";
import { MetricsService } from "@/internal/metrics.js";
import { buildOptions } from "@/internal/options.js";
import { createShutdown } from "@/internal/shutdown.js";
import { PONDER_SYNC_SCHEMAS } from "@/sync-store/schema.js";
import {
  BUN_NATIVE_ISOLATED_ORDERING_ERROR,
  clearPonderFns,
  compileBunNative,
  compileBunNativeNamespace,
  loadBunIndexingFunctions,
  registerPonderBunPlugin,
  toIndexingConfig,
} from "./bunNativeBuild.js";

const createConfigPath = fileURLToPath(
  new URL("../config/index.ts", import.meta.url),
);
const onchainTablePath = fileURLToPath(
  new URL("../drizzle/onchain.ts", import.meta.url),
);

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "ponder-bun-native-build-"));
  tempDirs.push(dir);
  return dir;
};

const writeProject = ({
  dir,
  config,
  schema,
  indexing,
  api,
}: {
  dir: string;
  config: string;
  schema?: string;
  indexing?: string;
  api?: string;
}) => {
  writeFileSync(join(dir, "ponder.config.ts"), config);
  if (schema !== undefined) {
    writeFileSync(join(dir, "ponder.schema.ts"), schema);
  }
  if (indexing !== undefined) {
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src", "index.ts"), indexing);
  }
  if (api !== undefined) {
    mkdirSync(join(dir, "src", "api"), { recursive: true });
    writeFileSync(join(dir, "src", "api", "index.ts"), api);
  }
};

const createCommon = (root: string) => {
  const options = buildOptions({
    cliOptions: {
      command: "start",
      config: "ponder.config.ts",
      root,
      logLevel: "silent",
      logFormat: "pretty",
      version: "0.0.0",
    },
  });
  const logger = createLogger({ level: "silent", mode: "pretty" });
  const shutdown = createShutdown();
  return {
    options,
    logger,
    metrics: new MetricsService(),
    shutdown,
    apiShutdown: shutdown,
    buildShutdown: shutdown,
  };
};

afterEach(async () => {
  clearPonderFns();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir === undefined) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("compileBunNativeNamespace", () => {
  test("requires a schema name", () => {
    const result = compileBunNativeNamespace({});
    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(BuildError);
    expect(result.error.message).toContain("Database schema required");
  });

  test("rejects reserved sync schema names", () => {
    for (const schema of PONDER_SYNC_SCHEMAS) {
      const result = compileBunNativeNamespace({ schema });
      expect(result.status).toBe("error");
      if (result.status !== "error") continue;
      expect(result.error.message).toContain("reserved schema name");
    }
  });

  test("returns the schema and views schema", () => {
    expect(
      compileBunNativeNamespace({
        schema: "public",
        viewsSchema: "ponder_views",
      }),
    ).toEqual({
      status: "success",
      result: { schema: "public", viewsSchema: "ponder_views" },
    });
  });
});

describe("toIndexingConfig", () => {
  test("fills missing contracts, accounts, and blocks", () => {
    const config = toIndexingConfig({
      chains: { mainnet: { id: 1, rpc: "http://127.0.0.1:1" } },
    });
    expect(config.contracts).toEqual({});
    expect(config.accounts).toEqual({});
    expect(config.blocks).toEqual({});
    expect(config.chains).toEqual({
      mainnet: { id: 1, rpc: "http://127.0.0.1:1" },
    });
  });
});

describe("loadBunIndexingFunctions", () => {
  test("loads ponder.on handlers through ponder:registry and ponder:schema", async () => {
    const dir = makeTempDir();
    const schemaFile = join(dir, "ponder.schema.ts");
    writeProject({
      dir,
      config: "export default { chains: {} };\n",
      schema: `import { onchainTable } from ${JSON.stringify(onchainTablePath)};

export const account = onchainTable("account", (t) => ({
  id: t.text().primaryKey(),
}));
`,
      indexing: `import { ponder } from "ponder:registry";
import schema, { account } from "ponder:schema";

ponder.on("Token:Transfer", async () => {
  void schema;
  void account;
});
`,
      api: `import { ponder } from "ponder:registry";

ponder.on("api:only", async () => {});
`,
    });

    globalThis.PONDER_NAMESPACE_BUILD = {
      schema: "public",
      viewsSchema: undefined,
    };
    ponder.fns.push({ name: "stale:Event", fn: () => {} });
    registerPonderBunPlugin({ schemaFile });

    const result = await loadBunIndexingFunctions({
      indexingDir: join(dir, "src"),
      apiDir: join(dir, "src", "api"),
    });

    if (result.status !== "success") {
      throw result.error;
    }
    expect(result.result.indexingFunctions.map((entry) => entry.name)).toEqual([
      "Token:Transfer",
    ]);
    expect(ponder.fns.map((entry) => entry.name)).toEqual(["Token:Transfer"]);
  });
});

describe("compileBunNative", () => {
  test("errors on experimental_isolated without hitting RPC", async () => {
    const dir = makeTempDir();
    writeProject({
      dir,
      config: `import { createConfig } from ${JSON.stringify(createConfigPath)};

export default createConfig({
  ordering: "experimental_isolated",
  chains: {
    mainnet: { id: 1, rpc: "http://127.0.0.1:1" },
  },
});
`,
    });

    const result = await compileBunNative({
      common: createCommon(dir),
      schema: "public",
    });

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error).toBeInstanceOf(BuildError);
    expect(result.error.message).toBe(BUN_NATIVE_ISOLATED_ORDERING_ERROR);
  });

  test("errors when the config file is missing", async () => {
    const dir = makeTempDir();
    const result = await compileBunNative({
      common: createCommon(dir),
      schema: "public",
    });

    expect(result.status).toBe("error");
    if (result.status !== "error") return;
    expect(result.error.message).toContain("File not found:");
    expect(result.error.message).toContain("ponder.config.ts");
  });
});
