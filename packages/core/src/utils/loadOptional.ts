import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/**
 * Synchronously load an optional peer dependency.
 * Used for Bun-native escape hatches (`pg`, Vite path helpers).
 */
export function requireOptionalPeer<T = unknown>(
  id: string,
  installHint: string,
): T {
  try {
    return require(id) as T;
  } catch (error) {
    const detail =
      error instanceof Error && error.message.length > 0
        ? ` (${error.message})`
        : "";
    throw new Error(
      `Optional dependency '${id}' is not installed${detail}. ${installHint}`,
    );
  }
}

/** Dynamically import an optional peer (async paths such as Vite). */
export async function importOptionalPeer<T = unknown>(
  id: string,
  installHint: string,
): Promise<T> {
  try {
    return (await import(id)) as T;
  } catch (error) {
    const detail =
      error instanceof Error && error.message.length > 0
        ? ` (${error.message})`
        : "";
    throw new Error(
      `Optional dependency '${id}' is not installed${detail}. ${installHint}`,
    );
  }
}
