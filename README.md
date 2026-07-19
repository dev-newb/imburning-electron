<p align="center">
  <img src="assets/burnwatch-hero.png" width="256" alt="Burnwatch — a robot with its head on fire, keeping a gauge on its own burn">
</p>

<h1 align="center">Burnwatch</h1>

**Burnwatch** — a standalone desktop widget for **Windows, macOS, and Linux** tracking your AI usage across **Anthropic, OpenAI, and Google** in real-time. *Some tokens just want to watch the world learn.*

![Burnwatch — portrait main view: Anthropic, OpenAI, and Google sections, every pool tracked, Fable at 100%](assets/screenshot-main.png)

---

## The headline: every account on your machine, tracked

Power users end up logged into the **desktop app and the CLI with different accounts** — claude.ai in the browser but another account in the `claude` CLI, ChatGPT desktop plus a second account in `codex`, a Google login here and a different one in `gemini`. Every one of those accounts has its **own limits**, and most trackers only see one of them.

Burnwatch tracks **both accounts per company, simultaneously**:

- 🔑 **Sign in with ChatGPT / Google** (official OAuth), or let Burnwatch read your **CLI logins** — no extra setup
- 🧬 **Same account everywhere?** The views merge automatically — no duplicate rows
- 🟠 **Different accounts?** An amber **CLI: 2ND ACCT** pill appears and the second account gets its own rows, history series, burn-spike alerts, and tray badge (marked with a terminal-cursor `61▁`)
- 🖥️ In **wide mode** the two accounts sit **side by side** — one shared model column, a Desktop cluster and a CLI cluster, each under its own labels
- 🔥 Not interested? **Burn the pill away** — pixel fire chars it (Soot & Sparks finish, smoke included) and the rows roll up until you burn it back

![Burnwatch — wide mode: three companies as columns, Google tracking desktop AND CLI accounts side by side, prediction graph spanning below](assets/screenshot-landscape.png)

---

## Every pool, all three companies

Each provider meters more than one thing — Burnwatch shows **all of it**:

- **Anthropic** — Claude Session (5h), All Claude Models (7d), **Fable (7d)** and any future model-scoped weekly limit (rendered generically from the API), Extra Usage spend
- **OpenAI** — Codex (7d), the separate **GPT-5.3-Codex-Spark** pool, Code Review (when your account has one), purchased credits, and banked **limit-reset orbs**
- **Google** — one row per model **version** (2.5 Pro, 2.5 Flash, 2.5 Flash Lite, 3.1 Flash Lite…), because Google meters each separately, in progressive shades of Google blue

Don't care about a pool? **Hover it and click the minus** — hidden trackers collapse everywhere (including compact mode) and come back from the *N hidden* chip.

![Burnwatch — main view: Anthropic, OpenAI, and Google, every pool tracked](assets/screenshot-main.png)

---

## A layout for every window

Burnwatch **reflows in realtime** as you drag — no fixed layouts, no clipped text:

- 📏 **Live resize ladder** — full labels → abbreviated windows ("2.5 Pro (1D)", tooltip explains) → colour-coded chips (`CLA 5H · CDX · SPK · 2.5P`) → countdown text becomes **remaining-time pies** → redundant columns bow out — down to a 200px sliver
- 🖼️ **Orientation aware** — wider than tall? The three companies line up as **columns** with per-column headers and a shared bottom line above the chart. Stretched tall? Text and the company wordmarks **grow to fill the space**
- 🗜️ **Compact mode** (the boot-stomping-a-can button) — one slim bar per pool across all companies, grouped by company colour, fits any corner
- 🪟 **Windows Snap** works natively — drag to an edge or Win+Arrow
- ↕️ The window **grows and contracts with its content**: toggle the graph, burn a group away, hide a tracker — the frame follows
- 🙈 **Your board, your rules** — collapse any company entirely from its header, hide any single model or pool from a hover, burn away whole account groups; everything restores with a click

<p align="center">
  <img src="assets/screenshot-narrow.png" width="240" alt="Burnwatch squeezed narrow — colour chips and pie timers">
  <img src="assets/screenshot-compact.png" width="200" alt="Burnwatch compact mode — one slim bar per pool">
</p>

---

## Watching the burn

