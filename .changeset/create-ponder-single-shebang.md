---
"create-ponder": patch
---

Fixed a bug that caused `create-ponder` to emit two `#!/usr/bin/env bun` shebang lines in `dist/index.js`, which threw `SyntaxError` when the CLI ran.
