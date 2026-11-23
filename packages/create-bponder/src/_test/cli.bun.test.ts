import { afterEach, beforeEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { rimrafSync } from "rimraf";
import { run } from "../index.js";

const tempDir = path.join(os.tmpdir(), randomUUID());

beforeEach(() => {
  mkdirSync(tempDir, { recursive: true });
});

afterEach(() => {
  rimrafSync(tempDir);
});

test("create empty", async () => {
  const rootDir = path.join(tempDir, "empty");

  await run({
    args: [rootDir],
    options: { template: "empty", skipGit: true, skipInstall: true },
  });

  const files = readdirSync(rootDir, { recursive: true, encoding: "utf8" });

  expect(files).toEqual(
    expect.arrayContaining([
      ".env.example",
      ".env.local",
      ".gitignore",
      "bunfig.toml",
      "package.json",
      "ponder-env.d.ts",
      "ponder.config.ts",
      "ponder.schema.ts",
      "tsconfig.json",
      path.join("abis", "ExampleContractAbi.ts"),
      path.join("src", "index.ts"),
      path.join("src", "api", "index.ts"),
    ]),
  );

  const pkg = JSON.parse(
    readFileSync(path.join(rootDir, "package.json"), "utf8"),
  ) as {
    engines?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  expect(pkg.engines).toEqual({ bun: ">=1.4.0" });
  expect(pkg.engines?.node).toBeUndefined();
  expect(pkg.scripts?.dev).toBe("bponder dev");
  for (const script of Object.values(pkg.scripts ?? {})) {
    expect(script).not.toContain("bun --bun");
  }
});
