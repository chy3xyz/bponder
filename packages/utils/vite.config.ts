import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["src/_test/globalSetup.ts"],
    // Live provider RPCs often exceed Vitest's 5s default under CI.
    testTimeout: 30_000,
  },
});
