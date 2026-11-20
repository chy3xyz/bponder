import { expect, test } from "bun:test";
import {
  getPonderQueryOptions,
  PonderProvider,
  ponderStatusQueryKey,
  resolvePonderQuerySource,
  usePonderClient,
  usePonderQuery,
  usePonderQueryOptions,
  usePonderStatus,
} from "./index.ts";

test("public exports", () => {
  expect(typeof getPonderQueryOptions).toBe("function");
  expect(typeof resolvePonderQuerySource).toBe("function");
  expect(typeof PonderProvider).toBe("function");
  expect(typeof usePonderClient).toBe("function");
  expect(typeof usePonderQuery).toBe("function");
  expect(typeof usePonderQueryOptions).toBe("function");
  expect(typeof usePonderStatus).toBe("function");
  expect(ponderStatusQueryKey).toEqual(["__ponder_react", "status"]);
});
