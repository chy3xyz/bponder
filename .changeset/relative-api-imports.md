---
"bponder": patch
---

Fixed a bug that caused Bun-native apps with relative imports in `src/api` (for example `import { mountHello } from "./hello.js"`) to fail loading under the `ponder-index` Bun plugin. Sibling modules are rewritten to stay in the plugin namespace.
