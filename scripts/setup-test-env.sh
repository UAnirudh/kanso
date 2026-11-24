#!/usr/bin/env bash
#
# Prepares everything `npm run test:e2e` needs, reproducibly and without root:
#
#   1. checks the Node version — better-sqlite3 12.x builds on Node 20-24 only,
#      so `npm ci` fails on Node 25+ while compiling the native module;
#   2. downloads the Chromium build Playwright launches;
#   3. on Linux, supplies the shared libraries and fonts Chromium needs.
#      Playwright's `install-deps` requires root; this script extracts the
#      distribution packages into a private prefix instead, following the
#      libraries' own dependencies, and writes an env file that
#      scripts/run-e2e.sh sources.
#
# Usage:  npm run e2e:setup
# Re-running is safe: browsers, libraries and fonts are reused.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${KANSO_E2E_DEPS:-$HOME/.cache/kanso-e2e-deps}"
ENV_FILE="$PREFIX/env.sh"
FONTS_CONF="$PREFIX/etc/fonts/fonts.conf"
cd "$ROOT"

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 20 ] || [ "$node_major" -gt 24 ]; then
  echo "error: Node 20-24 is required, found $(node -v)." >&2
  echo "       better-sqlite3 12.x has no build for Node 25+, so npm ci fails there." >&2
  echo "       With nvm: nvm install && nvm use   (this repo pins .nvmrc)" >&2
  exit 1
fi

echo "==> Node $(node -v): ok"
echo "==> installing the Chromium build Playwright launches"
npx playwright install chromium

if [ "$(uname -s)" != "Linux" ]; then
  echo "==> $(uname -s): system libraries come from the OS, nothing else to do"
  exit 0
fi

chrome_bin="$(
  node -e 'process.stdout.write(require("playwright").chromium.executablePath())' \
    2>/dev/null || true
)"
if [ -z "$chrome_bin" ] || [ ! -x "$chrome_bin" ]; then
  echo "error: could not locate the Playwright Chromium binary." >&2
  exit 1
fi

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  . "$ENV_FILE"
fi

# The full browser is checked rather than the headless shell: the suite launches
# the shell, whose libraries are a subset of the browser's.
missing_libs() {
  ldd "$chrome_bin" 2>/dev/null | awk '/not found/ { print $1 }' | sort -u
}

fonts_ready() {
  [ -n "$(ls -A "$PREFIX/usr/share/fonts" 2>/dev/null || ls -A /usr/share/fonts 2>/dev/null)" ]
}

if [ -z "$(missing_libs)" ] && [ -f "$FONTS_CONF" ] && fonts_ready; then
  echo "==> Chromium system libraries and fonts already present"
  exit 0
fi

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "error: Chromium needs system libraries and dpkg-deb is not available." >&2
  echo "       Install them with your package manager: npx playwright install-deps chromium" >&2
  exit 1
fi

# The bundled browser is built for Ubuntu/Debian libraries; other distributions
# need the normal package-manager route.
. /etc/os-release
if [ "${ID:-}" != "ubuntu" ] && [ "${ID:-}" != "debian" ]; then
  echo "error: automatic extraction supports Ubuntu/Debian, found ${PRETTY_NAME:-unknown}." >&2
  echo "       Install the Chromium dependencies with your package manager instead." >&2
  exit 1
fi
codename="${VERSION_CODENAME:-noble}"
arch="$(dpkg --print-architecture 2>/dev/null || echo amd64)"
case "$arch" in
  amd64) multiarch="x86_64-linux-gnu" ;;
  arm64) multiarch="aarch64-linux-gnu" ;;
  *) multiarch="$arch-linux-gnu" ;;
esac
host="http://archive.ubuntu.com/ubuntu"
[ "$ID" = "debian" ] && host="http://deb.debian.org/debian"

echo "==> resolving Chromium libraries for $ID $codename/$arch into $PREFIX"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

packages="$work/Packages"
: > "$packages"
for pocket in "$codename" "$codename-updates"; do
  curl -fsSL "$host/dists/$pocket/main/binary-$arch/Packages.gz" 2>/dev/null |
    gunzip >> "$packages" || true
done
if [ ! -s "$packages" ]; then
  echo "error: could not download package metadata for $codename." >&2
  echo "       Check network access, or install the dependencies with apt." >&2
  exit 1
fi