⏳ **Burn-rate Forecast** — projects when each pool hits 100%, on the chart and in tooltips
🗓️ **Session Planner** — per-company: finds your heaviest hours and suggests when to start a fresh window
🔔 **Usage & Burn-spike Alerts** — company-attributed desktop notifications; median+MAD anomaly detection on every tracked series (second accounts included)
📱 **Phone Alerts** — ntfy/webhook push for spikes, danger levels, maxed pools, daily digest
🌅 **Daily Digest** — yesterday's burn, per company, each morning
📈 **The Prediction Graph** — a 7-day history chart with **dotted burn-rate projections** showing when each pool will hit 100%. Toggled by the resident **pixel psychic**: eyes-open idle means history only; click him into his eyes-closed trance and the projections appear. Roomiest in wide mode, where it stretches beneath all three columns
💾 **Tray badges** — per-company colours (Anthropic blue, Fable red, OpenAI green, Google yellow), customizable, with X-on-red at 99% and terminal-cursor badges for second accounts
🔄 **Silent auto-update** — new releases download in the background and apply on next launch; you install Burnwatch exactly once

---

## The fun parts

🔥 **Pixel fire** — hiding an account group sends a pixel flame across its heading, charring the letters sooty-black with sparks and lingering smoke; reversing heals it letter by letter
✨ **Reset sparkles** — when a limit window completes, its ring gets a wand-tap burst (owed and paid later if you weren't looking)
🧊 **On ice** — companies you haven't touched in days freeze over, icicles and all
🟢 **Magic orbs** — banked OpenAI limit-resets glimmer softly
🤡 **The clown** — click him and he goes to jail, sad and crying, and every animation, glow, and filter in the app goes still. For the resource-conscious and the joyless alike.

![Burnwatch — settings: global options plus one column per company](assets/screenshot-settings.png)

---

## Installation

> 🔄 **Install once, update never again.** Burnwatch keeps itself current: it checks for new releases on launch (and daily), downloads them **silently in the background**, and applies them the next time the app starts. No more hunting down an installer for every release — the widget you install today is every future version too. (Portable and Linux builds show an update banner with a one-click link instead.)

### Download Pre-built Release

**Windows:**
1. Download the latest `Claude-Usage-Widget-{version}-win-Setup.exe` (installer) or `Claude-Usage-Widget-{version}-win-portable.exe` (no install needed) from [Releases](../../releases)
2. Run the installer or portable exe
3. Launch "Claude Usage Widget" from the Start Menu (installer) or directly (portable)
4. **To launch at Windows startup (portable only):** Press `Win+R`, type `shell:startup`, and copy the portable `.exe` into that folder. To update, copy the new version in and delete the old one.

**macOS:**
1. Download the latest `Claude-Usage-Widget-{version}-macOS-arm64.dmg` (Apple Silicon) or `Claude-Usage-Widget-{version}-macOS-x64.dmg` (Intel) from [Releases](../../releases)
2. Open the DMG and drag the app to your Applications folder
3. Launch "Claude Usage Widget" from Applications

> **⚠️ macOS Security Notice:** Because this app is not yet notarized with Apple, macOS Gatekeeper may show a "damaged or can't be opened" warning. To fix this, run the following command in Terminal after installing:
> ```
> xattr -cr /Applications/Claude\ Usage\ Widget.app
> ```
> Then try launching the app again.

**Linux:**
1. Download the latest `Claude-Usage-Widget-{version}-linux-x86_64.AppImage` (Intel/AMD) or `Claude-Usage-Widget-{version}-linux-arm64.AppImage` (ARM) from [Releases](../../releases)
2. Make it executable: `chmod +x Claude-Usage-Widget-*.AppImage`
3. Run it: `./Claude-Usage-Widget-*.AppImage`

> **Note:** AppImage runs without installation on most Linux distributions. On Ubuntu 22.04+, you may need to install a dependency first:
> ```bash
> sudo apt install libfuse2
> ```

#### Linux: Desktop Launcher & Autostart (optional)

By default the AppImage runs from wherever you put it. To get a clickable icon in your app launcher (and optionally launch at login), follow these steps.

**1. Place the AppImage somewhere permanent:**
```bash
mkdir -p ~/.local/bin
mv Claude-Usage-Widget-*.AppImage ~/.local/bin/claude-usage-widget.AppImage
chmod +x ~/.local/bin/claude-usage-widget.AppImage
```

**2. Create a desktop entry:**
```bash
cat > ~/.local/share/applications/claude-usage-widget.desktop << EOF
[Desktop Entry]
Name=Claude Usage Widget
Comment=Monitor Claude.ai usage
Exec=$HOME/.local/bin/claude-usage-widget.AppImage --no-sandbox
Icon=$HOME/.local/bin/claude-usage-widget.AppImage
Terminal=false
Type=Application
Categories=Utility;
StartupNotify=true
EOF
```

> **Note:** The `--no-sandbox` flag is required for Electron-based AppImages on most Linux systems due to sandbox namespace restrictions. This is an Electron/Chrome limitation, not specific to this widget.

**3. Register the entry:**
```bash
update-desktop-database ~/.local/share/applications/
```

The widget should now appear in your application launcher. Test it by launching from your app menu before proceeding to autostart.

**4. Autostart at login (optional):**
```bash
mkdir -p ~/.config/autostart
cp ~/.local/share/applications/claude-usage-widget.desktop ~/.config/autostart/
```

---

### Build from Source

**Prerequisites:**
- Node.js 18+ ([Download](https://nodejs.org))
- npm (comes with Node.js)

```bash
git clone https://github.com/SlavomirDurej/claude-usage-widget.git
cd claude-usage-widget
npm install
npm start
```


---

## Usage

### First Launch

1. Launch the widget
2. Click "Login to Claude" when prompted
3. A browser window will open — log in to your Claude.ai account
4. The widget will automatically capture your session
5. Usage data will start displaying immediately

### Widget Controls

- **Drag** — Click and drag the title bar to move the widget
- **Refresh** — Click the refresh icon to update data immediately
- **Graph** — Click the graph icon to toggle usage history
- **Minimize** — Click the minus icon to hide to system tray / dock
- **Close** — Click the X to Close the app

### System Tray

Right-click the tray icon for: Show/Hide, Refresh, Re-login, Settings, Exit.

---

## Understanding the Display

### Current Session & Weekly Limit

| Column | Description |
|--------|-------------|
| Session Used | Progress bar showing usage from 0–100% |
| Elapsed | Circular timer showing how far through the window you are |
| Resets In | Countdown until the window resets |
| Resets At | Actual local clock time / date when the window resets |

**Color Coding:**
- 🟣 Purple: Normal usage (below warning threshold, default 75%)
- 🟠 Orange: High usage (above warning threshold)
- 🔴 Red: Critical usage (above danger threshold, default 90%)

---

## Privacy & Security

- Credentials stored **locally only** using encrypted storage
- No data sent to any third-party servers
- Only communicates with the official Claude.ai API
- Logout clears all session data, cookies, and Electron session storage

---

## Troubleshooting

**"Login Required" keeps appearing** — Session may have expired. Click "Login to Claude" to re-authenticate.

**Widget not updating** — Check internet connection, click refresh manually, or try re-logging in from the tray menu.

**Build errors** — Clean reinstall resolves most issues:
```bash
rm -rf node_modules package-lock.json
npm install
```

If issues persist, open a [Support discussion](../../discussions/categories/support) with your OS, Node.js version, and full error output.

---

## Roadmap

- [x] macOS support
- [x] Linux support
- [x] Settings panel
- [x] Remember window position
- [x] Custom warning thresholds
- [x] Configurable date & time formats
- [x] Update notifications
- [x] Usage alerts at thresholds
- [x] Compact mode
- [x] Usage history graph
- [x] Currency support
- [x] Organization/Teams support
- [ ] Keyboard shortcuts

---

## Contributors

Special thanks to these contributors who have improved the widget:

- [@cwil2072](https://github.com/cwil2072) - macOS minimize/restore fix, usage history graph
- [@dion-jy](https://github.com/dion-jy) - Login flow architecture improvements
- [@goooseman](https://github.com/goooseman) - Login window security improvements
- [@sergkuzn](https://github.com/sergkuzn) - Linux desktop launcher & autostart documentation

---

## License

This project is licensed under the [MIT License](LICENSE) - see the LICENSE file for details.

---

*Built with Electron · [Releases](../../releases) · [Discussions](../../discussions)*
