# Burnwatch — Developer Handoff

A practical map for taking over Burnwatch development. Read this alongside `README.md` (user-facing feature tour) and the source. Written 2026-07-20 at **v2.1.1**.

---

## 1. What it is

Burnwatch is an **Electron 28 desktop widget** (Windows / macOS / Linux) that tracks AI usage across **Anthropic, OpenAI, and Google** in real time — every pool, *both accounts per company* (desktop app login **and** the CLI login when they differ). Fork of [SlavomirDurej/claude-usage-widget](https://github.com/SlavomirDurej/claude-usage-widget); lives at **`dev-newb/imburning-electron`**, local clone `Documents/claude-usage-widget`, active branch **`feature/fable-usage`** (also the repo default branch).

- **Node** 18+, **npm** 9+. Deps: `chart.js`, `electron-store`, `electron-updater`. No test suite — verification is manual/visual (see §5).
- `name`/`appId`/`productName` are deliberately **unchanged** from upstream (`claude-usage-widget` / `com.claudeusage.widget` / `Claude-Usage-Widget`) so the `%APPDATA%\claude-usage-widget` userData dir and the electron-updater channel keep working across the rename to Burnwatch. Only display strings say "Burnwatch".

---

## 2. Architecture & key files

```
main.js                    ~3600 lines — Electron main process
preload.js                 contextBridge IPC surface (the ONLY renderer↔main API)
src/fetch-via-window.js    hidden BrowserWindow that fetches claude.ai (Cloudflare bypass) — REAL & ESSENTIAL
src/renderer/index.html    widget markup (title bar + toolbar + sections + graph)
src/renderer/app.js        ~3600 lines — all renderer logic
src/renderer/styles.css    ~3000 lines — layout, responsive bands, animations
src/renderer/graph.html    NEW — detached graph window markup (theme-var driven)
src/renderer/graph.js      NEW — self-contained chart for the detached window
tools/gen-logo.cjs         pixel-art asset generator (icon.ico, logo.png, tray-icon.png, sprites)
assets/                    icons, tray badges, PNG sprites (press/clown/psychic), README screenshots
```

**IPC is the boundary.** The renderer can only call what `preload.js` exposes on `window.electronAPI`. Any new main↔renderer channel must be added there. `get-settings`/`save-settings` (and the renderer's `_saveSettingsPatch`) whitelist keys individually in main — **a new renderer setting is silently dropped until added to both handlers** (this has cost multiple debug cycles).

---

## 3. Core subsystems (entry points)

- **Data fetch** — `fetch-usage-data` IPC in main.js runs the provider fetches, caches results ~5 min (`cachedProviderFetch`, 30-min hard cap via `goodAt` — polling faster than 5 min 429s the APIs), and writes history + `latestUsageData` to the store. `src/fetch-via-window.js` does the claude.ai fetch through a hidden BrowserWindow (bypasses Cloudflare). Renderer pulls via `fetchUsageData()` on `startAutoUpdate`'s interval.
- **Providers** — Anthropic (session 5h / weekly 7d / **scoped weekly** pools like Fable, rendered generically from `limits[]` with `kind:"weekly_scoped"`; legacy `seven_day_opus/sonnet` are null now), OpenAI (Codex, Spark, credits, limit-reset orbs), Google (one row per model *version*). **Dual-account:** each company can have a desktop login + a different CLI login → amber "CLI: 2ND ACCT" pill, second-account rows/history/tray badge. CLI creds read **read-only, access-token only, never refresh** (rotating a CLI refresh token can kill the user's CLI login).
- **Tray badges** — per-company colored badges; `syncExternalProviderTrays` / `syncFableTray` / `generateCliIcon`. Colors customizable in Settings.
- **Responsive reflow** — `applySqueezeClasses()` (app.js) toggles body classes from live window size, but **only while `_windowUserSized`** (set by the `window-user-sized` IPC), so auto-height never fights its own compression. Width bands `sz1/lbl-abbr/lbl-code/sz3/sz4`; `landscape` (3-column, w>h && w≥760); `vh-1/2/3`; `tall` (continuous `--tall` 0→1 scalar driving `calc()` font/size growth). **Wide/Tall preset buttons** (title bar) → `apply-window-preset` IPC sets bounds and *leaves the size trackers alone* so `windowIsUserSized()` reports true and the reflow engages; buttons toggle back via `_activePreset`. `--tall` enlargement is gated to **< 3 tracked companies** (with all three the big wordmarks overflow).
- **Chart** — `renderChart(history)` (app.js) builds Chart.js datasets: Anthropic series (labeled **CLA 5H / CLA 7D** + model pools), scoped pools, and **cross-provider comparison lines** (codex/gemini/*Cli/claudeCli, CLI dashed). Bottom legend toggles series (persisted in `settings.chartHiddenSeries` by label). Forecast **projection** lines (dotted) come from `computeForecasts()` (main.js, least-squares over ~6h reset-aware history) for session/weekly/model-pools/scoped/providers; gated on the psychic toggle (`projectionsVisible`). **Detachable graph window** (`graph.html`/`graph.js`) is a self-contained copy fed `get-usage-history` + `get-latest-usage` over IPC, follows the theme, has its own always-on-top pin + saved bounds; the inline graph hides while detached.
- **Row hide/show** — hiding a pool **burns the row away** (reuses `runPixelSweep`, the pixel-fire engine also used on subheadings; `.usage-section.row-burning` chars the content, no residue) then collapses height while `_followResize` shrinks the window. Unhide via the "N hidden" chip = `restoreRowsSparkle`→`revealMarkedRows` (row grows from collapsed) + `sparkleRow` gold sprinkle. Persisted in `settings.hiddenRows`.
- **Alerts** — burn-spike (median+MAD baseline; the pair gap tracks `sampleGapLimitMs(refreshInterval)` from `src/usage-math.js`), warn/danger/maxed thresholds, daily digest, ntfy/webhook phone alerts (`sendAlertWebhook`; the only outbound of user data, opt-in).
- **Auto-update** — `electron-updater` silent background download from GitHub releases; applies on next launch. Releases **must** attach `Setup.exe` + `.blockmap` + `portable.exe` + `latest.yml`.

---

## 4. Conventions & invariants (do not break)

- **Credentials:** never consume/rotate Anthropic or OpenAI CLI **refresh** tokens (short-lived access tokens only, while fresh); never write back to CLI cred files; Google refresh tokens don't rotate so minting access tokens is fine. History export & everything else stays **local** — the only outbound is the opt-in webhook.
- **Settings persistence:** `_saveSettingsPatch(patch)` merges into `window._cachedSettings` and saves the whole blob; main's `get-settings`/`save-settings` whitelist keys — add new keys to **both**.
- **electron-store writes:** never write the config with PowerShell `Out-File` (BOM crashes electron-store) — use `node fs.writeFileSync`.
- **Commit trailer:** end commit messages with a `Co-Authored-By:` line for the model that did the work.

---

## 5. Dev workflow (the gotchas matter)

**Run the dev app:** `npm start` (or `DEBUG_LOG=1 npx electron .` for main-process logs).
- ⚠️ The installed widget (`C:\Program Files\Claude-Usage-Widget\`) and the dev run **share** `%APPDATA%\claude-usage-widget` → single-instance lock. **Kill the installed `Claude-Usage-Widget.exe` first.** And when re-launching dev repeatedly, **kill `electron.exe` too** — a stale dev process holds the lock and your new launch dies silently, so you screenshot the *old* window and think "my change didn't take."
- **Renderer errors are invisible** (they go to the renderer console, not the DEBUG_LOG stdout). A JS error in app.js leaves rows static at 0%/`--:--` and the window stuck at 155px while main-side logs look healthy. `node --check src/renderer/app.js` before running catches syntax errors; for runtime, open DevTools (`NODE_ENV=development` auto-opens detached DevTools) or probe via `webContents.executeJavaScript`.
- **Screenshots (Windows):** capture with Win32 `PrintWindow` matching the window title (`"Burnwatch"` for the widget). The window may be minimized at (-32000,-32000) — `ShowWindow(h,9)` first. **PrintWindow returns a BLANK/black client area** right after a reflow (section collapse / graph toggle) and for the **detached graph window** (GPU-composited) — for the graph window, verify via `executeJavaScript` (e.g. `canvas.toDataURL().length` ≈ tens of KB when drawn) instead. A `cap.ps1` PrintWindow-loop harness pattern is used throughout (poll `EnumWindows` until the title exists, start capture *before* electron, Add-Type csc compile eats ~10s).
- **TEMP test hooks:** when auto-driving the UI in a dev run (clicking buttons, toggling presets), inject a clearly-marked `// TEMP-…` block, **remove it by anchor-replacing the exact text** (not index-slicing — that has shipped broken code before), and re-check syntax. TEMP clicks that toggle *persisted* settings (clown/pizazz, presets) rewrite the user's real config — restore after.

**Build (Windows):** `npm run build:win` → `dist/Claude-Usage-Widget-2.x.y-win-{Setup.exe,Setup.exe.blockmap,portable.exe}` + `latest.yml`. macOS/Linux targets exist in config but GitHub Actions is disabled on the fork and targets `main`, so **only Windows binaries are ever published** — mac/linux are build-from-source (`npm run build:mac`/`build:linux`).

**Release:**
1. Bump `package.json` version.
2. Commit + push `feature/fable-usage`.
3. `npm run build:win`.
4. `gh release create vX.Y.Z --repo dev-newb/imburning-electron --target feature/fable-usage --title "…" --notes-file notes.md dist/Claude-Usage-Widget-X.Y.Z-win-Setup.exe dist/…Setup.exe.blockmap dist/…portable.exe dist/latest.yml`
5. Installed widgets auto-update on next launch. (If you ship a broken build: fix, **delete the bad GH release**, ship a hotfix, and purge `%LOCALAPPDATA%\claude-usage-widget-updater\pending`.)

---

## 6. Current state (v2.1.1) & recent work

Shipped and verified through v2.1.1:
- Multi-account tracking, every pool across all three companies, responsive reflow + landscape/tall/compact, tray badges, forecasts, alerts, digest, auto-update (2.0.x).
- **v2.1.0:** cross-provider comparison lines + legend toggles, provider forecasts, **detachable graph window**, **wide/tall presets**, **burn-away/sparkle row hide**, history export.
- **v2.1.1:** title-bar caption buttons (wide/tall/✕, Windows-spaced) with the rest of the toolbar centered on the second strip; detached graph follows the user's theme; graph legend keys read **CLA 5H / CLA 7D**; forecast projection lines extended to session + all model pools; graph hides from the main window while detached; landscape graph resizes (clamp `30vh`) so wide mode doesn't clip it; big-wordmark tall mode gated to <3 companies.

Full version-by-version history + gotchas live in the maintainer's notes (see §8).

---

## 7. Open items / known gaps / roadmap

- **Icon redesign is PARKED** — a scratchpad "icon lab" explored new vise/clown/psychic pixel art; the owner rejected all iterations. The app's tray/toolbar PNG sprites (`assets/press-*.png`, `clown-*.png`, `psychic-*.png`) are **untouched**; revisit with a fresh direction.
- **Cross-platform art gap:** `assets/icon.icns` + `tray-icon-mac/linux.png` are still upstream art (`gen-logo.cjs` only emits `icon.ico`/`logo.png`/`tray-icon.png`) → mac/linux show the old icon. Regenerate when publishing mac/linux.
- **Prebuilt mac/linux binaries** — not published (Actions disabled on fork; would need to target this branch).
- **Feature backlog** (power users with all three companies): "Headroom right now" chip, unified next-reset ticker, same-company multi-account roll-up, combined-spend estimate, keyboard shortcuts. Chart y-axis doesn't rescale to *visible* series when some are legend-hidden (cosmetic).
- **Edge cases noted but not fixed:** CLI-only rows aren't individually hideable; hidden-desktop-history can pollute a series; a couple of `vh-short` alignment nits.

---

## 8. Where to go deeper

- **`README.md`** — the user-facing feature tour (what every control does, all the "fun parts").
- **`RELEASE_PROCESS.md` / `CONTRIBUTING.md` / `QUICKSTART.md` / `INSTALL.md`** — repo docs.
- **Maintainer memory notes** (outside the repo, in the prior toolchain) hold a dense per-version changelog with the exact commit hashes, the reasoning behind each design choice, and every gotcha hit along the way — the single richest source if a behavior seems surprising. Ask the owner for `project_usage_widget_fork.md` and `project_burnwatch_app_internals.md`.
- When a behavior is confusing, **grep the symbol** and read the surrounding comment — this codebase is heavily commented at the "why," not just the "what."
