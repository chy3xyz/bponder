"use client";

import type { Client, Status } from "@ponder/client";
import {
  type DefaultError,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useContext, useEffect, useMemo } from "react";
import { PonderContext } from "./context.js";
import {
  getPonderQueryOptions,
  type PonderQueryResult,
  type PonderQuerySource,
  ponderStatusQueryKey,
  resolvePonderQuerySource,
} from "./utils.js";

export function usePonderQuery<
  TRow = Record<string, unknown>,
  TError = DefaultError,
  TData = PonderQueryResult<TRow>,
>(
  params: PonderQuerySource & {
    live?: boolean;
  } & Omit<
      UseQueryOptions<PonderQueryResult<TRow>, TError, TData>,
      "queryFn" | "queryKey"
    >,
): UseQueryResult<TData, TError> {
  const live = params.live ?? true;
  const queryClient = useQueryClient();
  const client = usePonderClient();
  const { method, text } = resolvePonderQuerySource(params);

  const queryOptions = useMemo(
    () =>
      getPonderQueryOptions<TRow>(
        client,
        method === "sql" ? { sql: text } : { query: text },
      ),
    [client, method, text],
  );

  useEffect(() => {
    if (live === false || params.enabled === false) return;

    const { unsubscribe } = client.live(() => {
      void queryClient.invalidateQueries({ queryKey: queryOptions.queryKey });
    });
    return unsubscribe;
  }, [live, params.enabled, client, queryOptions.queryKey, queryClient]);

  return useQuery({
    ...params,
    queryKey: queryOptions.queryKey,
    queryFn: queryOptions.queryFn,
    staleTime: live
      ? (params.staleTime ?? Number.POSITIVE_INFINITY)
      : params.staleTime,
  });
}

export function usePonderClient(): Client {
  const client = useContext(PonderContext);
  if (client === undefined) {
    throw new Error("PonderProvider not found");
  }
  return client;
}

export function usePonderQueryOptions<TRow = Record<string, unknown>>(
  source: PonderQuerySource | string,
): {
  queryKey: QueryKey;
  queryFn: () => Promise<PonderQueryResult<TRow>>;
} {
  const client = usePonderClient();
  return getPonderQueryOptions<TRow>(client, source);
}

export function usePonderStatus<TError = DefaultError>(
  params?: { live?: boolean } & Omit<
    UseQueryOptions<Status, TError>,
    "queryFn" | "queryKey"
  >,
): UseQueryResult<Status, TError> {
  const live = params?.live ?? true;
  const queryClient = useQueryClient();
  const client = usePonderClient();

  useEffect(() => {
    if (live === false || params?.enabled === false) return;

    const { unsubscribe } = client.live((status) => {
      queryClient.setQueryData(ponderStatusQueryKey, status);
    });
    return unsubscribe;
  }, [live, params?.enabled, client, queryClient]);

  return useQuery({
    ...params,
    queryKey: ponderStatusQueryKey,
    queryFn: () => client.getStatus(),
    staleTime: live
      ? (params?.staleTime ?? Number.POSITIVE_INFINITY)
      : params?.staleTime,
  });
}
