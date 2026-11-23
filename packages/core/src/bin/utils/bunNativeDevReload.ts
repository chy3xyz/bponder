import fs from "node:fs";
import path from "node:path";
import { loadBunApiApp } from "@/build/bunNativeBuild.js";
import type { Database } from "@/database/index.js";
import type { Common } from "@/internal/common.js";
import type { Logger } from "@/internal/logger.js";
import type { Options } from "@/internal/options.js";
import type {
  IndexingBuild,
  NamespaceBuild,
  PreBuild,
} from "@/internal/types.js";
import type { BunHonoLike } from "@/server/bunNativeHttp.js";
import type { BunFetchHandler } from "@/server/bunServe.js";

const DEFAULT_DEBOUNCE_MS = 300;

const SOURCE_EXT = /\.(?:[cm]?[jt]s|tsx)$/i;
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|tsx)$/i;

export type BunNativeWatchKind = "api" | "indexing";

export type BunNativeWatchOptions = Pick<
  Options,
  | "apiDir"
  | "apiFile"
  | "configFile"
  | "schemaFile"
  | "indexingDir"
  | "generatedDir"
  | "ponderDir"
  | "rootDir"
>;

const isInsideDir = (dir: string, filePath: string): boolean => {
  const rel = path.relative(path.resolve(dir), path.resolve(filePath));
  return (
    rel === "" ||
    (rel.startsWith("..") === false && path.isAbsolute(rel) === false)
  );
};

/**
 * Classify a changed path for Bun-native `ponder dev` hot reload.
 * Returns `undefined` for ignored / irrelevant files.
 */
export function classifyBunNativeWatchPath(
  filePath: string,
  options: BunNativeWatchOptions,
): BunNativeWatchKind | undefined {
  const resolved = path.resolve(filePath);

  if (
    isInsideDir(options.generatedDir, resolved) ||
    isInsideDir(options.ponderDir, resolved)
  ) {
    return undefined;
  }

  if (resolved === path.resolve(options.configFile)) return "indexing";
  if (resolved === path.resolve(options.schemaFile)) return "indexing";

  if (TEST_FILE.test(resolved)) return undefined;
  if (SOURCE_EXT.test(resolved) === false) return undefined;

  if (
    resolved === path.resolve(options.apiFile) ||
    isInsideDir(options.apiDir, resolved)
  ) {
    return "api";
  }

  if (isInsideDir(options.indexingDir, resolved)) {
    return "indexing";
  }

  return undefined;
}

/**
 * Merge overlapping reload kinds: indexing wins over api.
 * Exported for unit tests.
 */
export function mergeWatchKinds(
  pending: BunNativeWatchKind | undefined,
  next: BunNativeWatchKind,
): BunNativeWatchKind {
  if (pending === "indexing" || next === "indexing") return "indexing";
  return "api";
}

/**
 * Debounced scheduler used by the file watcher.
 * Exported for unit tests.
 */
export function createDebouncedKindScheduler({
  onFlush,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: {
  onFlush: (kind: BunNativeWatchKind) => void;
  debounceMs?: number;
}): {
  schedule: (kind: BunNativeWatchKind) => void;
  clear: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: BunNativeWatchKind | undefined;

  return {
    schedule(kind) {
      pending = mergeWatchKinds(pending, kind);
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        const flushKind = pending;
        pending = undefined;
        timer = undefined;
        if (flushKind !== undefined) onFlush(flushKind);
      }, debounceMs);
    },
    clear() {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    },
  };
}

/**
 * Watch config/schema/api/indexing sources for Bun-native `ponder dev`.
 * Debounces and classifies changes as API-only vs full indexing reload.
 */
export function startBunNativeDevWatcher({
  options,
  logger,
  onReload,
  debounceMs = DEFAULT_DEBOUNCE_MS,
}: {
  options: BunNativeWatchOptions;
  logger: Logger;
  onReload: (kind: BunNativeWatchKind) => void;
  debounceMs?: number;
}): () => void {
  const roots = new Set<string>([
    path.resolve(options.configFile),
    path.resolve(options.schemaFile),
    path.resolve(options.apiDir),
    path.resolve(options.indexingDir),
  ]);

  const scheduler = createDebouncedKindScheduler({
    onFlush: onReload,
    debounceMs,
  });

  const watchers: fs.FSWatcher[] = [];
  for (const root of roots) {
    if (fs.existsSync(root) === false) continue;
    let isDirectory = false;
    try {
      isDirectory = fs.statSync(root).isDirectory();
    } catch {
      continue;
    }

    try {
      const watcher = fs.watch(
        root,
        { recursive: isDirectory },
        (_event, filename) => {
          const candidate =
            filename === null || filename === undefined
              ? root
              : path.isAbsolute(filename)
                ? filename
                : path.join(isDirectory ? root : path.dirname(root), filename);
          const kind = classifyBunNativeWatchPath(candidate, options);
          if (kind !== undefined) scheduler.schedule(kind);
        },
      );
      watchers.push(watcher);
    } catch (error) {
      logger.warn({
        msg: "Failed to watch Bun-native source for hot reload",
        path: root,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  logger.info({
    msg: "Watching Bun-native sources for hot reload",
    paths: [...roots],
  });

  return () => {
    scheduler.clear();
    for (const watcher of watchers) {
      watcher.close();
    }
  };
}

/**
 * Reload `src/api` and swap the Bun.serve fetch handler without rebinding the port.
 */
export async function reloadBunNativeApiApp({
  apiFile,
  common,
  database,
  indexingBuild,
  preBuild,
  namespaceBuild,
  logger,
  composeFetch,
  setFetch,
}: {
  apiFile: string;
  common: Common;
  database: Database;
  indexingBuild: IndexingBuild;
  preBuild: PreBuild;
  namespaceBuild: NamespaceBuild;
  logger: Logger;
  composeFetch: (honoApp: BunHonoLike | undefined) => BunFetchHandler;
  setFetch: (fetch: BunFetchHandler) => void;
}): Promise<boolean> {
  const apiResult = await loadBunApiApp({
    apiFile,
    common,
    database,
    indexingBuild,
    preBuild,
    namespaceBuild,
  });
  if (apiResult.status === "error") {
    logger.error({
      msg: "Failed to reload Bun-native Hono API",
      error: apiResult.error,
    });
    return false;
  }

  setFetch(composeFetch(apiResult.result.app));
  logger.info({
    msg: "Reloaded Hono API from src/api",
    hono: apiResult.result.app !== undefined,
  });
  return true;
}
