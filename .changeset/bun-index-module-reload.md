---
"ponder": patch
---

Fixed a bug that caused `Validation failed: Found 0 registered indexing functions` when Bun reloaded the same indexing files (ESM cache skipped re-running `ponder.on`).
