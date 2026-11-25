import { expect, test } from "vitest";
import { asError } from "./asError.js";

test("asError passes through normal Errors", () => {
  const err = new Error("boom");
  expect(asError(err)).toBe(err);
});

test("asError inspects Error-like objects with empty message", () => {
  const weird = new Error("");
  weird.name = "";
  const out = asError(weird);
  expect(out).not.toBe(weird);
  expect(out.message.length).toBeGreaterThan(0);
  expect(out.message).not.toMatch(/^undefined/);
});

test("asError stringifies plain objects", () => {
  const out = asError({ code: "RESOLVE", path: "./missing.ts" });
  expect(out.message).toContain("RESOLVE");
  expect(out.message).toContain("missing.ts");
});
