import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { glob } from "glob";
import { Hono } from "hono";
import superjson from "superjson";
import { ponder } from "@/app/ponder.js";
import type { PonderConfig } from "@/config/defineConfig.js";
import type { Config } from "@/config/index.js";
import type { Database } from "@/database/index.js";
import { MAX_DATABASE_OBJECT_NAME_LENGTH } from "@/drizzle/onchain.js";
import type { Common } from "@/internal/common.js";
import { BuildError } from "@/internal/errors.js";
import type {
  IndexingBuild,
  IndexingFunctions,
  NamespaceBuild,
  PreBuild,
  Schema,
  SchemaBuild,
} from "@/internal/types.js";
import {
  type BunHonoLike,
  validateBunNativeHonoRoutes,
} from "@/server/bunNativeHttp.js";
import { PONDER_SYNC_SCHEMAS } from "@/sync-store/schema.js";
import type { Result } from "@/utils/result.js";
import { loadBunConfig, loadBunSchema } from "./bunLoader.js";
import { safeBuildConfig, safeBuildIndexingFunctions } from "./config.js";
import { safeBuildPre } from "./pre.js";
import { safeBuildSchema } from "./schema.js";

const BUILD_ID_VERSION = "2";

const defaultRegistryFile = fileURLToPath(
  new URL("../app/ponder.ts", import.meta.url),
);

type BunPluginBuilder = {
  onResolve: (
    options: { filter: RegExp; namespace?: string },
    callback: (args: {
      path: string;
    }) => { path: string; namespace?: string } | null | undefined,
  ) => void;
  onLoad: (
    options: { filter: RegExp; namespace?: string },
    callback: (args: {
      path: string;
    }) => { contents: string; loader: "js" } | undefined,
  ) => void;
};

type BunRuntime = {
  plugin: (options: {
    name: string;
    setup: (build: BunPluginBuilder) => void;
  }) => void;
};

let ponderPluginRegistered = false;
let ponderPluginSchemaFile = "";
let ponderPluginRegistryFile = defaultRegistryFile;
/** Bumped on every `registerPonderBunPlugin` so Bun does not reuse a stale `bponder:schema`. */
let ponderPluginSchemaEpoch = 0;

const toPosixPath = (filePath: string) => filePath.replace(/\\/g, "/");

const isExistingFile = (filePath: string) => {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
};

const resolveExistingModulePath = (baseDir: string, specifier: string) => {
  const bare = path.resolve(baseDir, specifier);
  const withoutExt = bare.replace(/\.(js|mjs|cjs|jsx|ts|tsx|mts|cts)$/i, "");
  const candidates = [
    bare,
    withoutExt,
    `${withoutExt}.ts`,
    `${withoutExt}.tsx`,
    `${withoutExt}.mts`,
    `${withoutExt}.cts`,
    `${withoutExt}.js`,
    `${withoutExt}.mjs`,
    `${withoutExt}.cjs`,
    `${withoutExt}.jsx`,
    path.join(withoutExt, "index.ts"),
    path.join(withoutExt, "index.tsx"),
    path.join(withoutExt, "index.mts"),
    path.join(withoutExt, "index.js"),
    path.join(withoutExt, "index.mjs"),
  ];
  for (const candidate of candidates) {
    // Skip directories: `existsSync("./utils")` is true for `utils/` and would
    // beat `utils/index.ts` (and confuse Bun's loader).
    if (isExistingFile(candidate)) return candidate;
  }
  // Prefer a .ts guess so Bun's error message stays useful for TS projects.
  return `${withoutExt}.ts`;
};

/**
 * Rewrite relative `./` / `../` specifiers to `ponder-index:<abs>::<epoch>` so
 * sibling modules stay in the plugin namespace (bare imports like "hono" still
 * resolve from the CLI package). Bun ignores resolveDir for ponder-index.
 */
