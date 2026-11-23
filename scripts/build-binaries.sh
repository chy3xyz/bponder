#!/usr/bin/env bash
# Cross-compile standalone `bponder` executables with `bun build --compile`,
# then zip each for GitHub Release / install.sh consumption.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${1:-"$ROOT/dist/binaries"}"
ENTRY="$ROOT/packages/core/src/bin/ponder.ts"
VERSION="$(bun -e "console.log(require('./packages/core/package.json').version)" )"

mkdir -p "$OUT"
cd "$ROOT"

targets=(
  "bun-darwin-arm64:bponder-darwin-arm64"
  "bun-darwin-x64:bponder-darwin-x64"
  "bun-linux-x64:bponder-linux-x64"
  "bun-linux-arm64:bponder-linux-arm64"
  "bun-windows-x64:bponder-windows-x64.exe"
)

echo "Building bponder@$VERSION binaries into $OUT"
for spec in "${targets[@]}"; do
  target="${spec%%:*}"
  name="${spec##*:}"
  outfile="$OUT/$name"
  echo "→ $target → $name"
  bun build \
    --compile \
    --minify \
    --target="$target" \
    --outfile="$outfile" \
    "$ENTRY"
done

command -v zip >/dev/null || {
  echo "zip is required to package release assets" >&2
  exit 1
}

(
  cd "$OUT"
  for name in bponder-darwin-arm64 bponder-darwin-x64 bponder-linux-x64 bponder-linux-arm64; do
    [[ -f $name ]] || continue
    rm -f "${name}.zip"
    # install.sh looks for a top-level `bponder` entry (or bponder-$target/bponder).
    mkdir -p "_pkg/$name"
    cp "$name" "_pkg/$name/bponder"
    chmod +x "_pkg/$name/bponder"
    (cd "_pkg" && zip -qr "../${name}.zip" "$name")
    rm -rf "_pkg"
  done

  if [[ -f bponder-windows-x64.exe ]]; then
    rm -f bponder-windows-x64.zip
    mkdir -p _pkg/bponder-windows-x64
    cp bponder-windows-x64.exe _pkg/bponder-windows-x64/bponder.exe
    (cd _pkg && zip -qr ../bponder-windows-x64.zip bponder-windows-x64)
    rm -rf _pkg
  fi

  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 bponder-*.zip > SHA256SUMS
  else
    sha256sum bponder-*.zip > SHA256SUMS
  fi
)

echo "Done. Artifacts:"
ls -lh "$OUT"/*.zip "$OUT"/SHA256SUMS
