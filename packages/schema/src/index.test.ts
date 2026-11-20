import { expect, test } from "bun:test";
import { onchainTable } from "./index";

test("onchainTable is exported", () => {
  expect(typeof onchainTable).toBe("function");
});

test("onchainTable records the table name and columns", () => {
  const columns = { id: "hex", balance: "bigint" };

  expect(onchainTable("account", columns)).toEqual({
    name: "account",
    columns,
  });
});
