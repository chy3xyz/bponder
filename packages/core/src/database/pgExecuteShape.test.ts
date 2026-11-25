import { expect, test } from "vitest";
import { withPgExecuteShape } from "./pgExecuteShape.js";

test("withPgExecuteShape wraps bun-sql row arrays as { rows }", async () => {
  const raw = {
    execute: async () => [{ id: 1 }],
    select: () => "ok",
  };
  const db = withPgExecuteShape(raw);
  await expect(db.execute()).resolves.toEqual({ rows: [{ id: 1 }] });
  expect(db.select()).toBe("ok");
});

test("withPgExecuteShape leaves pg { rows } results unchanged", async () => {
  const raw = {
    execute: async () => ({ rows: [{ id: 2 }], rowCount: 1 }),
  };
  const db = withPgExecuteShape(raw);
  await expect(db.execute()).resolves.toEqual({
    rows: [{ id: 2 }],
    rowCount: 1,
  });
});
