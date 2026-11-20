import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cpy from "cpy";
import { defineConfig } from "tsup";

import { dependencies } from "./package.json";

export default defineConfig({
  name: "create-ponder",
  bundle: true,
  clean: true,
  entry: ["src/index.ts"],
  external: Object.keys(dependencies),
  format: ["esm"],
  platform: "node",
  banner: {
    js: "#!/usr/bin/env bun",
  },
  async onSuccess() {
    const __dirname = fileURLToPath(new URL(".", import.meta.url));
    const examplesPath = path.join(__dirname, "../..", "examples");
    const targetPath = path.join(__dirname, "templates");

    // Copy examples contents into the templates path
    await cpy(
      [
        path.join(examplesPath, "**", "*"),
        "!**/with-nextjs/**",
        "!**/with-foundry/**",
        "!**/with-trpc/**",
        "!**/with-client/**",
        "!**/with-offchain/**",
        "!**/node_modules/**",
        "!**/generated/**",
        "!**/.ponder/**",
      ],
      targetPath,
      {
        filter: (file) => file.name !== ".env.local",
        rename: (name) => name.replace(/^\./, "_dot_"),
      },
    );

    readdirSync(targetPath)
      .filter((d) => d !== "default" && d !== "etherscan")
      .forEach((d) => {
        const dir = path.join(targetPath, d);
        const envExample = path.join(dir, "_dot_env.example");
        const envLocal = path.join(dir, "_dot_env.local");
        const blankRpc = (contents: string) =>
          contents.replace(/PONDER_RPC_URL_(\d+)=.*/, "PONDER_RPC_URL_$1=");

        if (existsSync(envExample)) {
          writeFileSync(
            envExample,
            blankRpc(readFileSync(envExample, "utf-8")),
          );
        }
        if (existsSync(envLocal)) {
          writeFileSync(envLocal, blankRpc(readFileSync(envLocal, "utf-8")));
        } else if (existsSync(envExample)) {
          copyFileSync(envExample, envLocal);
        }
      });
  },
});
