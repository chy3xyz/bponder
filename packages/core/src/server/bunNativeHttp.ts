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

/**
 * Prefer built-in Bun `/health` + `/v1/*`, then fall through to the user Hono app.
 */
export const createBunNativeHttpFetch = ({
  v1Fetch,
  honoApp,
}: {
  v1Fetch: BunFetchHandler;
  honoApp?: BunHonoLike;
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
