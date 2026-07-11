#!/bin/sh
set -eu

repo="ardasevinc/agent-devtools"
version="${CODEX_HOME_GUARD_VERSION:-latest}"
install_dir="${CODEX_HOME_GUARD_INSTALL_DIR:-$HOME/.local/bin}"

case "$(uname -s):$(uname -m)" in
  Darwin:arm64) target="aarch64-apple-darwin" ;;
  Darwin:x86_64) target="x86_64-apple-darwin" ;;
  Linux:aarch64 | Linux:arm64) target="aarch64-unknown-linux-gnu" ;;
  Linux:x86_64 | Linux:amd64) target="x86_64-unknown-linux-gnu" ;;
  *)
    echo "unsupported platform: $(uname -s) $(uname -m)" >&2
    exit 1
    ;;
esac

asset="codex-home-guard-$target.tar.gz"
if [ "$version" = "latest" ]; then
  base="https://github.com/$repo/releases/latest/download"
else
  base="https://github.com/$repo/releases/download/$version"
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

curl --fail --location --silent --show-error "$base/$asset" --output "$tmp/$asset"
curl --fail --location --silent --show-error "$base/checksums.txt" --output "$tmp/checksums.txt"

expected="$(awk -v asset="$asset" '$2 == asset { print $1 }' "$tmp/checksums.txt")"
if [ -z "$expected" ]; then
  echo "checksum missing for $asset" >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$tmp/$asset" | awk '{ print $1 }')"
elif command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$tmp/$asset" | awk '{ print $1 }')"
else
  echo "shasum or sha256sum is required" >&2
  exit 1
fi

if [ "$actual" != "$expected" ]; then
  echo "checksum verification failed for $asset" >&2
  exit 1
fi

tar -xzf "$tmp/$asset" -C "$tmp"
mkdir -p "$install_dir"
install -m 0755 "$tmp/codex-home-guard" "$install_dir/codex-home-guard"

echo "installed $install_dir/codex-home-guard"
echo "next: add it to ~/.codex/hooks.json and review it with /hooks"
