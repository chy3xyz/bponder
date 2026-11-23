import { expect, test } from "bun:test";
import type { Client, SqlResult, Status } from "bponder-client";
import {
  getPonderQueryOptions,
  ponderStatusQueryKey,
  resolvePonderQuerySource,
} from "./utils.ts";

const result: SqlResult = { rows: [{ n: 1 }] };

const createMockClient = (): Client & {
  sqlCalls: string[];
  queryCalls: string[];
  statusCalls: number;
} => {
  const sqlCalls: string[] = [];
  const queryCalls: string[] = [];
  return {
    sqlCalls,
    queryCalls,
    statusCalls: 0,
    getStatus: async () => {
      return { checkpoint: { blockNumber: 1, id: "1-0" } } satisfies Status;
    },
    sql: async (sql) => {
      sqlCalls.push(sql);
      return result;
    },
    query: async (query) => {
      queryCalls.push(query);
      return result;
    },
    live: () => ({ unsubscribe: () => undefined }),
  };
};

test("resolvePonderQuerySource treats a string as sql", () => {
  expect(resolvePonderQuerySource("SELECT 1 AS n")).toEqual({
    method: "sql",
    text: "SELECT 1 AS n",
  });
});

test("resolvePonderQuerySource reads sql and query objects", () => {
  expect(resolvePonderQuerySource({ sql: "SELECT 1" })).toEqual({
    method: "sql",
    text: "SELECT 1",
  });
  expect(resolvePonderQuerySource({ query: "SELECT 2" })).toEqual({
    method: "query",
    text: "SELECT 2",
  });
});

test("getPonderQueryOptions uses client.sql for { sql }", async () => {
  const client = createMockClient();
  const options = getPonderQueryOptions(client, { sql: "SELECT 1 AS n" });

  expect(options.queryKey).toEqual(["__ponder_react", "sql", "SELECT 1 AS n"]);
  expect(await options.queryFn()).toEqual(result);
  expect(client.sqlCalls).toEqual(["SELECT 1 AS n"]);
  expect(client.queryCalls).toEqual([]);
});

test("getPonderQueryOptions uses client.query for { query }", async () => {
  const client = createMockClient();
  const options = getPonderQueryOptions(client, { query: "SELECT 2 AS n" });

  expect(options.queryKey).toEqual([
    "__ponder_react",
    "query",
    "SELECT 2 AS n",
  ]);
  expect(await options.queryFn()).toEqual(result);
  expect(client.queryCalls).toEqual(["SELECT 2 AS n"]);
  expect(client.sqlCalls).toEqual([]);
});

test("getPonderQueryOptions string helper uses client.sql", async () => {
  const client = createMockClient();
  const options = getPonderQueryOptions<{ n: number }>(client, "SELECT 1 AS n");

  expect(options.queryKey).toEqual(["__ponder_react", "sql", "SELECT 1 AS n"]);
  const data = await options.queryFn();
  expect(data.rows).toEqual([{ n: 1 }]);
  expect(client.sqlCalls).toEqual(["SELECT 1 AS n"]);
});

test("ponderStatusQueryKey is stable", () => {
  expect(ponderStatusQueryKey).toEqual(["__ponder_react", "status"]);
});
