import { sql } from "drizzle-orm";
import { getPonderCheckpointTable } from "@/database/index.js";
import type { QB } from "@/database/queryBuilder.js";
import { decodeCheckpoint } from "@/utils/checkpoint.js";
import {
  type BunV1ApiDependencies,
  type BunV1Status,
  isReadonlySelectSql,
} from "./bunV1Api.js";

const toRows = (result: unknown): Record<string, unknown>[] => {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (
    result !== null &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: Record<string, unknown>[] }).rows;
  }
  return [];
};

const toBunV1Status = (
  checkpoints: {
    latestCheckpoint: string;
  }[],
): BunV1Status => {
  const latest = checkpoints.reduce<string | undefined>((max, row) => {
    if (max === undefined || row.latestCheckpoint > max) {
      return row.latestCheckpoint;
    }
    return max;
  }, undefined);

  if (latest === undefined) {
    return { checkpoint: null };
  }

  return {
    checkpoint: {
      blockNumber: Number(decodeCheckpoint(latest).blockNumber),
      id: latest,
    },
  };
};

/** Builds `/v1` handlers that read the same `createDatabase()` instance used for indexing. */
export const createBunV1HandlersFromReadonlyQB = (
  readonlyQB: Pick<QB, "wrap">,
): Required<Pick<BunV1ApiDependencies, "getStatus" | "executeSql">> => ({
  getStatus: async () => {
    const checkpoints = await readonlyQB.wrap(
      { label: "select_checkpoints" },
      (db) => db.select().from(getPonderCheckpointTable()),
    );
    return toBunV1Status(checkpoints);
  },
  executeSql: async (query) => {
    if (isReadonlySelectSql(query) === false) {
      throw new Error("Only readonly SELECT statements are allowed");
    }

    const result = await readonlyQB.wrap({ label: "v1_sql" }, (db) =>
      db.execute(sql.raw(query)),
    );
    return toRows(result);
  },
});
