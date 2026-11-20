import { describe, expect, test } from "bun:test";
import { defineConfig } from "./defineConfig.js";

describe("defineConfig", () => {
  test("preserves the config shape", () => {
    const input = {
      chains: {
        mainnet: {
          id: 1,
          rpc: "https://rpc.example",
        },
      },
      ordering: "omnichain" as const,
      database: { kind: "postgres" as const },
      server: { port: 42069 },
      indexing: "./src/index.ts",
    };

    const config = defineConfig(input);

    expect(config).toBe(input);
    expect(config).toEqual(input);
  });
});
