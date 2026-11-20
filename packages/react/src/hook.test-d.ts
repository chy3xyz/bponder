import type { Client, Status } from "@ponder/client";
import { usePonderClient, usePonderQuery, usePonderStatus } from "./hook.js";
import type { PonderQueryResult } from "./utils.js";

declare function expectType<T>(value: T): void;

function TypeTests() {
  const sqlQuery = usePonderQuery<{ n: number }>({
    sql: "SELECT 1 AS n",
  });

  if (sqlQuery.isSuccess) {
    expectType<{ n: number }[]>(sqlQuery.data.rows);
  }

  const selectedQuery = usePonderQuery<{ n: number }, Error, number[]>({
    sql: "SELECT 1 AS n",
    select: (data) => data.rows.map((row) => row.n),
  });

  if (selectedQuery.isSuccess) {
    expectType<number[]>(selectedQuery.data);
  }

  const queryQuery = usePonderQuery({
    query: "SELECT 1 AS n",
  });

  if (queryQuery.isSuccess) {
    expectType<Record<string, unknown>[]>(queryQuery.data.rows);
    expectType<PonderQueryResult>(queryQuery.data);
  }

  const statusQuery = usePonderStatus();

  if (statusQuery.isSuccess) {
    expectType<Status>(statusQuery.data);
    expectType<Status["checkpoint"]>(statusQuery.data.checkpoint);
  }

  expectType<Client>(usePonderClient());

  // @ts-expect-error cannot pass both sql and query
  usePonderQuery({
    sql: "SELECT 1",
    query: "SELECT 1",
  });

  return null;
}

void TypeTests;
