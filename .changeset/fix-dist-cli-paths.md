---
"bponder": patch
"create-bponder": patch
"bponder-client": patch
"bponder-react": patch
---

Fixed packaging bugs in the published `dist/esm` layout that broke the CLI after `1.0.6` pointed `bin` at `dist/esm/bin/ponder.js`. `bponder --version` and every subcommand failed with `Cannot find module '../../package.json'` because the compiled bin still used the `src/bin` relative path (resolving to missing `dist/package.json`). Bun-native builds also failed when the registry entry hard-coded `../app/ponder.ts` even though the package only ships `ponder.js`. Isolated worker entrypoints similarly hard-coded `*.ts` paths (`isolatedWorker.bun.ts`, `bunIsolatedWorker.ts`) that do not exist under `dist/esm`.

Fixed a bug that caused `Build failed stage=native` to log `Error: [unable to serialize, circular reference is too complex to analyze]` instead of the underlying Bun `ResolveMessage` (for example `Cannot find module .../app/ponder.ts`). `asError` now copies Bun-native error objects into plain `Error` instances before logging.
