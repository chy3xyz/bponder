#!/usr/bin/env node
/**
 * Restore package.json after workspace protocol rewrite.
 *
 * Important: during `npm publish`, do NOT restore in `postpack`. npm re-reads
 * package.json for registry metadata after packing; restoring there leaked
 * `workspace:*` into the 1.0.4–1.0.6 packuments while the tarball itself was fine.
 * Skip restore when lifecycle is postpack + npm_command=publish; use postpublish.
 */
import fs from "node:fs";
import path from "node:path";

const pkgDir = process.cwd();
const pkgPath = path.join(pkgDir, "package.json");
const backupPath = path.join(pkgDir, ".package.json.workspace-backup");

const event = process.env.npm_lifecycle_event;
const cmd = process.env.npm_command;

if (event === "postpack" && cmd === "publish") {
  console.error(
    "restore-workspace-deps: skip during publish postpack (registry metadata)",
  );
  process.exit(0);
}

if (!fs.existsSync(backupPath)) {
  process.exit(0);
}

fs.copyFileSync(backupPath, pkgPath);
fs.unlinkSync(backupPath);
console.error(
  `restore-workspace-deps: restored ${path.basename(pkgDir)}/package.json`,
);
