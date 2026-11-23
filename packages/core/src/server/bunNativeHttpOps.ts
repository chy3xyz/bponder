import {
  type Database,
  getPonderCheckpointTable,
  getPonderMetaTable,
} from "@/database/index.js";
import type { MetricsService } from "@/internal/metrics.js";
import type { Status } from "@/internal/types.js";
import { decodeCheckpoint } from "@/utils/checkpoint.js";
import type { BunNativeHttpOps } from "./bunNativeHttp.js";

/** Classic `/ready`, `/metrics`, `/status` handlers used by Bun-native HTTP. */
export const createBunNativeHttpOps = ({
  metrics,
  database,
}: {
  metrics: MetricsService;
  database: Database;
}): BunNativeHttpOps => ({
  getReady: async () => {
    const rows = await database.readonlyQB.wrap(
      { label: "select_ready" },
      (db) => db.select().from(getPonderMetaTable()),
    );
    return rows[0]?.value.is_ready === 1;
  },
  getMetrics: () => metrics.getMetrics(),
  getStatus: async () => {
    const checkpoints = await database.readonlyQB.wrap(
      { label: "select_checkpoints" },
      (db) => db.select().from(getPonderCheckpointTable()),
    );
    const status: Status = {};
    for (const { chainName, chainId, latestCheckpoint } of checkpoints.sort(
      (a, b) => (a.chainId > b.chainId ? 1 : -1),
    )) {
      status[chainName] = {
        id: chainId,
        block: {
          number: Number(decodeCheckpoint(latestCheckpoint).blockNumber),
          timestamp: Number(decodeCheckpoint(latestCheckpoint).blockTimestamp),
        },
      };
    }
    return status;
  },
});
