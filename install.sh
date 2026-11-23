#!/usr/bin/env bash
# Install the standalone `bponder` CLI from GitHub Releases.
#
#   curl -fsSL https://raw.githubusercontent.com/chy3xyz/bponder/main/install.sh | bash
#
# Optional:
#   BPONDER_VERSION=0.18.9 bash install.sh   # pin a release (with or without leading v)
#   BPONDER_INSTALL=~/.local                # install root (default: ~/.bponder)
#   BPONDER_REPO=chy3xyz/bponder            # override GitHub repo
set -euo pipefail

REPO="${BPONDER_REPO:-chy3xyz/bponder}"
INSTALL_ROOT="${BPONDER_INSTALL:-$HOME/.bponder}"
BIN_DIR="$INSTALL_ROOT/bin"
GITHUB_BASE="${GITHUB:-https://github.com}"

Bold=$'\033[1m'
Green=$'\033[32m'
Red=$'\033[31m'
Reset=$'\033[0m'

error() {
  printf '%serror%s: %s\n' "$Red" "$Reset" "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

tildify() {
  if [[ ${1-} = "$HOME"/* ]]; then
    printf '~/%s\n' "${1#"$HOME"/}"
  else
    printf '%s\n' "$1"
  fi
}

command -v curl >/dev/null || error "curl is required"
command -v unzip >/dev/null || error "unzip is required"

platform="$(uname -ms)"
case "$platform" in
  "Darwin x86_64") target="darwin-x64" ;;
  "Darwin arm64") target="darwin-arm64" ;;
  "Linux x86_64" | "Linux amd64") target="linux-x64" ;;
  "Linux aarch64" | "Linux arm64") target="linux-arm64" ;;
  MINGW* | MSYS* | CYGWIN*)
    error "Windows: download bponder-windows-x64.exe from $GITHUB_BASE/$REPO/releases and place it on PATH"
    ;;
  *)
    error "Unsupported platform: $platform"
    ;;
esac

# Rosetta on Apple Silicon → prefer native arm64.
if [[ $target = darwin-x64 ]]; then
  if [[ $(sysctl -n sysctl.proc_translated 2>/dev/null || true) = 1 ]]; then
    target=darwin-arm64
    info "Shell is running under Rosetta 2; downloading $target instead"
  fi
fi

asset="bponder-${target}.zip"
exe_name="bponder"

version_raw="${BPONDER_VERSION:-}"
if [[ -z $version_raw ]]; then
  download_url="$GITHUB_BASE/$REPO/releases/latest/download/$asset"
  release_label="latest"
else
  version_raw="${version_raw#v}"
  tag="v${version_raw}"
  download_url="$GITHUB_BASE/$REPO/releases/download/${tag}/$asset"
  release_label="$tag"
fi

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

archive="$tmpdir/$asset"
info "Downloading bponder ($release_label, $target)…"
if ! curl --fail --location --progress-bar --output "$archive" "$download_url"; then
  error "Failed to download $download_url
Is there a GitHub Release with asset $asset? See $GITHUB_BASE/$REPO/releases"
fi

mkdir -p "$BIN_DIR"
unzip -oqd "$tmpdir" "$archive" || error "Failed to extract $asset"

extracted=""
for candidate in \
  "$tmpdir/$exe_name" \
  "$tmpdir/bponder-$target/$exe_name" \
  "$tmpdir"/*/bponder
do
  if [[ -f $candidate ]]; then
    extracted="$candidate"
    break
  fi
done
[[ -n $extracted ]] || error "Archive did not contain a bponder binary"

install -m 755 "$extracted" "$BIN_DIR/$exe_name"

# Soft-check the binary (compiled embed includes Bun runtime).
if ! "$BIN_DIR/$exe_name" --version >/dev/null 2>&1; then
  info "Installed $(tildify "$BIN_DIR/$exe_name") (could not run --version in this environment)"
else
  ver="$("$BIN_DIR/$exe_name" --version 2>/dev/null || true)"
  info "${Green}bponder${Reset} ${ver:+$ver }installed to ${Bold}$(tildify "$BIN_DIR/$exe_name")${Reset}"
fi

case ":${PATH}:" in
  *":$BIN_DIR:"*) ;;
  *)
    info ""
    info "Add bponder to your PATH. For example, add this to your shell profile:"
    info ""
    info "  export PATH=\"$BIN_DIR:\$PATH\""
    info ""
    if [[ -n ${GITHUB_ACTIONS-} || -n ${CI-} ]]; then
      if [[ -n ${GITHUB_PATH-} ]]; then
        echo "$BIN_DIR" >>"$GITHUB_PATH"
      fi
    fi
    ;;
esac

info "Run ${Bold}bponder --help${Reset} to get started."
