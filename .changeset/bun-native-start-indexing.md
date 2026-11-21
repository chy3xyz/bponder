---
"ponder": patch
---

Updated `ponder start --native` to load indexing functions through a Bun plugin (`ponder:registry`, `ponder:schema`), compile with the production build helpers, migrate the database, and run omnichain or multichain indexing. `ordering: "experimental_isolated"` now errors and asks for classic `ponder start`. Classic `ponder start` without `--native` is unchanged.
