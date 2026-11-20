import { expect, test } from "bun:test";
import { integer, onchainTable, text } from "./index";

test("onchainTable is exported", () => {
  expect(typeof onchainTable).toBe("function");
});

test("onchainTable records the table name and columns", () => {
  const columns = { id: text(), balance: integer() };

  expect(onchainTable("account", columns)).toEqual({
    name: "account",
    columns,
  });
});
