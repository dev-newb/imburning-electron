# Contributing to Burnwatch

Thanks for your interest in contributing! Burnwatch is an Electron desktop widget that tracks AI
usage across **Anthropic, OpenAI, and Google**, with multi-account support. This guide covers dev
setup, the codebase layout, and how to submit changes.

> Naming note: the app is **Burnwatch**, but the internal package name stays `claude-usage-widget`
> and the electron-builder product name stays `Claude-Usage-Widget` — kept deliberately so the
> settings directory and auto-update channel don't change. You'll see those literals in code and
> build artifacts.

## Development Setup

### Prerequisites
- Node.js 18+ ([download](https://nodejs.org)) and npm
- Git

### Getting started

1. **Fork and clone** (the default branch is `feature/fable-usage`):
   ```bash
   git clone https://github.com/YOUR_USERNAME/burnwatch.git
   cd burnwatch
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run it:**
   ```bash
   npm start           # normal run
   npm run dev         # runs with NODE_ENV=development (auto-opens DevTools)
   ```

## Project Structure

```
burnwatch/
├── main.js                     # Electron main process (windows, tray, IPC, auto-update)
├── preload.js                  # IPC bridge exposed to the renderer (contextIsolation)
├── package.json                # dependencies + electron-builder config
├── src/
│   ├── fetch-via-window.js     # fetches the claude.ai API via hidden BrowserWindows
│   │                           #   (works around Cloudflare bot-blocking on plain HTTPS)
│   └── renderer/
│       ├── index.html          # widget UI
│       ├── app.js              # renderer logic (chart is inlined here via the chart.js UMD build)
│       └── styles.css          # styles
├── tools/
│   └── gen-logo.cjs            # pixel-art asset generator (logo/tray/sprite images)
└── assets/                     # icon.ico, icon.icns, logo.png, tray-icon.png, sprites, screenshots
```

There is no separate chart-setup module — the usage chart is created inline in `src/renderer/app.js`
using the bundled chart.js UMD build.

### Regenerating pixel-art assets

The logo, tray icon, and sprite images are generated, not hand-drawn. Regenerate them with:

```bash
node tools/gen-logo.cjs
```

## Building

```bash
npm run build:win     # Windows installer (NSIS) + portable exe
npm run build:mac     # macOS .dmg, arm64 + x64 (requires macOS; builds are unsigned)
npm run build:linux   # Linux AppImage, x64 + arm64
npm run build         # electron-builder default for the current host
```

Output goes to `dist/`. Only Windows binaries are published in Releases today; macOS/Linux are
build-from-source (see [INSTALL.md](INSTALL.md)).

## Debugging

- **Renderer (widget UI):** run `npm run dev`, or set `NODE_ENV=development` — DevTools opens
  automatically. Use the DevTools console and Network tab to inspect the UI and provider API calls.
- **Main process:** logs print to the terminal where you launched Burnwatch.
- **Verbose logging:** diagnostics are redacted — they never print session-key material or OAuth
  account identity, so the flag is safe to use around real logins. Set `DEBUG_LOG=1` (or pass `--burnwatch-debug`) to enable the main process's verbose
  debug logging:
  ```bash
  DEBUG_LOG=1 npm start          # macOS/Linux
  ```
  ```powershell
  $env:DEBUG_LOG=1; npm start    # PowerShell
  ```

### Things worth testing

Burnwatch supports **multiple providers and multiple accounts per provider**, so exercise those
paths when you change fetching or the tray:

- Anthropic via a claude.ai session; OpenAI via "Sign in with ChatGPT" or the local `codex` CLI
  login; Google via "Sign in with Google" or the local `gemini` CLI login.
- A second (CLI) account alongside a company's primary account — it should render with its own
  terminal-cursor tray badge.
- Per-company tray badge colors, and the X-on-red badge at 99%.
- Settings persist across restarts; window position is remembered.

## Code Style

- `const`/`let`, never `var`; semicolons; 2-space indentation.
- Descriptive names; comments for non-obvious logic; wrap fallible calls in try/catch.

## Submitting Contributions

1. **Create a feature branch** off the default branch:
   ```bash
   git checkout -b feature/your-change
   ```
2. **Make and test your changes** on your platform; update docs if behavior changes.
3. **Commit** with a clear message (Conventional Commits are welcome — `feat:`, `fix:`, `docs:`,
   `chore:`, `refactor:`).
4. **Push** to your fork and **open a Pull Request** against
   [dev-newb/burnwatch](https://github.com/dev-newb/burnwatch) (`feature/fable-usage`). Describe
   what changed, link related issues, and include screenshots for UI changes.

## Release Process

For maintainers — see [RELEASE_PROCESS.md](RELEASE_PROCESS.md).

## Questions?

Open a [Discussion](https://github.com/dev-newb/burnwatch/discussions) or check existing
[Issues](https://github.com/dev-newb/burnwatch/issues).
