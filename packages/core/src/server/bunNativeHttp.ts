import type { BunFetchHandler } from "./bunServe.js";

const RESERVED_API_PATHS = new Set([
  "/health",
  "/ready",
  "/status",
  "/metrics",
  "/client",
]);

export const isBunNativeReservedApiPath = (pathname: string) =>
  RESERVED_API_PATHS.has(pathname) ||
  pathname === "/v1" ||
  pathname.startsWith("/v1/");

export type BunHonoLike = {
  fetch: (request: Request) => Response | Promise<Response>;
  routes?: ReadonlyArray<{ path?: unknown }>;
};

export type BunNativeHttpOps = {
  getReady?: () => boolean | Promise<boolean>;
  getMetrics?: () => string | Promise<string>;
  getStatus?: () => unknown | Promise<unknown>;
};

/**
 * Prefer built-in Bun `/health`, `/ready`, `/metrics`, `/status`, `/v1/*`,
 * then fall through to the user Hono app.
 */
export const createBunNativeHttpFetch = ({
  v1Fetch,
  honoApp,
  ops,
}: {
  v1Fetch: BunFetchHandler;
  honoApp?: BunHonoLike;
  ops?: BunNativeHttpOps;
}): BunFetchHandler => {
  return async (request) => {
    const { pathname } = new URL(request.url);
    if (
      pathname === "/health" ||
      pathname === "/v1" ||
      pathname.startsWith("/v1/")
    ) {
      return v1Fetch(request);
    }

    if (request.method === "GET" && pathname === "/ready") {
      if (ops?.getReady === undefined) {
        return new Response("Not Found", { status: 404 });
      }
      const isReady = await ops.getReady();
      if (isReady) {
        return new Response(null, { status: 200 });
      }
      return new Response("Historical indexing is not complete.", {
        status: 503,
      });
    }

    if (request.method === "GET" && pathname === "/metrics") {
      if (ops?.getMetrics === undefined) {
        return new Response("Not Found", { status: 404 });
      }
      try {
        return new Response(await ops.getMetrics(), {
          status: 200,
          headers: { "Content-Type": "text/plain; version=0.0.4" },
        });
      } catch (error) {
        return Response.json(
          error instanceof Error ? { error: error.message } : error,
          { status: 500 },
        );
      }
    }

    if (request.method === "GET" && pathname === "/status") {
      if (ops?.getStatus === undefined) {
        return new Response("Not Found", { status: 404 });
      }
      return Response.json(await ops.getStatus());
    }

    if (honoApp !== undefined) {
      return honoApp.fetch(request);
    }
    return new Response("Not Found", { status: 404 });
  };
};

export const validateBunNativeHonoRoutes = (
  app: BunHonoLike,
): string | undefined => {
  for (const route of app.routes ?? []) {
    if (typeof route.path !== "string") continue;
    if (isBunNativeReservedApiPath(route.path)) {
      return `Validation failed: API route "${route.path}" is reserved for internal use.`;
    }
  }
  return undefined;
};
