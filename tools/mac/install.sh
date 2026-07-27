#!/bin/bash
# One-time macOS setup for Burnwatch.
#
# Installs a launchd agent that, at every login, checks for a newer release,
# rebuilds + reinstalls the app if there is one, and launches it. launchd runs
# it with no Terminal window attached.
#
# Run once:  bash tools/mac/install.sh

set -u

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
UPDATER="$REPO_DIR/tools/mac/update.sh"
LABEL="com.burnwatch.updater"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

[ -f "$UPDATER" ] || { echo "updater missing at $UPDATER"; exit 1; }
chmod +x "$UPDATER"
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$UPDATER</string>
    </array>
    <key>RunAtLoad</key><true/>
</dict>
</plist>
PLISTEOF

launchctl unload "$PLIST" 2>/dev/null
launchctl load -w "$PLIST" || { echo "launchctl load failed"; exit 1; }

echo "Installed."
echo "  Burnwatch updates + launches at every login (no Terminal window)."
echo "  First build is running now — the app appears in Applications in a few minutes."
echo "  Log: ~/Library/Logs/burnwatch-update.log"
echo
echo "To undo:  launchctl unload -w \"$PLIST\" && rm \"$PLIST\""
