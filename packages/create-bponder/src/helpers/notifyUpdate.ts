import pico from "picocolors";
import checkForUpdate from "update-check";

import packageJson from "../../package.json" with { type: "json" };

import type { CLIOptions } from "../index.js";
import { getPackageManager } from "./getPackageManager.js";

const log = console.log;

export async function notifyUpdate({ options }: { options: CLIOptions }) {
  try {
    const res = await checkForUpdate.default(packageJson);
    if (res?.latest) {
      const packageManager = getPackageManager({ options });
      const updateMessage =
        packageManager === "bun"
          ? "bun install --global create-bponder"
          : packageManager === "pnpm"
            ? "pnpm add -g create-bponder"
            : packageManager === "npm"
              ? "npm install -g create-bponder"
              : "yarn global add create-bponder";

      log(
        pico.bold(
          `${pico.yellow(
            "A new version of `create-bponder` is available!",
          )}\nYou can update by running: ${pico.cyan(updateMessage)}\n`,
        ),
      );
    }
    process.exit();
  } catch {
    // ignore error
  }
}
