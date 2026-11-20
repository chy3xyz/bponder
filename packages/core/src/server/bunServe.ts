export type BunFetchHandler = (
  request: Request,
) => Response | Promise<Response>;

export type BunServer = {
  port: number;
  stop: (force?: boolean) => Promise<void>;
};

export async function stopBunServer(
  server: BunServer,
  timeoutMs = 1_000,
): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const forceStop = new Promise<void>((resolve, reject) => {
    timeout = setTimeout(() => {
      server.stop(true).then(resolve, reject);
    }, timeoutMs);
  });

  try {
    await Promise.race([server.stop(), forceStop]);
  } finally {
    clearTimeout(timeout);
  }
}

type BunRuntime = {
  serve: (options: {
    fetch: BunFetchHandler;
    hostname?: string;
    port: number;
  }) => BunServer;
};

export function startBunServer({
  fetch = (request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return new Response(null, { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
  hostname,
  port,
}: {
  fetch?: BunFetchHandler;
  hostname?: string;
  port: number;
}): BunServer {
  const bun = (globalThis as typeof globalThis & { Bun: BunRuntime }).Bun;
  const server = bun.serve({ fetch, hostname, port });

  return {
    port: server.port,
    stop: (force = false) => server.stop(force),
  };
}
