---
"ponder": patch
---

Made Bun-native indexing the default for `ponder start` and `ponder dev` when running on Bun. Set `PONDER_USE_VITE=1` to use the classic Vite path. `ponder serve` still requires `--native` or `PONDER_BUN_NATIVE=1` for the Bun-native `/v1` stack.
