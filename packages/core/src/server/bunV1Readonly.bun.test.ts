import { describe, expect, test } from "bun:test";
import { encodeCheckpoint } from "@/utils/checkpoint.js";
import { createBunV1HandlersFromReadonlyQB } from "./bunV1Readonly.js";

const checkpoint = encodeCheckpoint({
  blockTimestamp: 1n,
  chainId: 1n,
  blockNumber: 42n,
  transactionIndex: 0n,
  eventType: 5,
  eventIndex: 0n,
});

const createMockQb = ({
  checkpoints = [],
  sqlResult,
}: {
  checkpoints?: { latestCheckpoint: string }[];
  sqlResult?: unknown;
} = {}) => ({
  wrap: (_label: { label: string }, query: (db: unknown) => unknown) =>
    query({
      select: () => ({
        from: () => checkpoints,
      }),
      execute: () => sqlResult ?? { rows: [] },
    }),
});

describe("createBunV1HandlersFromReadonlyQB", () => {
  test("getStatus maps empty _ponder_checkpoint rows to a null checkpoint", async () => {
    const { getStatus } = createBunV1HandlersFromReadonlyQB(
      createMockQb() as never,
    );

    expect(await getStatus()).toEqual({ checkpoint: null });
  });

  test("getStatus maps the latest _ponder_checkpoint row to BunV1Status", async () => {
    const older = encodeCheckpoint({
      blockTimestamp: 1n,
      chainId: 1n,
      blockNumber: 7n,
      transactionIndex: 0n,
      eventType: 5,
      eventIndex: 0n,
    });
    const { getStatus } = createBunV1HandlersFromReadonlyQB(
      createMockQb({
        checkpoints: [
          { latestCheckpoint: older },
          { latestCheckpoint: checkpoint },
        ],
      }) as never,
    );

    expect(await getStatus()).toEqual({
      checkpoint: { blockNumber: 42, id: checkpoint },
    });
  });

  test("executeSql runs a SELECT through readonlyQB.wrap", async () => {
    const { executeSql } = createBunV1HandlersFromReadonlyQB(
      createMockQb({ sqlResult: { rows: [{ n: 1 }] } }) as never,
    );

    expect(await executeSql("SELECT 1 AS n")).toEqual([{ n: 1 }]);
  });

  test("executeSql rejects non-SELECT statements", async () => {
    let wrapped = false;
    const { executeSql } = createBunV1HandlersFromReadonlyQB({
      wrap: () => {
        wrapped = true;
        return [];
      },
    } as never);

    await expect(executeSql("INSERT INTO t VALUES (1)")).rejects.toThrow(
      "Only readonly SELECT statements are allowed",
    );
    expect(wrapped).toBe(false);
  });
});
