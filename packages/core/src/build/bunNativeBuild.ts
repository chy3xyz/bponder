import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { glob } from "glob";
import superjson from "superjson";
import { ponder } from "@/app/ponder.js";
import type { PonderConfig } from "@/config/defineConfig.js";
import type { Config } from "@/config/index.js";
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
import { PONDER_SYNC_SCHEMAS } from "@/sync-store/schema.js";
import type { Result } from "@/utils/result.js";
import { loadBunConfig, loadBunSchema } from "./bunLoader.js";
import { safeBuildConfig, safeBuildIndexingFunctions } from "./config.js";
import { safeBuildPre } from "./pre.js";
import { safeBuildSchema } from "./schema.js";

const BUILD_ID_VERSION = "2";

export const BUN_NATIVE_ISOLATED_ORDERING_ERROR =
  "The Bun-native 'ponder start --native' command does not support ordering: \"experimental_isolated\". Use classic 'ponder start' without --native.";

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

const toPosixPath = (filePath: string) => filePath.replace(/\\/g, "/");

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
  ponderPluginSchemaFile = toPosixPath(schemaFile);
  ponderPluginRegistryFile = toPosixPath(registryFile);

  if (ponderPluginRegistered) return;
  ponderPluginRegistered = true;

  const bun = (globalThis as typeof globalThis & { Bun?: BunRuntime }).Bun;
  if (bun === undefined) {
    throw new Error("Bun.plugin requires the Bun runtime");
  }

  bun.plugin({
    name: "ponder-native",
    setup(build) {
      // Bun splits `ponder:registry` / `ponder:schema` into namespace
      // `ponder` and path `registry` / `schema`.
      build.onResolve({ filter: /^registry$/, namespace: "ponder" }, () => ({
        path: ponderPluginRegistryFile,
        namespace: "file",
      }));
      build.onLoad({ filter: /^schema$/, namespace: "ponder" }, () => ({
        contents: `import * as schema from ${JSON.stringify(ponderPluginSchemaFile)};
export * from ${JSON.stringify(ponderPluginSchemaFile)};
export default schema;
`,
        loader: "js",
      }));
    },
  });
}

export function clearPonderFns() {
  ponder.fns.length = 0;
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

  for (const file of files) {
    try {
      await import(pathToFileURL(file).href);
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

  const preBuild: PreBuild = {
    databaseConfig: preBuildResult.databaseConfig,
    ordering: preBuildResult.ordering,
  };

  if (preBuild.ordering === "experimental_isolated") {
    return {
      status: "error",
      error: buildError(BUN_NATIVE_ISOLATED_ORDERING_ERROR),
    };
  }

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
