import { beforeEach, describe, expect, test } from "bun:test";
import { ponder } from "./ponder.js";

describe("ponder", () => {
  beforeEach(() => {
    ponder.fns.length = 0;
  });

  test("registers an indexing function with on", () => {
    const indexingFunction = () => {};
    const { on } = ponder;

    on("Token:Transfer", indexingFunction);

    expect(ponder.fns).toEqual([
      { name: "Token:Transfer", fn: indexingFunction },
    ]);
  });
});
