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
  clearPonderFns,
  compileBunNative,
  compileBunNativeNamespace,
  compileBunNativePre,
  loadBunApiApp,
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

describe("registerPonderBunPlugin", () => {
  test("busts ponder:schema cache across sequential schema files", async () => {
    const dirA = makeTempDir();
    const dirB = makeTempDir();
    const schemaA = join(dirA, "ponder.schema.ts");
    const schemaB = join(dirB, "ponder.schema.ts");
    writeFileSync(
      schemaA,
      `import { onchainTable } from ${JSON.stringify(onchainTablePath)};
export const alpha = onchainTable("alpha", (t) => ({
  id: t.text().primaryKey(),
}));
`,
    );
    writeFileSync(
      schemaB,
      `import { onchainTable } from ${JSON.stringify(onchainTablePath)};
export const beta = onchainTable("beta", (t) => ({
  id: t.text().primaryKey(),
}));
`,
    );

    registerPonderBunPlugin({ schemaFile: schemaA });
    const modA = await import("ponder:schema");
    expect(Object.keys(modA.default)).toContain("alpha");
    expect(Object.keys(modA.default)).not.toContain("beta");

    registerPonderBunPlugin({ schemaFile: schemaB });
    const modB = await import("ponder:schema");
    expect(Object.keys(modB.default)).toContain("beta");
    expect(Object.keys(modB.default)).not.toContain("alpha");
  });
});

describe("loadBunApiApp", () => {
  test("loads a Hono default export through ponder:api", async () => {
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
      api: `import { Hono } from "hono";
import { db } from "ponder:api";
import schema from "ponder:schema";

const app = new Hono();
app.get("/hello", (c) => {
  void db;
  void schema;
  return c.text("ok");
});
export default app;
`,
    });

    registerPonderBunPlugin({ schemaFile });
    const fakeDatabase = {
      readonlyQB: { raw: { select: () => ({ from: () => [] }) } },
    };
    const fakeIndexingBuild = {
      chains: [{ name: "mainnet", viemChain: undefined }],
      rpcs: [{ request: async () => null }],
    };

    const result = await loadBunApiApp({
      apiFile: join(dir, "src", "api", "index.ts"),
      database: fakeDatabase as never,
      indexingBuild: fakeIndexingBuild as never,
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.result.app).toBeDefined();
    const res = await result.result.app!.fetch(
      new Request("http://localhost/hello"),
    );
    expect(await res.text()).toBe("ok");
  });

  test("allows a missing API file", async () => {
    const result = await loadBunApiApp({
      apiFile: join(makeTempDir(), "missing.ts"),
      database: {} as never,
      indexingBuild: {} as never,
    });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.result.app).toBeUndefined();
  });
});

describe("loadBunIndexingFunctions", () => {
  test("reloads ponder.on handlers after a prior import of the same files", async () => {
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

ponder.on("Token:Transfer", async () => {});
`,
    });

    registerPonderBunPlugin({ schemaFile });
    const first = await loadBunIndexingFunctions({
      indexingDir: join(dir, "src"),
      apiDir: join(dir, "src", "api"),
    });
    expect(first.status).toBe("success");
    if (first.status !== "success") return;
    expect(first.result.indexingFunctions.map((e) => e.name)).toEqual([
      "Token:Transfer",
    ]);

    const second = await loadBunIndexingFunctions({
      indexingDir: join(dir, "src"),
      apiDir: join(dir, "src", "api"),
    });
    expect(second.status).toBe("success");
    if (second.status !== "success") return;
    expect(second.result.indexingFunctions.map((e) => e.name)).toEqual([
      "Token:Transfer",
    ]);
  });

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

describe("compileBunNativePre", () => {
  test("loads config and preBuild without Vite", async () => {
    const dir = makeTempDir();
    writeProject({
      dir,
      config: `import { createConfig } from ${JSON.stringify(createConfigPath)};

export default createConfig({
  chains: {
    mainnet: { id: 1, rpc: "http://127.0.0.1:1" },
  },
});
`,
    });

    const result = await compileBunNativePre({
      common: createCommon(dir),
    });
    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(result.result.preBuild.databaseConfig.kind).toBeDefined();
    expect(result.result.config.chains.mainnet?.id).toBe(1);
  });
});

describe("compileBunNative", () => {
  test("accepts experimental_isolated ordering past preCompile", async () => {
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

    // Ordering is allowed; failure should be later (schema / RPC), not a hard reject.
    if (result.status === "error") {
      expect(result.error.message).not.toMatch(/experimental_isolated/);
    }
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
