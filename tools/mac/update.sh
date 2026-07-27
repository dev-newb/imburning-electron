#!/bin/bash
# Burnwatch macOS self-updater.
#
# Checks GitHub for a newer release tag; if there is one, rebuilds from source,
# replaces the installed .app, and relaunches it. Designed to be run by the
# launchd agent installed by install.sh, so it runs headless — no Terminal.
#
# Log: ~/Library/Logs/burnwatch-update.log

set -u

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
APP_NAME="Claude-Usage-Widget"
LOG="$HOME/Library/Logs/burnwatch-update.log"

# launchd hands scripts a bare PATH — node/npm/git live in these dirs, so a
# script that works in Terminal fails under launchd without this line.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1
echo "=== $(date) ==="

cd "$REPO_DIR" || { echo "repo not found at $REPO_DIR"; exit 1; }
command -v npm >/dev/null || { echo "npm not found — install Node.js from nodejs.org"; exit 1; }

# Prefer /Applications, fall back to ~/Applications if it is not writable.
DEST_DIR="/Applications"
[ -w "$DEST_DIR" ] || DEST_DIR="$HOME/Applications"
mkdir -p "$DEST_DIR"
APP_DEST="$DEST_DIR/${APP_NAME}.app"

git fetch --tags --quiet || echo "fetch failed (offline?) — continuing with local tags"
latest="$(git tag -l 'v*' --sort=-v:refname | head -1)"
current="$(git describe --tags --abbrev=0 2>/dev/null || echo none)"
echo "current=$current latest=$latest dest=$APP_DEST"

needs_build=0
if [ -n "$latest" ] && [ "$latest" != "$current" ]; then
    echo "updating $current -> $latest"
    git checkout --quiet "$latest" || exit 1
    npm install --silent || exit 1
    needs_build=1
elif [ ! -d "$APP_DEST" ]; then
    echo "app not installed yet — building"
    needs_build=1
else
    echo "already up to date"
fi

if [ "$needs_build" = 1 ]; then
    if [ "$(uname -m)" = "arm64" ]; then archflag="--arm64"; else archflag="--x64"; fi
    echo "building $archflag"
    # 'dir' target: just the .app, skipping the dmg — faster, and we install by copy.
    npx electron-builder --mac dir $archflag || { echo "build failed"; exit 1; }

    built="$(find dist -maxdepth 2 -name "${APP_NAME}.app" -type d | head -1)"
    [ -n "$built" ] || { echo "build produced no .app"; exit 1; }
    echo "built: $built"

    # Stop the running copy before replacing the bundle underneath it.
    pkill -f "${APP_DEST}/Contents/MacOS/" 2>/dev/null && sleep 2

    rm -rf "$APP_DEST"
    cp -R "$built" "$APP_DEST" || { echo "install to $APP_DEST failed"; exit 1; }
    echo "installed $latest to $APP_DEST"
fi

open -a "$APP_DEST" && echo "launched"
