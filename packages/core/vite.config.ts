import { createRequire } from "node:module";
import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

// Fixes `Duplicate "graphql" modules cannot be used at the same time` issue
const graphqlPath = createRequire(import.meta.url).resolve("graphql");

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@ponder/client": path.resolve(import.meta.dirname, "../client/src"),
      "@ponder/utils": path.resolve(import.meta.dirname, "../utils/src"),
      graphql: graphqlPath,
    },
  },
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/*.bun.test.ts",
      // TODO: Port these suites to bun:test; app startup now requires Bun.serve.
      "**/server/index.test.ts",
      "**/_test/e2e/**/*.test.ts",
    ],
    globalSetup: ["src/_test/globalSetup.ts"],
    pool: "threads",
    maxWorkers: 4,
    sequence: { hooks: "stack" },
    restoreMocks: true,
    testTimeout: 15000,
  },
});
