import type { Logger } from "@/internal/logger.js";

export function isBunRuntime(): boolean {
  return process.versions.bun !== undefined;
}

/**
 * Exit unless this process is running on Bun.
 * Used by the CLI entry and by command handlers that previously gated on Node.
 */
export function assertBunRuntime(logger?: Pick<Logger, "error">): void {
  if (isBunRuntime()) return;

  logger?.error({
    msg: "Invalid runtime",
    runtime: "node",
    expected: "bun >=1.4.0",
  });

  process.stderr.write(
    "Ponder requires Bun >=1.4.0. Run with `bun` (https://bun.sh).\n",
  );
  process.exit(1);
}
