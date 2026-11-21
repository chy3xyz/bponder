import { describe, expect, test } from "bun:test";
import { createBunSqlDatabase } from "../../database/bunSql.js";
import {
  formatBunNativeOrigin,
  isBunNativeServeEnabled,
  startBunNativeServe,
} from "./bunNativeServe.js";

test("isBunNativeServeEnabled is false by default", () => {
  expect(isBunNativeServeEnabled({ env: {} })).toBe(false);
});

test("isBunNativeServeEnabled honors --native", () => {
  expect(isBunNativeServeEnabled({ native: true, env: {} })).toBe(true);
});

test("isBunNativeServeEnabled honors PONDER_BUN_NATIVE", () => {
  expect(isBunNativeServeEnabled({ env: { PONDER_BUN_NATIVE: "1" } })).toBe(
    true,
  );
  expect(isBunNativeServeEnabled({ env: { PONDER_BUN_NATIVE: "true" } })).toBe(
    true,
  );
  expect(isBunNativeServeEnabled({ env: { PONDER_BUN_NATIVE: "YES" } })).toBe(
    true,
  );
  expect(isBunNativeServeEnabled({ env: { PONDER_BUN_NATIVE: "0" } })).toBe(
    false,
  );
});

test("formatBunNativeOrigin uses localhost for wildcard binds", () => {
  expect(formatBunNativeOrigin({ port: 42069 })).toBe("http://127.0.0.1:42069");
  expect(formatBunNativeOrigin({ hostname: "0.0.0.0", port: 9 })).toBe(
    "http://127.0.0.1:9",
  );
  expect(formatBunNativeOrigin({ hostname: "::", port: 9 })).toBe(
    "http://127.0.0.1:9",
  );
  expect(formatBunNativeOrigin({ hostname: "api.local", port: 80 })).toBe(
    "http://api.local:80",
  );
});

const url = process.env.DATABASE_URL;
const skip = typeof url !== "string" || url.length === 0;

if (skip) {
  test.skip("startBunNativeServe requires a non-empty DATABASE_URL", () => {});
} else {
  describe("startBunNativeServe", () => {
    test("opens Bun.SQL, serves /health and /v1, and prints an origin", async () => {
      const databaseUrl = url as string;
      const schema = `ponder_bun_serve_${crypto.randomUUID().replaceAll("-", "")}`;
      const root = createBunSqlDatabase({ url: databaseUrl });
      await root.admin.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
      await root.close();

      const scoped = new URL(databaseUrl);
      scoped.searchParams.set("options", `-csearch_path=${schema}`);
      let native: Awaited<ReturnType<typeof startBunNativeServe>> | undefined;

      try {
        native = await startBunNativeServe({
          url: scoped.toString(),
          port: 0,
        });

        expect(native.origin).toBe(
          formatBunNativeOrigin({ port: native.server.port }),
        );

        const health = await fetch(`${native.origin}/health`);
        expect(health.status).toBe(200);

        const status = await fetch(`${native.origin}/v1/status`);
        expect(status.status).toBe(200);
        expect(await status.json()).toEqual({ checkpoint: null });
      } finally {
        await native?.stop();
        const cleanup = createBunSqlDatabase({ url: databaseUrl });
        await cleanup.admin.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        await cleanup.close();
      }
    });
  });
}
