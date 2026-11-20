import { expect, test } from "bun:test";
import { isBunRuntime } from "./assertBun.js";

test("isBunRuntime is true under bun test", () => {
  expect(isBunRuntime()).toBe(true);
  expect(process.versions.bun).toBeDefined();
});
