# Installation Instructions

Burnwatch is an Electron desktop widget that tracks AI usage across **Anthropic, OpenAI, and
Google**, with multi-account support. Prebuilt binaries are currently published for **Windows
only**; macOS and Linux users build from source (prebuilt macOS/Linux binaries are planned).

> Note on names: the app is **Burnwatch**, but its internal package and build product name remain
> `Claude-Usage-Widget`. That is deliberate — it keeps the existing settings directory and the
> auto-update channel intact. So installer filenames and install paths still read
> `Claude-Usage-Widget`.

---

## Windows

**Option 1: Installer (recommended)**
1. Download `Claude-Usage-Widget-{version}-win-Setup.exe` from
   [Releases](https://github.com/dev-newb/burnwatch/releases).
2. Run the installer and follow the wizard (you can choose the install directory).
3. Launch **Burnwatch** from the Start Menu.

The installer build **auto-updates silently**: it checks on launch and once a day, downloads new
versions in the background, and applies them on the next launch. Install once and forget it.

**Option 2: Portable (no installation)**
1. Download `Claude-Usage-Widget-{version}-win-portable.exe` from
   [Releases](https://github.com/dev-newb/burnwatch/releases).
2. Run it directly from wherever you place it.

Portable builds do **not** auto-update — re-download to upgrade.

**What gets installed (installer only):**
- Application: `C:\Program Files\Claude-Usage-Widget\`
- Settings/config: `%APPDATA%\claude-usage-widget\`
- Start Menu shortcut (and Desktop shortcut)

---

## macOS (build from source)

No prebuilt DMG is published yet. Build it yourself:

```bash
git clone https://github.com/dev-newb/burnwatch.git
cd burnwatch
npm install
npm run build:mac   # produces a .dmg for arm64 and x64 in dist/
```

Then open the built DMG and drag the app to Applications, or just run it in place with `npm start`.

**macOS security notice — the app is not signed or notarized.** There is no Apple Developer ID
behind these builds, so Gatekeeper may report the app as "damaged" or refuse to open it. Clear the
quarantine attribute and launch again:

```bash
xattr -cr "/Applications/Claude Usage Widget.app"
```

**Settings/config:** `~/Library/Application Support/claude-usage-widget/`

---

## Linux (build from source)

No prebuilt AppImage is published yet. Build it yourself:

```bash
git clone https://github.com/dev-newb/burnwatch.git
cd burnwatch
npm install
npm run build:linux   # produces an AppImage for x64 and arm64 in dist/
```

Make the built AppImage executable and run it:

```bash
chmod +x dist/Claude-Usage-Widget-*-linux-*.AppImage
./dist/Claude-Usage-Widget-*-linux-*.AppImage
```

**Ubuntu 22.04+:** if the AppImage won't start, install libfuse2:

```bash
sudo apt install libfuse2
```

**Settings/config:** `~/.config/claude-usage-widget/`

### Desktop Launcher & Autostart (optional)

Integrate the built AppImage into your desktop (application-menu entry + auto-start on login).

**1. Place the AppImage somewhere permanent:**
```bash
mkdir -p ~/.local/bin
cp dist/Claude-Usage-Widget-*-linux-*.AppImage ~/.local/bin/burnwatch.AppImage
chmod +x ~/.local/bin/burnwatch.AppImage
```

**2. Create `~/.local/share/applications/burnwatch.desktop`:**
```ini
[Desktop Entry]
Name=Burnwatch
Comment=Monitor AI usage (Anthropic, OpenAI, Google)
Exec=/home/YOUR_USERNAME/.local/bin/burnwatch.AppImage
Icon=/home/YOUR_USERNAME/.local/share/icons/burnwatch.png
Terminal=false
Type=Application
Categories=Utility;
```
Replace `YOUR_USERNAME` with your actual username.

> **Sandbox note:** on some distributions the Electron/Chromium sandbox fails to start the
> AppImage (a `chrome-sandbox` / SUID error). If so, append `--no-sandbox` to the `Exec=` line:
> `Exec=/home/YOUR_USERNAME/.local/bin/burnwatch.AppImage --no-sandbox`

**3. Add an icon (optional):**
```bash
mkdir -p ~/.local/share/icons
# copy an icon to ~/.local/share/icons/burnwatch.png
```

**4. Enable autostart (optional):**
```bash
mkdir -p ~/.config/autostart
cp ~/.local/share/applications/burnwatch.desktop ~/.config/autostart/
```

**Desktop environment notes:**
- **GNOME:** the entry may not appear immediately — log out/in to refresh.
- **KDE Plasma:** appears instantly in the launcher.
- **XFCE:** appears in the Whisker Menu after a refresh.

---

## Build from Source (all platforms)

**Prerequisites:** Node.js 18+ ([download](https://nodejs.org)) and npm (bundled with Node).

```bash
git clone https://github.com/dev-newb/burnwatch.git
cd burnwatch
npm install
npm start            # run locally
```

**Platform build scripts:**
```bash
npm run build:win     # Windows installer + portable
npm run build:mac     # macOS .dmg (requires macOS)
npm run build:linux   # Linux AppImage
npm run build         # electron-builder default for the current host
```

Build output lands in `dist/`.

---

## Uninstallation

**Windows (installer):** use "Add or Remove Programs", or the uninstaller in the Start Menu folder.
Optionally delete `%APPDATA%\claude-usage-widget\`.

**Windows (portable):** delete the `.exe`. Optionally delete `%APPDATA%\claude-usage-widget\`.

**macOS:** move the app from Applications to the Trash. Optionally delete
`~/Library/Application Support/claude-usage-widget/`.

**Linux:** delete the AppImage. Optionally delete `~/.config/claude-usage-widget/` and remove the
desktop/autostart entries:
```bash
rm ~/.local/share/applications/burnwatch.desktop
rm ~/.config/autostart/burnwatch.desktop
```

---

## Troubleshooting

**Sign-in prompt keeps returning** — a provider session may have expired. Re-connect that account
from **Settings (⚙️)**.

**Widget not updating** — check your internet connection, use the manual refresh button, or
re-connect the affected account.

**macOS: "damaged" / won't open** — clear quarantine:
`xattr -cr "/Applications/Claude Usage Widget.app"` (the app is unsigned; see above).

**Linux: AppImage won't run** — install libfuse2: `sudo apt install libfuse2`. If it's a sandbox
error, launch with `--no-sandbox`.

**Build errors** — a clean reinstall resolves most issues:
```bash
rm -rf node_modules package-lock.json
npm install
```

Still stuck? Open a [Discussion](https://github.com/dev-newb/burnwatch/discussions) or
[Issue](https://github.com/dev-newb/burnwatch/issues) with your OS, Node.js version, and the full
error output.
