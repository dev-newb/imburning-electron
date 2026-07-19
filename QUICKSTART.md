# Quick Start Guide

Get up and running with **Burnwatch** in a couple of minutes. Burnwatch is a small desktop
widget that tracks your AI usage across **Anthropic, OpenAI, and Google** — including multiple
accounts per provider (for example a desktop/primary account alongside its CLI login).

## Step 1: Get Burnwatch

### Windows (prebuilt)

Go to [Releases](https://github.com/dev-newb/burnwatch/releases) and download the latest:

- **Installer:** `Claude-Usage-Widget-{version}-win-Setup.exe` (recommended — includes silent auto-update)
- **Portable:** `Claude-Usage-Widget-{version}-win-portable.exe` (no install; update manually)

Run the file. That's it — the installer sets up Burnwatch and a Start Menu shortcut, and it
updates itself in the background from then on.

### macOS / Linux (build from source)

Prebuilt macOS and Linux binaries are not published yet (planned). For now, build from source:

```bash
git clone https://github.com/dev-newb/burnwatch.git
cd burnwatch
npm install
npm start          # run it
# or produce an app bundle:
npm run build:mac    # macOS .dmg (arm64 + x64)
npm run build:linux  # Linux AppImage (x64 + arm64)
```

Requires **Node.js 18+**. See [INSTALL.md](INSTALL.md) for platform details, the macOS
Gatekeeper note, and Linux desktop integration.

## Step 2: Connect your accounts

On first run a small window appears and prompts you to sign in to **claude.ai** for the
Anthropic section. This is only the first provider — Burnwatch is not Claude-only.

Open **Settings (⚙️)** to connect the rest:

- **Anthropic** — sign in with your claude.ai session.
- **OpenAI** — "Sign in with ChatGPT" (OAuth), or let Burnwatch read your local `codex` CLI login.
- **Google** — "Sign in with Google" (OAuth), or let Burnwatch read your local `gemini` CLI login.

You can connect **multiple accounts** for a provider — for example a company's primary
desktop-app account and its separate CLI account.

## What You'll See

Once connected, Burnwatch shows your usage per connected account: current-window and
longer-window limits with progress bars and countdown timers to each reset, plus a usage chart.

## Daily Use

- **Open / hide the widget** — click the tray icon (Windows/Linux) or the Dock icon (macOS).
- **Refresh** — data refreshes automatically; use the refresh button (🔄) for an immediate update.
- **Minimize** — the minimize control tucks the widget back to the tray/Dock.
- **Settings (⚙️)** — thresholds, time/date format, theme, refresh interval, tray badge colors,
  and which accounts are shown.

## System Tray

Burnwatch shows **per-company colored badges** in the tray so you can read usage at a glance —
for example Anthropic blue, Fable red, OpenAI green, Google yellow (all customizable in Settings).
A second (CLI) account for the same company gets a terminal-cursor style badge, and a badge turns
to an **X on red** when that account hits 99%. Hover a badge for the exact percentage.

## Need Help?

- **Install details:** [INSTALL.md](INSTALL.md)
- **Contributing / development:** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Questions & bugs:** open a [Discussion](https://github.com/dev-newb/burnwatch/discussions)
  or an [Issue](https://github.com/dev-newb/burnwatch/issues)
