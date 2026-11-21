import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getConfigChainKeys,
  getOnchainTables,
  loadBunConfig,
  loadBunModule,
  loadBunSchema,
} from "./bunLoader.js";

const defineConfigPath = fileURLToPath(
  new URL("../config/defineConfig.ts", import.meta.url),
);
const schemaPackagePath = fileURLToPath(
  new URL("../../../schema/src/index.ts", import.meta.url),
);

const tempDirs: string[] = [];

const makeTempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), "ponder-bun-loader-"));
  tempDirs.push(dir);
  return dir;
};

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir === undefined) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadBunModule", () => {
  test("imports a TypeScript file by absolute path", async () => {
    const dir = makeTempDir();
    const path = join(dir, "module.ts");
    writeFileSync(path, 'export const value = "ok";\n');

    const module = await loadBunModule(path);
    expect(module.value).toBe("ok");
  });

  test("throws a clear error when the file is missing", async () => {
    const path = join(makeTempDir(), "missing.ts");
    await expect(loadBunModule(path)).rejects.toThrow(
      `File not found: ${path}`,
    );
  });
});

describe("loadBunConfig", () => {
  test("reads a default export", async () => {
    const dir = makeTempDir();
    const path = join(dir, "ponder.config.ts");
    writeFileSync(
      path,
      `export default {
  chains: { mainnet: { id: 1, rpc: "https://rpc.example" } },
};
`,
    );

    const config = await loadBunConfig(path);
    expect(getConfigChainKeys(config)).toEqual(["mainnet"]);
  });

  test("reads a named config export", async () => {
    const dir = makeTempDir();
    const path = join(dir, "ponder.config.ts");
    writeFileSync(
      path,
      `export const config = {
  chains: { sepolia: { id: 11155111 } },
};
`,
    );

    const config = await loadBunConfig(path);
    expect(getConfigChainKeys(config)).toEqual(["sepolia"]);
  });

  test("reads a defineConfig default export", async () => {
    const dir = makeTempDir();
    const path = join(dir, "ponder.config.ts");
    writeFileSync(
      path,
      `import { defineConfig } from ${JSON.stringify(defineConfigPath)};

export default defineConfig({
  chains: {
    base: { id: 8453, rpc: "https://rpc.example" },
  },
});
`,
    );

    const config = await loadBunConfig(path);
    expect(getConfigChainKeys(config)).toEqual(["base"]);
  });

  test("throws when default and config exports are missing", async () => {
    const dir = makeTempDir();
    const path = join(dir, "ponder.config.ts");
    writeFileSync(path, "export const chains = {};\n");

    await expect(loadBunConfig(path)).rejects.toThrow(
      `No default or config export in ${path}`,
    );
  });

  test("throws a clear error when the file is missing", async () => {
    const path = join(makeTempDir(), "ponder.config.ts");
    await expect(loadBunConfig(path)).rejects.toThrow(
      `File not found: ${path}`,
    );
  });
});

describe("loadBunSchema", () => {
  test("returns onchainTable exports", async () => {
    const dir = makeTempDir();
    const path = join(dir, "ponder.schema.ts");
    writeFileSync(
      path,
      `import { integer, onchainTable, text } from ${JSON.stringify(schemaPackagePath)};

export const account = onchainTable("account", {
  id: text(),
  balance: integer(),
});

export const transfer = onchainTable("transfer", {
  id: text(),
});
`,
    );

    const schema = await loadBunSchema(path);
    const tables = getOnchainTables(schema);
    expect(tables.map((table) => table.name).sort()).toEqual([
      "account",
      "transfer",
    ]);
  });

  test("throws a clear error when the file is missing", async () => {
    const path = join(makeTempDir(), "ponder.schema.ts");
    await expect(loadBunSchema(path)).rejects.toThrow(
      `File not found: ${path}`,
    );
  });
});
