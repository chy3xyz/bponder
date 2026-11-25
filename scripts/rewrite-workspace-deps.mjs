#!/usr/bin/env node
/**
 * Rewrite `workspace:*` (and `workspace:^` etc.) to concrete versions before
 * `npm pack` / `npm publish`. Restored by `restore-workspace-deps.mjs` in postpack.
 *
 * changesets/publish also rewrites, but raw `npm publish` from a package dir
 * does not — that leaked workspace protocol into 1.0.4/1.0.5.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = process.cwd();
const pkgPath = path.join(pkgDir, "package.json");
const backupPath = path.join(pkgDir, ".package.json.workspace-backup");

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

const findWorkspaceRoot = (start) => {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, "bun.lock"))) return dir;
    if (fs.existsSync(path.join(dir, "package.json"))) {
      try {
        const root = JSON.parse(
          fs.readFileSync(path.join(dir, "package.json"), "utf8"),
        );
        if (Array.isArray(root.workspaces) || root.workspaces?.packages) {
          return dir;
        }
      } catch {
        // continue
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return start;
    dir = parent;
  }
};

const root = findWorkspaceRoot(pkgDir);
const packagesDir = path.join(root, "packages");
const versionByName = new Map();

for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const p = path.join(packagesDir, entry.name, "package.json");
  if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  if (typeof j.name === "string" && typeof j.version === "string") {
    versionByName.set(j.name, j.version);
  }
}

const rewriteField = (field) => {
  const deps = pkg[field];
  if (!deps || typeof deps !== "object") return false;
  let changed = false;
  for (const [name, range] of Object.entries(deps)) {
    if (typeof range !== "string" || !range.startsWith("workspace:")) continue;
    const version = versionByName.get(name);
    if (!version) {
      throw new Error(
        `rewrite-workspace-deps: cannot resolve ${name} (from ${pkgPath})`,
      );
    }
    deps[name] = version;
    changed = true;
  }
  return changed;
};

let changed = false;
for (const field of [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]) {
  if (rewriteField(field)) changed = true;
}

if (!changed) {
  process.exit(0);
}

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(pkgPath, backupPath);
}

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
console.error(
  `rewrite-workspace-deps: rewrote workspace protocol in ${path.relative(root, pkgPath) || "package.json"}`,
);

// Silence unused import lint in some runners
void fileURLToPath;
