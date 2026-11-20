import { describe, expect, test } from "bun:test";
import { ponder } from "./ponder.js";

describe("ponder", () => {
  test("registers an indexing function with on", () => {
    const indexingFunction = () => {};

    ponder.on("Token:Transfer", indexingFunction);

    expect(ponder.fns).toEqual([
      { name: "Token:Transfer", fn: indexingFunction },
    ]);
  });
});
