#!/usr/bin/env node
import { execFileSync } from "node:child_process";
/**
 * Assert a packed or installed bponder tarball is installable:
 * - no workspace: protocol in dependency fields
 * - migrate SQL files present next to the published database module layout
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = path.join(root, "packages/core");

const packOut = execFileSync("npm", ["pack", "--json"], {
  cwd: coreDir,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
const start = packOut.indexOf("[");
const end = packOut.lastIndexOf("]");
if (start === -1 || end === -1 || end < start) {
  console.error("assert-npm-tarball: npm pack --json produced no JSON array");
  console.error(packOut);
  process.exit(1);
}
const packed = JSON.parse(packOut.slice(start, end + 1));
const filename = packed[0]?.filename;
if (!filename) {
  console.error("assert-npm-tarball: could not determine packed filename");
  process.exit(1);
}
const tgz = path.join(coreDir, filename);

const list = execFileSync("tar", ["-tzf", tgz], { encoding: "utf8" })
  .trim()
  .split("\n");

const mustHave = [
  "package/dist/esm/sync-store/sql/ponder_rpc_cache_1/create.sql",
  "package/dist/esm/sync-store/sql/ponder_rpc_cache_1/copy.sql",
  "package/src/sync-store/sql/ponder_rpc_cache_1/create.sql",
  "package/src/sync-store/sql/ponder_rpc_cache_1/copy.sql",
  "package/dist/esm/bin/ponder.js",
];

for (const file of mustHave) {
  if (!list.includes(file)) {
    console.error(`assert-npm-tarball: missing ${file} in ${filename}`);
    process.exit(1);
  }
}

const pkgJson = execFileSync("tar", ["-xOf", tgz, "package/package.json"], {
  encoding: "utf8",
});
const pkg = JSON.parse(pkgJson);

for (const field of [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]) {
  const deps = pkg[field];
  if (!deps) continue;
  for (const [name, range] of Object.entries(deps)) {
    if (typeof range === "string" && range.startsWith("workspace:")) {
      console.error(`assert-npm-tarball: ${field}.${name} still uses ${range}`);
      process.exit(1);
    }
  }
}

if (pkg.bin?.bponder !== "./dist/esm/bin/ponder.js") {
  console.error(
    `assert-npm-tarball: bin.bponder is ${pkg.bin?.bponder}, expected ./dist/esm/bin/ponder.js`,
  );
  process.exit(1);
}

const binJs = execFileSync(
  "tar",
  ["-xOf", tgz, "package/dist/esm/bin/ponder.js"],
  {
    encoding: "utf8",
  },
);
if (!binJs.includes('from "../../../package.json"')) {
  console.error(
    'assert-npm-tarball: dist/esm/bin/ponder.js must import "../../../package.json" (package root from dist/esm/bin)',
  );
  process.exit(1);
}
if (binJs.includes('from "../../package.json"')) {
  console.error(
    'assert-npm-tarball: dist/esm/bin/ponder.js still imports "../../package.json" (resolves to missing dist/package.json)',
  );
  process.exit(1);
}

const bunNative = execFileSync(
  "tar",
  ["-xOf", tgz, "package/dist/esm/build/bunNativeBuild.js"],
  { encoding: "utf8" },
);
// Old bug: single hard-coded `new URL("../app/ponder.ts", …)` with no `.js` fallback.
if (
  /defaultRegistryFile = fileURLToPath\(\s*new URL\("\.\.\/app\/ponder\.ts"/.test(
    bunNative,
  )
) {
  console.error(
    "assert-npm-tarball: dist bunNativeBuild hard-codes only ../app/ponder.ts (dist only has .js)",
  );
  process.exit(1);
}
if (!bunNative.includes("../app/ponder.js")) {
  console.error(
    "assert-npm-tarball: dist bunNativeBuild must resolve ../app/ponder.js for the published layout",
  );
  process.exit(1);
}
if (!list.includes("package/dist/esm/app/ponder.js")) {
  console.error("assert-npm-tarball: missing package/dist/esm/app/ponder.js");
  process.exit(1);
}

const indexingWorker = execFileSync(
  "tar",
  ["-xOf", tgz, "package/dist/esm/bin/utils/indexingWorker.js"],
  { encoding: "utf8" },
);
if (
  /isolatedWorker\.bun\.ts/.test(indexingWorker) &&
  !/isolatedWorker\.bun\.js/.test(indexingWorker)
) {
  console.error(
    "assert-npm-tarball: indexingWorker hard-codes isolatedWorker.bun.ts without a .js fallback",
  );
  process.exit(1);
}

const isolatedWorkers = execFileSync(
  "tar",
  ["-xOf", tgz, "package/dist/esm/runtime/bunIsolatedWorkers.js"],
  { encoding: "utf8" },
);
if (
  /new URL\("\.\/bunIsolatedWorker\.ts"/.test(isolatedWorkers) &&
  !/bunIsolatedWorker\.js/.test(isolatedWorkers)
) {
  console.error(
    "assert-npm-tarball: bunIsolatedWorkers hard-codes bunIsolatedWorker.ts without a .js fallback",
  );
  process.exit(1);
}
if (!list.includes("package/dist/esm/runtime/bunIsolatedWorker.js")) {
  console.error(
    "assert-npm-tarball: missing package/dist/esm/runtime/bunIsolatedWorker.js",
  );
  process.exit(1);
}
if (!list.includes("package/dist/esm/bin/isolatedWorker.bun.js")) {
  console.error(
    "assert-npm-tarball: missing package/dist/esm/bin/isolatedWorker.bun.js",
  );
  process.exit(1);
}

// prepack rewrites workspace:* for the tarball; restore source tree afterwards
// (publish uses postpublish for the same restore — postpack is too early and
// would poison registry metadata if used before upload).
try {
  execFileSync("node", ["../../scripts/restore-workspace-deps.mjs"], {
    cwd: coreDir,
    stdio: "inherit",
  });
} catch {
  // backup may already be gone
}

fs.unlinkSync(tgz);
console.log(`assert-npm-tarball: ok (${filename})`);
