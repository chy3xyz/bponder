import { describe, expect, test } from "bun:test";
import path from "node:path";
import {
  classifyBunNativeWatchPath,
  createDebouncedKindScheduler,
  mergeWatchKinds,
} from "./bunNativeDevReload.js";

const options = {
  rootDir: "/proj",
  apiDir: "/proj/src/api",
  apiFile: "/proj/src/api/index.ts",
  configFile: "/proj/ponder.config.ts",
  schemaFile: "/proj/ponder.schema.ts",
  indexingDir: "/proj/src",
  generatedDir: "/proj/generated",
  ponderDir: "/proj/.ponder",
};

describe("classifyBunNativeWatchPath", () => {
  test("classifies API files under src/api", () => {
    expect(classifyBunNativeWatchPath("/proj/src/api/index.ts", options)).toBe(
      "api",
    );
    expect(classifyBunNativeWatchPath("/proj/src/api/routes.ts", options)).toBe(
      "api",
    );
  });

  test("classifies config and schema as indexing", () => {
    expect(classifyBunNativeWatchPath("/proj/ponder.config.ts", options)).toBe(
      "indexing",
    );
    expect(classifyBunNativeWatchPath("/proj/ponder.schema.ts", options)).toBe(
      "indexing",
    );
  });

  test("classifies indexing sources outside src/api", () => {
    expect(classifyBunNativeWatchPath("/proj/src/index.ts", options)).toBe(
      "indexing",
    );
    expect(
      classifyBunNativeWatchPath("/proj/src/handlers/transfer.ts", options),
    ).toBe("indexing");
  });

  test("ignores generated, ponder cache, tests, and non-source files", () => {
    expect(
      classifyBunNativeWatchPath("/proj/generated/schema.graphql", options),
    ).toBeUndefined();
    expect(
      classifyBunNativeWatchPath("/proj/.ponder/vite/x.js", options),
    ).toBeUndefined();
    expect(
      classifyBunNativeWatchPath("/proj/src/index.test.ts", options),
    ).toBeUndefined();
    expect(classifyBunNativeWatchPath("/proj/src/notes.txt", options)).toBe(
      undefined,
    );
  });

  test("normalizes relative paths", () => {
    const relOptions = {
      ...options,
      rootDir: path.resolve("proj"),
      apiDir: path.resolve("proj/src/api"),
      apiFile: path.resolve("proj/src/api/index.ts"),
      configFile: path.resolve("proj/ponder.config.ts"),
      schemaFile: path.resolve("proj/ponder.schema.ts"),
      indexingDir: path.resolve("proj/src"),
      generatedDir: path.resolve("proj/generated"),
      ponderDir: path.resolve("proj/.ponder"),
    };
    expect(
      classifyBunNativeWatchPath(
        path.resolve("proj/src/api/index.ts"),
        relOptions,
      ),
    ).toBe("api");
  });
});

describe("mergeWatchKinds", () => {
  test("indexing wins over api", () => {
    expect(mergeWatchKinds(undefined, "api")).toBe("api");
    expect(mergeWatchKinds("api", "api")).toBe("api");
    expect(mergeWatchKinds("api", "indexing")).toBe("indexing");
    expect(mergeWatchKinds("indexing", "api")).toBe("indexing");
  });
});

describe("createDebouncedKindScheduler", () => {
  test("debounces and flushes the merged kind", async () => {
    const kinds: string[] = [];
    const scheduler = createDebouncedKindScheduler({
      debounceMs: 40,
      onFlush: (kind) => {
        kinds.push(kind);
      },
    });

    scheduler.schedule("api");
    scheduler.schedule("api");
    await Bun.sleep(20);
    scheduler.schedule("indexing");
    await Bun.sleep(60);

    expect(kinds).toEqual(["indexing"]);
    scheduler.clear();
  });

  test("clear cancels a pending flush", async () => {
    const kinds: string[] = [];
    const scheduler = createDebouncedKindScheduler({
      debounceMs: 30,
      onFlush: (kind) => {
        kinds.push(kind);
      },
    });

    scheduler.schedule("api");
    scheduler.clear();
    await Bun.sleep(50);

    expect(kinds).toEqual([]);
  });
});
