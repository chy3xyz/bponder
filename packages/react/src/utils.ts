import type { Client } from "bponder-client";
import type { QueryKey } from "@tanstack/react-query";

export type PonderQuerySource =
  | { sql: string; query?: never }
  | { query: string; sql?: never };

export type PonderQueryResult<TRow = Record<string, unknown>> = {
  rows: TRow[];
};

export type ResolvedPonderQuerySource = {
  method: "sql" | "query";
  text: string;
};

export const ponderStatusQueryKey: QueryKey = ["__ponder_react", "status"];

export function resolvePonderQuerySource(
  source: PonderQuerySource | string,
): ResolvedPonderQuerySource {
  if (typeof source === "string") {
    return { method: "sql", text: source };
  }
  if ("sql" in source && typeof source.sql === "string") {
    return { method: "sql", text: source.sql };
  }
  return { method: "query", text: source.query };
}

export function getPonderQueryOptions<TRow = Record<string, unknown>>(
  client: Client,
  source: PonderQuerySource | string,
): {
  queryKey: QueryKey;
  queryFn: () => Promise<PonderQueryResult<TRow>>;
} {
  const { method, text } = resolvePonderQuerySource(source);
  const queryKey: QueryKey = ["__ponder_react", method, text];

  return {
    queryKey,
    queryFn: () =>
      (method === "sql" ? client.sql(text) : client.query(text)) as Promise<
        PonderQueryResult<TRow>
      >,
  };
}
