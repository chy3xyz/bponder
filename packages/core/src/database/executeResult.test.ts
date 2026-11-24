import { expect, test } from "vitest";
import { normalizeExecuteRows } from "./executeResult.js";

test("normalizeExecuteRows accepts bun-sql row arrays", () => {
  const rows = normalizeExecuteRows<{ operation_id: string | null }>([
    { operation_id: "42" },
  ]);
  expect(rows[0]?.operation_id).toBe("42");
});

test("normalizeExecuteRows accepts node-postgres { rows }", () => {
  const rows = normalizeExecuteRows<{ count: string }>({
    rows: [{ count: "3" }],
    rowCount: 1,
  });
  expect(rows[0]?.count).toBe("3");
});

test("normalizeExecuteRows returns [] for unexpected shapes", () => {
  expect(normalizeExecuteRows(null)).toEqual([]);
  expect(normalizeExecuteRows(undefined)).toEqual([]);
  expect(normalizeExecuteRows({ rowCount: 0 })).toEqual([]);
  expect(normalizeExecuteRows("nope")).toEqual([]);
});

test("raw array .rows access matches the live finalize crash shape", () => {
  const bunSqlResult: unknown = [{ operation_id: null }];
  // Same assumption as actions.ts before normalizeExecuteRows: result.rows[0]
  expect(
    (bunSqlResult as { rows?: { operation_id: string | null }[] }).rows,
  ).toBeUndefined();
  expect(
    normalizeExecuteRows<{ operation_id: string | null }>(bunSqlResult)[0]
      ?.operation_id,
  ).toBeNull();
});