const rewriteRelativeSpecifiers = (
  source: string,
  baseDir: string,
  epoch: string,
) => {
  const rewriteOne = (specifier: string) => {
    if (!(specifier.startsWith("./") || specifier.startsWith("../"))) {
      return specifier;
    }
    const resolved = resolveExistingModulePath(baseDir, specifier);
    return `ponder-index:${toPosixPath(resolved)}::${epoch}`;
  };

  // `from "./x"` (covers import/export … from)
  let out = source.replace(
    /(\bfrom\s*)(["'])(\.\.?\/[^"']+)\2/g,
    (_m, prefix: string, quote: string, spec: string) =>
      `${prefix}${quote}${rewriteOne(spec)}${quote}`,
  );
  // side-effect: `import "./x"`
  out = out.replace(
    /(\bimport\s*)(["'])(\.\.?\/[^"']+)\2/g,
    (_m, prefix: string, quote: string, spec: string) =>
      `${prefix}${quote}${rewriteOne(spec)}${quote}`,
  );
  // dynamic: `import("./x")` or `import("./x", { with: … })`
  out = out.replace(
    /(\bimport\s*\(\s*)(["'])(\.\.?\/[^"']+)\2/g,
    (_m, prefix: string, quote: string, spec: string) =>
      `${prefix}${quote}${rewriteOne(spec)}${quote}`,
  );
  return out;
};

const asError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

const buildError = (message: string) => {
  const error = new BuildError(message);
  error.stack = undefined;
  return error;
};

export function registerPonderBunPlugin({
  schemaFile,
  registryFile = defaultRegistryFile,
}: {
  schemaFile: string;
  registryFile?: string;
}) {
  // Resolve to an absolute POSIX path so file:// URLs match `loadBunSchema`.
  ponderPluginSchemaFile = toPosixPath(path.resolve(schemaFile));
  ponderPluginRegistryFile = toPosixPath(path.resolve(registryFile));
  ponderPluginSchemaEpoch += 1;

  if (ponderPluginRegistered) return;
  ponderPluginRegistered = true;

  const bun = (globalThis as typeof globalThis & { Bun?: BunRuntime }).Bun;
  if (bun === undefined) {
    throw new Error("Bun.plugin requires the Bun runtime");
  }

  bun.plugin({
    name: "ponder-native",
    setup(build) {
      // Bun splits `bponder:registry` / `bponder:schema` into namespace
      // `ponder` and path `registry` / `schema`.
      build.onResolve({ filter: /^registry$/, namespace: "bponder" }, () => ({
        path: ponderPluginRegistryFile,
        namespace: "file",
      }));
      // Include epoch in the resolved path so each registerPonderBunPlugin
      // call gets a fresh module (Bun caches by resolved path).
      build.onResolve({ filter: /^schema$/, namespace: "bponder" }, () => ({
        path: `${ponderPluginSchemaFile}::${ponderPluginSchemaEpoch}`,
        namespace: "ponder-schema",
      }));
      // Fresh file loads: Bun ignores ?query on file:// cache keys.
      build.onResolve({ filter: /.*/, namespace: "ponder-index" }, (args) => ({
        path: args.path,
        namespace: "ponder-index",
      }));
      build.onLoad(
        { filter: /.*/, namespace: "ponder-index" },
        async (args) => {
          const [filePath, epoch = "0"] = args.path.split("::");
          const baseDir = path.dirname(filePath!);
          let contents = await bun.file(filePath!).text();
          // Bun ignores resolveDir for ponder-index virtual modules, so
          // `./foo` fails. Rewrite relatives to ponder-index:<abs>::epoch so
          // siblings stay in-namespace (bare imports still resolve from CLI).
          contents = rewriteRelativeSpecifiers(contents, baseDir, epoch);
          const ext = path.extname(filePath!);
          const loader =
            ext === ".ts" || ext === ".mts" || ext === ".tsx" ? "ts" : "js";
          return { contents, loader };
        },
      );
      build.onLoad({ filter: /.*/, namespace: "ponder-schema" }, (args) => {
        const schemaPath = args.path.split("::")[0]!;
        // Stable file:// so loadBunSchema and indexing share OnchainTable identity.
        const schemaHref = pathToFileURL(schemaPath).href;
        return {
          contents: `import * as schema from ${JSON.stringify(schemaHref)};
export * from ${JSON.stringify(schemaHref)};
export default schema;
`,
          loader: "js",
        };
      });
      // Same virtual module as the Vite bponder:api plugin (db + publicClients).
      build.onResolve({ filter: /^api$/, namespace: "bponder" }, () => ({
        path: "api",
        namespace: "ponder-api",
      }));
      build.onLoad({ filter: /.*/, namespace: "ponder-api" }, () => ({
        contents: `import { createPublicClient, custom } from "viem";

if (globalThis.PONDER_INDEXING_BUILD === undefined || globalThis.PONDER_DATABASE === undefined) {
  throw new Error('Invalid dependency graph. Config, schema, and indexing function files cannot import objects from the API function file "src/api/index.ts".')
}

const publicClients = {};

for (let i = 0; i < globalThis.PONDER_INDEXING_BUILD.chains.length; i++) {
  const chain = globalThis.PONDER_INDEXING_BUILD.chains[i];
  const rpc = globalThis.PONDER_INDEXING_BUILD.rpcs[i];
  publicClients[chain.name] = createPublicClient({
    chain: chain.viemChain,
    transport: custom({
      request(body) {
        return rpc.request(body);
      }
    }),
  })
}

export const db = globalThis.PONDER_DATABASE.readonlyQB.raw;
export { publicClients };
`,
        loader: "js",
      }));
    },
  });
}

export function clearPonderFns() {
  ponder.fns.length = 0;
}

/**
 * Load `src/api/index.ts` as a Hono app for Bun-native HTTP.
 * Missing file → success with `app: undefined` (only `/v1` is served).
 */
export async function loadBunApiApp({
  apiFile,
  common,
  database,
  indexingBuild,
  preBuild,
  namespaceBuild,
}: {
  apiFile: string;
  common: Common;
  database: Database;
  indexingBuild: IndexingBuild;
  preBuild: PreBuild;
  namespaceBuild: NamespaceBuild;
}): Promise<Result<{ app: BunHonoLike | undefined }>> {
  if (fs.existsSync(apiFile) === false) {
    return { status: "success", result: { app: undefined } };
  }

  // Same globals the Vite API loader + `client()` middleware expect.
  globalThis.PONDER_COMMON = common;
  globalThis.PONDER_DATABASE = database;
  globalThis.PONDER_INDEXING_BUILD = indexingBuild;
  globalThis.PONDER_PRE_BUILD = preBuild;
  globalThis.PONDER_NAMESPACE_BUILD = namespaceBuild;

  ponderPluginSchemaEpoch += 1;
  const importEpoch = ponderPluginSchemaEpoch;

  let exports: Record<string, unknown>;
  try {
    exports = (await import(
      `ponder-index:${toPosixPath(path.resolve(apiFile))}::${importEpoch}`
    )) as Record<string, unknown>;
  } catch (error) {
    return { status: "error", error: asError(error) };
  }

  const app = exports.default;
  if (
    !(
      app instanceof Hono ||
      (app as { constructor?: { name?: string } })?.constructor?.name === "Hono"
    )
  ) {
    return {
      status: "error",
      error: buildError(
        "API endpoint file does not export a Hono instance as the default export. Read more: https://ponder.sh/docs/api-reference/ponder/api-endpoints",
      ),
    };
  }

  const reserved = validateBunNativeHonoRoutes(app as BunHonoLike);
  if (reserved !== undefined) {
    return { status: "error", error: buildError(reserved) };
  }

  return { status: "success", result: { app: app as BunHonoLike } };
}

export function toIndexingConfig(config: PonderConfig): Config {
  const maybe = config as Partial<Config> & PonderConfig;
  return {
    chains: maybe.chains as Config["chains"],
    contracts: maybe.contracts ?? {},
    accounts: maybe.accounts ?? {},
    blocks: maybe.blocks ?? {},
    database: maybe.database,
    ordering: maybe.ordering,
  };
}

export function compileBunNativeNamespace({
  schema,
  viewsSchema,
}: {
  schema?: string;
  viewsSchema?: string;
}): Result<NamespaceBuild> {
  if (schema === undefined) {
    return {
      status: "error",
      error: buildError(
        'Database schema required. Specify with "DATABASE_SCHEMA" env var or "--schema" CLI flag. Read more: https://ponder.sh/docs/database#database-schema',
      ),
    };
  }

  if (viewsSchema === schema) {
    return {
      status: "error",
      error: buildError("Views schema cannot be the same as the schema."),
    };
  }

  if ((PONDER_SYNC_SCHEMAS as readonly string[]).includes(schema)) {
    return {
      status: "error",
      error: buildError(
        `Invalid schema name. "${schema}" is a reserved schema name.`,
      ),
    };
  }

  if (
    viewsSchema !== undefined &&
    (PONDER_SYNC_SCHEMAS as readonly string[]).includes(viewsSchema)
  ) {
    return {
      status: "error",
      error: buildError(
        `Invalid views schema name. "${viewsSchema}" is a reserved schema name.`,
      ),
    };
  }

  if (schema.length > MAX_DATABASE_OBJECT_NAME_LENGTH) {
    return {
      status: "error",
      error: buildError(
        `Schema name cannot be longer than ${MAX_DATABASE_OBJECT_NAME_LENGTH} characters.`,
      ),
    };
  }

  if (
    viewsSchema !== undefined &&
    viewsSchema.length > MAX_DATABASE_OBJECT_NAME_LENGTH
  ) {
    return {
      status: "error",
      error: buildError(
        `Views schema name cannot be longer than ${MAX_DATABASE_OBJECT_NAME_LENGTH} characters.`,
      ),
    };
  }

  return {
    status: "success",
    result: { schema, viewsSchema },
  };
}

export async function loadBunIndexingFunctions({
  indexingDir,
  apiDir,
}: {
  indexingDir: string;
  apiDir: string;
}): Promise<
  Result<{ indexingFunctions: IndexingFunctions; contentHash: string }>
> {
  clearPonderFns();

  const indexingPattern = path
    .join(indexingDir, "**/*.{js,mjs,ts,mts}")
    .replace(/\\/g, "/");
  const apiPattern = path
    .join(apiDir, "**/*.{js,mjs,ts,mts}")
    .replace(/\\/g, "/");
  const testFilePattern = path
    .join(indexingDir, "**/*.{test,spec}.{js,mjs,ts,mts}")
    .replace(/\\/g, "/");

  const files = glob.sync(indexingPattern, {
    ignore: [apiPattern, testFilePattern],
  });

  // Bust Bun's ESM cache via ponder-index plugin (file:// ?query is ignored).
  ponderPluginSchemaEpoch += 1;
  const importEpoch = ponderPluginSchemaEpoch;

  for (const file of files) {
    try {
      await import(
        `ponder-index:${toPosixPath(path.resolve(file))}::${importEpoch}`
      );
    } catch (error) {
      return { status: "error", error: asError(error) };
    }
  }

  const hash = createHash("sha256");
  for (const file of files) {
    try {
      hash.update(fs.readFileSync(file, "utf-8"));
    } catch {
      hash.update(file);
    }
  }

  return {
    status: "success",
    result: {
      indexingFunctions: ponder.fns.slice(),
      contentHash: hash.digest("hex"),
    },
  };
}

export type BunNativeBuild = {
  config: Config;
  preBuild: PreBuild;
  namespaceBuild: NamespaceBuild;
  schemaBuild: SchemaBuild;
  indexingBuild: IndexingBuild;
};

/** Load config + preBuild without Vite (for list / prune / create-views). */
export async function compileBunNativePre({
  common,
}: {
  common: Common;
}): Promise<Result<{ config: Config; preBuild: PreBuild }>> {
  globalThis.PONDER_COMMON = common;

  let rawConfig: PonderConfig;
  try {
    rawConfig = await loadBunConfig(common.options.configFile);
  } catch (error) {
    return { status: "error", error: asError(error) };
  }

  const config = toIndexingConfig(rawConfig);
  const preBuildResult = safeBuildPre({
    config,
    options: common.options,
    logger: common.logger,
  });
  if (preBuildResult.status === "error") {
    return preBuildResult;
  }

  return {
    status: "success",
    result: {
      config,
      preBuild: {
        databaseConfig: preBuildResult.databaseConfig,
        ordering: preBuildResult.ordering,
      },
    },
  };
}

export async function compileBunNative({
  common,
  schema,
  viewsSchema,
}: {
  common: Common;
  schema?: string;
  viewsSchema?: string;
}): Promise<Result<BunNativeBuild>> {
  globalThis.PONDER_COMMON = common;

  const pre = await compileBunNativePre({ common });
  if (pre.status === "error") {
    return pre;
  }

  const { config, preBuild } = pre.result;

  const namespaceResult = compileBunNativeNamespace({ schema, viewsSchema });
  if (namespaceResult.status === "error") {
    return namespaceResult;
  }
  globalThis.PONDER_NAMESPACE_BUILD = namespaceResult.result;

  let schemaModule: Schema;
  try {
    schemaModule = await loadBunSchema(common.options.schemaFile);
  } catch (error) {
    return { status: "error", error: asError(error) };
  }

  const schemaBuildResult = safeBuildSchema({
    schema: schemaModule,
    preBuild,
  });
  if (schemaBuildResult.status === "error") {
    return schemaBuildResult;
  }

  const schemaBuild: SchemaBuild = {
    schema: schemaModule,
    statements: schemaBuildResult.statements,
  };

  registerPonderBunPlugin({ schemaFile: common.options.schemaFile });

  const indexingResult = await loadBunIndexingFunctions({
    indexingDir: common.options.indexingDir,
    apiDir: common.options.apiDir,
  });
  if (indexingResult.status === "error") {
    return indexingResult;
  }

  const configBuildResult = safeBuildConfig({ common, config });
  if (configBuildResult.status === "error") {
    return configBuildResult;
  }

  for (const log of configBuildResult.logs) {
    const { level, ...rest } = log;
    common.logger[level](rest);
  }

  const indexingBuildResult = await safeBuildIndexingFunctions({
    common,
    config,
    indexingFunctions: indexingResult.result.indexingFunctions,
    configBuild: {
      chains: configBuildResult.chains,
      rpcs: configBuildResult.rpcs,
    },
  });
  if (indexingBuildResult.status === "error") {
    return indexingBuildResult;
  }

  for (const log of indexingBuildResult.logs) {
    const { level, ...rest } = log;
    common.logger[level](rest);
  }

  const configContentHash = createHash("sha256")
    .update(
      superjson.stringify({
        ordering: config.ordering,
        contracts: config.contracts,
        accounts: config.accounts,
        blocks: config.blocks,
      }),
    )
    .digest("hex");

  const schemaContentHash = createHash("sha256")
    .update(fs.readFileSync(common.options.schemaFile, "utf-8"))
    .digest("hex");

  const buildId = createHash("sha256")
    .update(BUILD_ID_VERSION)
    .update(configContentHash)
    .update(schemaContentHash)
    .update(indexingResult.result.contentHash)
    .digest("hex")
    .slice(0, 10);

  return {
    status: "success",
    result: {
      config,
      preBuild,
      namespaceBuild: namespaceResult.result,
      schemaBuild,
      indexingBuild: {
        buildId,
        chains: indexingBuildResult.chains,
        rpcs: indexingBuildResult.rpcs,
        finalizedBlocks: indexingBuildResult.finalizedBlocks,
        eventCallbacks: indexingBuildResult.eventCallbacks,
        setupCallbacks: indexingBuildResult.setupCallbacks,
        contracts: indexingBuildResult.contracts,
        indexingFunctions: indexingResult.result.indexingFunctions,
      },
    },
  };
}

export function getPostgresConnectionString(
  preBuild: Pick<PreBuild, "databaseConfig">,
): string | undefined {
  if (preBuild.databaseConfig.kind !== "postgres") return undefined;
  const url = preBuild.databaseConfig.poolConfig.connectionString?.trim();
  return url === undefined || url.length === 0 ? undefined : url;
}
