import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { OnchainTable } from "@ponder/schema";
import type { PonderConfig } from "@/config/defineConfig.js";

export type BunModule = Record<string, unknown>;

const fileNotFound = (absolutePath: string) =>
  new Error(`File not found: ${absolutePath}`);

export async function loadBunModule(absolutePath: string): Promise<BunModule> {
  const resolved = resolve(absolutePath);
  if (existsSync(resolved) === false) {
    throw fileNotFound(resolved);
  }

  // Intentionally stable file:// URL so `ponder:schema` re-exports share table identity.
  return (await import(pathToFileURL(resolved).href)) as BunModule;
}
export async function loadBunConfig(configPath: string): Promise<PonderConfig> {
  const resolved = resolve(configPath);
  const module = await loadBunModule(resolved);
  const config = module.default ?? module.config;

  if (config === undefined) {
    throw new Error(`No default or config export in ${resolved}`);
  }

  return config as PonderConfig;
}

export async function loadBunSchema(schemaPath: string): Promise<BunModule> {
  return loadBunModule(schemaPath);
}

export function isOnchainTable(value: unknown): value is OnchainTable {
  if (typeof value !== "object" || value === null) return false;

  const table = value as { name?: unknown; columns?: unknown };
  if (typeof table.name !== "string") return false;
  if (
    typeof table.columns !== "object" ||
    table.columns === null ||
    Array.isArray(table.columns)
  ) {
    return false;
  }

  return Object.values(table.columns).every(
    (column) =>
      typeof column === "object" &&
      column !== null &&
      typeof (column as { type?: unknown }).type === "string",
  );
}

export function getOnchainTables(schemaModule: BunModule): OnchainTable[] {
  const tables: OnchainTable[] = [];
  const seen = new Set<unknown>();

  for (const value of Object.values(schemaModule)) {
    if (isOnchainTable(value) === false || seen.has(value)) continue;
    seen.add(value);
    tables.push(value);
  }

  return tables;
}

export function getConfigChainKeys(config: PonderConfig): string[] {
  if (
    typeof config.chains !== "object" ||
    config.chains === null ||
    Array.isArray(config.chains)
  ) {
    return [];
  }

  return Object.keys(config.chains);
}
