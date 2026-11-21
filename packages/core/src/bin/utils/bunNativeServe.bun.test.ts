import { describe, expect, test } from "bun:test";
import { createBunSqlDatabase } from "../../database/bunSql.js";
import {
  formatBunNativeOrigin,
  getUnsupportedBunNativeSchema,
  isBunNativeEnabled,
  isBunNativeServeEnabled,
  startBunNativeServe,
} from "./bunNativeServe.js";

const bunVersions = { bun: "1.4.5" };
const nodeVersions = {};

test("isBunNativeEnabled defaults on when process.versions.bun is set", () => {
  expect(isBunNativeEnabled({ env: {}, versions: bunVersions })).toBe(true);
  expect(isBunNativeEnabled({ env: {} })).toBe(true);
});

test("isBunNativeEnabled defaults off without bun", () => {
  expect(isBunNativeEnabled({ env: {}, versions: nodeVersions })).toBe(false);
});

test("isBunNativeEnabled honors --native", () => {
  expect(
    isBunNativeEnabled({ native: true, env: {}, versions: nodeVersions }),
  ).toBe(true);
  expect(
    isBunNativeEnabled({
      native: true,
      env: { PONDER_USE_VITE: "1" },
      versions: bunVersions,
    }),
  ).toBe(true);
});

test("isBunNativeEnabled honors PONDER_BUN_NATIVE", () => {
  expect(
    isBunNativeEnabled({
      env: { PONDER_BUN_NATIVE: "1" },
      versions: nodeVersions,
    }),
  ).toBe(true);
  expect(
    isBunNativeEnabled({
      env: { PONDER_BUN_NATIVE: "true" },
      versions: nodeVersions,
    }),
  ).toBe(true);
  expect(
    isBunNativeEnabled({
      env: { PONDER_BUN_NATIVE: "YES" },
      versions: nodeVersions,
    }),
  ).toBe(true);
  expect(
    isBunNativeEnabled({
      env: { PONDER_BUN_NATIVE: "0" },
      versions: nodeVersions,
    }),
  ).toBe(false);
});

test("isBunNativeEnabled uses PONDER_USE_VITE to force the Vite path", () => {
  expect(
    isBunNativeEnabled({
      env: { PONDER_USE_VITE: "1" },
      versions: bunVersions,
    }),
  ).toBe(false);
  expect(
    isBunNativeEnabled({
      env: { PONDER_USE_VITE: "true" },
      versions: bunVersions,
    }),
  ).toBe(false);
  expect(
    isBunNativeEnabled({
      env: { PONDER_USE_VITE: "YES" },
      versions: bunVersions,
    }),
  ).toBe(false);
  expect(
    isBunNativeEnabled({
      env: { PONDER_USE_VITE: "0" },
      versions: bunVersions,
    }),
  ).toBe(true);
  expect(
    isBunNativeEnabled({
      env: { PONDER_USE_VITE: "1", PONDER_BUN_NATIVE: "1" },
      versions: bunVersions,
    }),
  ).toBe(false);
});

test("isBunNativeServeEnabled is false by default even under bun", () => {
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

test("getUnsupportedBunNativeSchema allows public, custom, default, and unset", () => {
  expect(getUnsupportedBunNativeSchema({ env: {} })).toBeUndefined();
  expect(
    getUnsupportedBunNativeSchema({ schema: undefined, env: {} }),
  ).toBeUndefined();
  expect(
    getUnsupportedBunNativeSchema({ schema: "public", env: {} }),
  ).toBeUndefined();
  expect(
    getUnsupportedBunNativeSchema({ schema: "  public  ", env: {} }),
  ).toBeUndefined();
  expect(
    getUnsupportedBunNativeSchema({ env: { DATABASE_SCHEMA: "public" } }),
  ).toBeUndefined();
  expect(
    getUnsupportedBunNativeSchema({ schema: "", env: {} }),
  ).toBeUndefined();
  expect(
    getUnsupportedBunNativeSchema({ schema: "ponder", env: {} }),
  ).toBeUndefined();
  expect(
    getUnsupportedBunNativeSchema({ env: { DATABASE_SCHEMA: "expected" } }),
  ).toBeUndefined();
  expect(
    getUnsupportedBunNativeSchema({
      schema: "public",
      env: { DATABASE_SCHEMA: "other" },
    }),
  ).toBeUndefined();
  expect(
    getUnsupportedBunNativeSchema({
      schema: "other",
      env: { DATABASE_SCHEMA: "public" },
    }),
  ).toBeUndefined();
});

test("getUnsupportedBunNativeSchema rejects invalid identifiers", () => {
  expect(getUnsupportedBunNativeSchema({ schema: "ponder-app", env: {} })).toBe(
    "ponder-app",
  );
  expect(
    getUnsupportedBunNativeSchema({ env: { DATABASE_SCHEMA: "foo;drop" } }),
  ).toBe("foo;drop");
  expect(
    getUnsupportedBunNativeSchema({
      schema: "pg schema",
      env: { DATABASE_SCHEMA: "public" },
    }),
  ).toBe("pg schema");
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
      let native: Awaited<ReturnType<typeof startBunNativeServe>> | undefined;

      try {
        native = await startBunNativeServe({
          url: databaseUrl,
          port: 0,
          schema,
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
