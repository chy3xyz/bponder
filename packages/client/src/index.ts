export type Checkpoint = {
  blockNumber: number;
  id: string;
};

export type Status = {
  checkpoint: Checkpoint | null;
};

export type SqlResult = {
  rows: Record<string, unknown>[];
};

export type CreateClientOptions = {
  url: string;
  fetch?: typeof globalThis.fetch;
};

export type Client = {
  getStatus: () => Promise<Status>;
  sql: (sql: string) => Promise<SqlResult>;
  query: (query: string) => Promise<SqlResult>;
  live: (
    onStatus: (status: Status) => void,
    onError?: (error: Error) => void,
  ) => { unsubscribe: () => void };
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const joinUrl = (base: string, path: string) =>
  `${trimTrailingSlash(base)}${path.startsWith("/") ? path : `/${path}`}`;

const readErrorMessage = async (response: Response) => {
  const text = await response.text();
  if (text.length === 0) {
    return `Request failed with status ${response.status}`;
  }

  try {
    const json: unknown = JSON.parse(text);
    if (
      json !== null &&
      typeof json === "object" &&
      "error" in json &&
      typeof json.error === "string"
    ) {
      return json.error;
    }
  } catch {
    // Use the raw body as the error message.
  }

  return text;
};

const readJson = async <T>(response: Response): Promise<T> => {
  if (response.ok === false) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as T;
};

type SseEvent = { event: string; data: string };

const splitSse = (buffer: string): { events: SseEvent[]; rest: string } => {
  const events: SseEvent[] = [];
  let rest = buffer;

  while (true) {
    const split = rest.indexOf("\n\n");
    if (split === -1) break;

    const raw = rest.slice(0, split);
    rest = rest.slice(split + 2);
    if (raw.trim() === "") continue;

    let event = "message";
    const dataLines: string[] = [];
    for (const line of raw.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
    events.push({ event, data: dataLines.join("\n") });
  }

  return { events, rest };
};

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error(String(error));

/**
 * Create a client for querying Ponder apps over the Bun `/v1` contract.
 *
 * @example
 * ```ts
 * import { createClient } from "@ponder/client";
 *
 * const client = createClient({ url: "http://localhost:42069" });
 * const status = await client.getStatus();
 * const { rows } = await client.sql("SELECT 1 AS n");
 * ```
 */
export const createClient = ({
  url,
  fetch: customFetch,
}: CreateClientOptions): Client => {
  const baseUrl = trimTrailingSlash(url);
  const fetchFn: typeof globalThis.fetch = (input, init) =>
    (customFetch ?? globalThis.fetch)(input, init);

  const postSql = async (body: { sql: string } | { query: string }) => {
    const response = await fetchFn(joinUrl(baseUrl, "/v1/sql"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return readJson<SqlResult>(response);
  };

  return {
    getStatus: async () => {
      const response = await fetchFn(joinUrl(baseUrl, "/v1/status"));
      return readJson<Status>(response);
    },
    sql: (sql) => postSql({ sql }),
    query: (query) => postSql({ query }),
    live: (onStatus, onError) => {
      const controller = new AbortController();

      void (async () => {
        try {
          const response = await fetchFn(joinUrl(baseUrl, "/v1/live"), {
            signal: controller.signal,
            headers: { accept: "text/event-stream" },
          });
          if (response.ok === false) {
            throw new Error(await readErrorMessage(response));
          }
          if (response.body === null) {
            throw new Error("Live stream has no body");
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (controller.signal.aborted === false) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parsed = splitSse(buffer);
            buffer = parsed.rest;

            for (const event of parsed.events) {
              if (event.event !== "status") continue;
              onStatus(JSON.parse(event.data) as Status);
            }
          }
        } catch (error) {
          if (controller.signal.aborted) return;
          onError?.(toError(error));
        }
      })();

      return {
        unsubscribe: () => {
          controller.abort();
        },
      };
    },
  };
};
