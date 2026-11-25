#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const pkgDir = process.cwd();
const pkgPath = path.join(pkgDir, "package.json");
const backupPath = path.join(pkgDir, ".package.json.workspace-backup");

if (!fs.existsSync(backupPath)) {
  process.exit(0);
}

fs.copyFileSync(backupPath, pkgPath);
fs.unlinkSync(backupPath);
console.error(
  `restore-workspace-deps: restored ${path.basename(pkgDir)}/package.json`,
);
