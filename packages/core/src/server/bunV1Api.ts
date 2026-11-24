import { normalizeExecuteRows } from "@/database/executeResult.js";
import type { BunSqlDatabase } from "../database/bunSql.js";
import type { BunFetchHandler } from "./bunServe.js";

const checkpointKey = "historical_checkpoint";

export type BunV1Checkpoint = {
  blockNumber: number;
  id: string;
};

export type BunV1Status = {
  checkpoint: BunV1Checkpoint | null;
};

export type BunV1ApiDependencies = {
  getStatus?: () => BunV1Status | Promise<BunV1Status>;
  executeSql?: (sql: string) => Promise<Record<string, unknown>[]>;
  database?: BunSqlDatabase;
  pollIntervalMs?: number;
  heartbeatIntervalMs?: number;
};

const stripSqlComments = (sql: string) =>
  sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");

const stripSqlStrings = (sql: string) =>
  sql.replace(/'(?:''|[^'])*'/g, "''").replace(/"(?:""|[^"])*"/g, '""');

const MUTATING_KEYWORD =
  /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|CALL|DO|EXECUTE|LOCK|VACUUM|REFRESH|MERGE|REPLACE)\b/i;

export const isReadonlySelectSql = (sql: string): boolean => {
  const stripped = stripSqlComments(sql).trim();
  if (stripped.length === 0) return false;

  const withoutStrings = stripSqlStrings(stripped);
  const withoutTrailingSemi = withoutStrings.replace(/;\s*$/, "");
  if (withoutTrailingSemi.includes(";")) return false;
  if (/\bSELECT\s+INTO\b/i.test(withoutTrailingSemi)) return false;
  if (MUTATING_KEYWORD.test(withoutTrailingSemi)) return false;

  const keyword = stripped.match(/^[A-Za-z_]+/)?.[0]?.toUpperCase();
  return (
    keyword === "SELECT" ||
    keyword === "WITH" ||
    keyword === "TABLE" ||
    keyword === "VALUES"
  );
};

const toRows = (result: unknown): Record<string, unknown>[] =>
  normalizeExecuteRows(result);

const jsonError = (message: string, status: number) =>
  Response.json({ error: message }, { status });

const readMetaStatus = async (
  database: BunSqlDatabase,
): Promise<BunV1Status> => {
  const rows = await database.admin`
    SELECT value FROM ponder_bun_meta WHERE key = ${checkpointKey}
  `;
  const value = rows[0]?.value;
  const checkpoint =
    typeof value === "string" ? (JSON.parse(value) as BunV1Checkpoint) : null;
  return { checkpoint };
};

const executeReadonlySql = async (database: BunSqlDatabase, query: string) =>
  database.user.begin(async (sql) => {
    await sql.unsafe("SET TRANSACTION READ ONLY");
    return toRows(await sql.unsafe(query));
  });

const encodeSse = (event: string, data = "") =>
  `event: ${event}\ndata: ${data}\n\n`;

export const createBunV1ApiFetch = (
  deps: BunV1ApiDependencies = {},
): BunFetchHandler => {
  const getStatus =
    deps.getStatus ??
    (deps.database === undefined
      ? () => ({ checkpoint: null })
      : () => readMetaStatus(deps.database!));
  const executeSql =
    deps.executeSql ??
    (deps.database === undefined
      ? undefined
      : (sql: string) => executeReadonlySql(deps.database!, sql));
  const pollIntervalMs = deps.pollIntervalMs ?? 250;
  const heartbeatIntervalMs = deps.heartbeatIntervalMs ?? 15_000;

  return async (request) => {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(null, { status: 200 });
    }

    if (request.method === "GET" && url.pathname === "/v1/status") {
      return Response.json(await getStatus());
    }

    if (request.method === "POST" && url.pathname === "/v1/sql") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return jsonError("Invalid JSON body", 400);
      }

      if (body === null || typeof body !== "object") {
        return jsonError("Invalid JSON body", 400);
      }

      const sql =
        "sql" in body && typeof body.sql === "string"
          ? body.sql
          : "query" in body && typeof body.query === "string"
            ? body.query
            : undefined;
      if (sql === undefined || sql.trim() === "") {
        return jsonError("Missing sql or query", 400);
      }
      if (isReadonlySelectSql(sql) === false) {
        return jsonError("Only readonly SELECT statements are allowed", 400);
      }
      if (executeSql === undefined) {
        return jsonError("SQL executor is not configured", 503);
      }

      try {
        return Response.json({ rows: await executeSql(sql) });
      } catch (error) {
        return jsonError(
          error instanceof Error ? error.message : "SQL query failed",
          500,
        );
      }
    }

    if (request.method === "GET" && url.pathname === "/v1/live") {
      const encoder = new TextEncoder();
      let cleanup = () => {};
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          const send = (chunk: string) => {
            if (closed) return;
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {
              cleanup();
            }
          };

          let lastPayload: string | undefined;
          const pushStatus = async () => {
            try {
              const payload = JSON.stringify(await getStatus());
              if (payload === lastPayload) return;
              lastPayload = payload;
              send(encodeSse("status", payload));
            } catch {
              // Keep the stream alive if a poll fails.
            }
          };

          void pushStatus();
          const poll = setInterval(() => {
            void pushStatus();
          }, pollIntervalMs);
          const heartbeat = setInterval(() => {
            send(encodeSse("heartbeat"));
          }, heartbeatIntervalMs);

          cleanup = () => {
            if (closed) return;
            closed = true;
            clearInterval(poll);
            clearInterval(heartbeat);
          };

          request.signal.addEventListener("abort", () => {
            cleanup();
            try {
              controller.close();
            } catch {
              // Already closed.
            }
          });
        },
        cancel() {
          cleanup();
        },
      });

      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  };
};
