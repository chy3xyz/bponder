import { defineConfig } from "tsup";

export default defineConfig({
  name: "bponder-client",
  entry: ["src/index.ts"],
  outDir: "dist",
  format: ["esm"],
  sourcemap: true,
  dts: true,
  clean: true,
  splitting: true,
});