# Missing soname -> package. Only what Chromium actually loads is listed; add an
# entry when the final check names a library this table does not know.
declare -A LIB_PACKAGES=(
  [libnspr4.so]="libnspr4"
  [libnss3.so]="libnss3"
  [libnssutil3.so]="libnss3"
  [libsmime3.so]="libnss3"
  [libXcomposite.so.1]="libxcomposite1"
  [libXdamage.so.1]="libxdamage1"
  [libXfixes.so.3]="libxfixes3"
  [libXrandr.so.2]="libxrandr2"
  [libXrender.so.1]="libxrender1"
  [libXi.so.6]="libxi6"
  [libxkbcommon.so.0]="libxkbcommon0"
  [libasound.so.2]="libasound2"
  [libatspi.so.0]="libatspi2.0-0"
  [libatk-bridge-2.0.so.0]="libatk-bridge2.0-0"
  [libatk-1.0.so.0]="libatk1.0-0"
  [libcairo.so.2]="libcairo2"
  [libpango-1.0.so.0]="libpango-1.0-0"
  [libharfbuzz.so.0]="libharfbuzz0b"
  [libthai.so.0]="libthai0"
  [libdatrie.so.1]="libdatrie1"
  [libgraphite2.so.3]="libgraphite2-3"
  [libfontconfig.so.1]="libfontconfig1"
  [libfreetype.so.6]="libfreetype6"
  [libpixman-1.so.0]="libpixman-1-0"
  [libpng16.so.16]="libpng16-16"
  [libxcb-render.so.0]="libxcb-render0"
  [libcups.so.2]="libcups2"
  [libavahi-client.so.3]="libavahi-client3"
  [libavahi-common.so.3]="libavahi-common3"
)

find_filename() {
  awk -v p="$1" 'BEGIN { RS="" } $0 ~ "Package: " p "\n" {
    for (i = 1; i <= NF; i++) if ($i == "Filename:") print $(i + 1)
  }' "$packages" | sort -V | tail -1
}

declare -A fetched=()
fetch_package() {
  local name filename base
  # Ubuntu 24.04 renamed many libraries to a `…t64` package; the plain name is
  # what 22.04 and Debian ship.
  for name in "$1" "$1t64"; do
    if [ -n "${fetched[$name]:-}" ]; then
      return 0
    fi
    filename="$(find_filename "$name")"
    if [ -n "$filename" ]; then
      base="$(basename "$filename")"
      curl -fsSL "$host/$filename" -o "$work/$base"
      dpkg-deb -x "$work/$base" "$PREFIX"
      fetched["$name"]=1
      echo "    $name"
      return 0
    fi
  done
  return 1
}

# Fonts are not shared libraries, so nothing in ldd asks for them.
fetch_package fonts-dejavu-core || true

# Make the prefix visible to ldd so each pass measures real progress.
export LD_LIBRARY_PATH="$PREFIX/usr/lib/$multiarch${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"

# Extracting a package can reveal libraries of its own, so repeat until the
# binaries are satisfied or a pass adds nothing new.
while mapfile -t still_missing < <(missing_libs) && [ "${#still_missing[@]}" -gt 0 ]; do
  progressed=0
  for lib in "${still_missing[@]}"; do
    package="${LIB_PACKAGES[$lib]:-}"
    if [ -n "$package" ] && fetch_package "$package"; then
      progressed=1
    fi
  done
  if [ "$progressed" -eq 0 ]; then
    break
  fi
done

# Fontconfig reads its configuration from /etc/fonts, which a bare container
# does not have; write the one the prefix needs instead of installing the
# distribution's config package.
mkdir -p "$(dirname "$FONTS_CONF")" /tmp/kanso-fontcache
cat > "$FONTS_CONF" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>$PREFIX/usr/share/fonts</dir>
  <dir>/usr/share/fonts</dir>
  <cachedir>/tmp/kanso-fontcache</cachedir>
</fontconfig>
EOF

cat > "$ENV_FILE" <<EOF
# Generated by scripts/setup-test-env.sh — sourced by scripts/run-e2e.sh.
export LD_LIBRARY_PATH="$PREFIX/usr/lib/$multiarch\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export FONTCONFIG_FILE="$FONTS_CONF"
EOF

if [ -n "$(missing_libs)" ]; then
  echo "error: Chromium still needs: $(missing_libs | tr '\n' ' ')" >&2
  echo "       Add those sonames to LIB_PACKAGES in scripts/setup-test-env.sh," >&2
  echo "       or install the dependencies with your package manager." >&2
  exit 1
fi

echo "==> Chromium is ready (libraries: $PREFIX)"
echo "==> run 'npm run test:e2e'"
