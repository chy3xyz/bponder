import { expect, test } from "bun:test";
import { compileToCreateTableSql } from "./compile";
import { boolean, integer, onchainTable, text } from "./index";

test("compiles typed columns to quoted PostgreSQL CREATE TABLE SQL", () => {
  const table = onchainTable('user"account', {
    'wallet"id': text(),
    balance: integer(),
    active: boolean(),
  });

  expect(compileToCreateTableSql(table)).toBe(
    'CREATE TABLE "user""account" ("wallet""id" text, "balance" integer, "active" boolean)',
  );
});
