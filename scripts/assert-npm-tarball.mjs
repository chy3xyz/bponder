#!/usr/bin/env node
/**
 * Assert a packed or installed bponder tarball is installable:
 * - no workspace: protocol in dependency fields
 * - migrate SQL files present next to the published database module layout
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
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
      console.error(
        `assert-npm-tarball: ${field}.${name} still uses ${range}`,
      );
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

fs.unlinkSync(tgz);
console.log(`assert-npm-tarball: ok (${filename})`);
