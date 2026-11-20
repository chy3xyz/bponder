import { afterEach, expect, test } from "bun:test";

import { getPackageManager } from "./getPackageManager.js";

const originalUserAgent = process.env.npm_config_user_agent;

afterEach(() => {
  if (originalUserAgent === undefined) {
    delete process.env.npm_config_user_agent;
  } else {
    process.env.npm_config_user_agent = originalUserAgent;
  }
});

test("defaults to bun when package manager is undetectable", () => {
  delete process.env.npm_config_user_agent;
  expect(getPackageManager({})).toBe("bun");
});

test("honors --bun even when the user agent is another manager", () => {
  process.env.npm_config_user_agent = "pnpm/12.15.0 npm/? node/v22.12.0";
  expect(getPackageManager({ options: { bun: true } })).toBe("bun");
});

test("detects pnpm from the user agent when no flag is set", () => {
  process.env.npm_config_user_agent = "pnpm/12.15.0 npm/? node/v22.12.0";
  expect(getPackageManager({})).toBe("pnpm");
});

test("detects npm from the user agent when no flag is set", () => {
  process.env.npm_config_user_agent = "npm/10.9.0 node/v22.12.0";
  expect(getPackageManager({})).toBe("npm");
});
