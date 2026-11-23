---
"bponder": patch
---

Improved Bun-native `ponder serve` to mount Hono from `src/api` like `start` / `dev`, and added `/ready`, `/metrics`, and `/status` on the Bun-native HTTP path. Native `ponder dev` remounts the Hono API when `src/api` changes.
