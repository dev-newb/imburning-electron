# Burnwatch Audit Remediation Plan

**Baseline:** Burnwatch v2.1.1 (`69ca84e`)  
**Prepared:** 2026-07-20  
**Status:** Implemented locally and verified on 2026-07-20. No commit, push, installation, or release was performed.  
**Scope:** Remediation plan and implementation record. The trailing underscore on compact CLI labels is intentional because it distinguishes CLI accounts from desktop-login accounts and is not included as a defect.

## Implementation verification

- Automated regression suite passes, including explicit coverage for the intentional CLI cursor.
- Dependency audit is clean and Windows installer plus portable artifacts build successfully.
- Normal, tall, wide, compact, detached-graph, projection, theme, legend, settings, close-to-tray, and second-instance restore flows were exercised in the packaged app.
- Legacy in-config history migrated to daily JSONL with a retained backup and validated record counts; user settings were preserved.

## Goals

- Preserve accurate usage history across intermittent provider failures.
- Prevent optional integrations from breaking mandatory usage refreshes or deleting valid credentials.
- Remove avoidable main-process I/O and configuration churn.
- Make normal, tall, wide, and detached-graph layouts predictable at supported window sizes and DPI scales.
- Make settings, tray behavior, OAuth, and saved-window state consistent and testable.
- Upgrade the runtime and build stack behind an automated regression safety net.

## Finding-by-finding remediation

### 1. Missing provider samples are converted to zero

Represent unavailable values as `null`, while preserving genuine numeric zero. Configure Chart.js with `spanGaps: false`. Filter missing samples out of forecast, burn-rate, and anomaly calculations rather than treating them as usage measurements.

**Acceptance:** A simulated provider outage creates a graph gap instead of a plunge to zero and does not produce a false forecast, reset, or burn alert.

### 2. Optional endpoint failures break the entire refresh

Fetch mandatory usage independently. Fetch overage and prepaid endpoints with settled, non-fail-fast requests and merge only the successful optional results. Delete credentials only after a validated authentication failure from the mandatory endpoint, such as a confirmed 401/403 or provider-specific authentication response. Do not delete credentials for timeouts, network errors, HTML responses, Cloudflare pages, or optional endpoint failures.

**Acceptance:** Each optional endpoint can fail independently while core usage keeps updating and saved credentials remain intact.

### 3. Multi-megabyte configuration is synchronously rewritten repeatedly

Keep small settings and credentials in `electron-store`. Move usage history into dedicated append-only daily JSONL files, partitioned by provider or account scope. Append one record asynchronously per refresh, rotate files daily, and periodically compact or remove expired history away from the refresh path. Keep the latest snapshot in a separate small file or combine it with the single refresh persistence operation.

Migrate existing history once. Validate the migrated record counts before removing legacy history and retain a recoverable backup until the first successful post-migration launch.

**Acceptance:** A refresh no longer serializes the full configuration, UI responsiveness is unaffected by history persistence, and all retained history survives migration.

### 4. Daily digest rejects default five-minute samples

Create one shared sample-gap policy based on the configured refresh interval plus jitter. Reuse it in digest, burn, anomaly, and forecast logic. Continue rejecting genuinely long gaps caused by sleep, shutdown, or loss of connectivity.

**Acceptance:** Digest totals work at 30-second, five-minute, and other supported refresh intervals without counting overnight or sleep gaps.

### 5. Electron and build dependencies have high-severity advisories

Add the minimum regression coverage first. Upgrade Electron and electron-builder independently to supported, audit-safe releases, regenerate the lockfile, and rerun the dependency audit. Separate runtime advisories from build-machine-only advisories in release documentation.

Exercise packaging, installer and portable builds, auto-update, OAuth callbacks, tray icons, native window controls, and safe-storage compatibility after each upgrade.

**Acceptance:** No unresolved high-severity runtime advisories remain, packaged Windows assets pass smoke testing, and any residual build-only risk is explicitly documented.

### 6. Graph is clipped in normal and tall layouts

Allow automatic window growth only up to the active display work area. Once that limit is reached, make the content region the single vertical scroll owner with `min-height: 0`, while keeping the title bar and primary controls fixed. Give the graph a usable minimum height rather than allowing it to collapse to a sliver.

**Acceptance:** Every row and the complete graph are reachable with one, two, or three expanded companies across supported work-area heights and DPI scales.

### 7. Reattaching the graph shrinks wide mode

Restrict `_forceFitHeight()` to normal auto-fit mode. Do not resize the BrowserWindow when wide, tall, or user-sized mode is active. Reattaching the graph should update inline visibility and call the chart resize/reflow path without changing window bounds.

**Acceptance:** A 900x600 wide window remains 900x600 through repeated detach and reattach cycles, and the inline chart returns at its intended size.

### 8. Detached graph displays epoch-millisecond labels

Move timestamp formatting and shared Chart.js scale construction into a renderer utility consumed by both inline and detached charts.

**Acceptance:** Both graphs use identical readable labels for short, multi-hour, and multi-day ranges in every supported time format.

### 9. Detached graph ignores the projections setting

Read `projectionsOn` when building detached datasets and add projection datasets only when enabled. Broadcast a narrowly scoped graph-settings-change event so an already-open detached graph updates immediately when the psychic control changes.

**Acceptance:** Toggling projections updates both graphs without closing, reopening, or waiting for the next scheduled refresh.

### 10. Wide mode exposes unintended native scrollbars

Use `minmax(0, 1fr)` for landscape grid tracks and `min-width: 0` on grid children. Constrain responsive chart elements and suppress horizontal overflow at the intended content boundary. Keep vertical scrolling only where the content genuinely exceeds the available height.

**Acceptance:** No horizontal scrollbar appears at supported widths or DPI scales, while intentional vertical scrolling remains usable.

### 12. Light-theme threshold inputs have poor contrast

Add explicit light-theme foreground, background, border, hover, disabled, and focus styles for numeric inputs and native spin controls. Check normal and focused states against WCAG AA contrast targets.

**Acceptance:** Values, controls, and focus indicators remain clearly visible in both themes.

### 13. Hidden legend state does not persist

Add `chartHiddenSeries` to the main-process settings defaults, return value, validation schema, and save whitelist. Store stable internal series IDs rather than display labels and prune IDs for series that no longer exist.

**Acceptance:** Hidden series remain hidden after a full packaged-app restart, without affecting newly introduced series.

### 14. `forceExtended` is dropped by the preload bridge

Forward a narrowly sanitized options object through preload, accepting only `forceExtended === true`, and validate the option again in the main IPC handler.

**Acceptance:** Expanding every extended section causes an immediate forced fetch, including fallback and retry paths.

### 15. Tray and close lifecycle is inconsistent

Centralize lifecycle decisions in `hasVisibleTray()` and `shouldHideOnClose()` helpers used by the custom close handler, native close events, and `window-all-closed`. Include the Anthropic, OpenAI, and Google provider trays. Respect the minimize-to-tray setting without allowing an invisible, unrecoverable process; create a generic restore tray if necessary.

**Acceptance:** Any visible tray keeps the app recoverable, closing with no tray quits completely, and Alt+F4 and the custom close button behave consistently.

### 16. OAuth callback reports success before validation

Accept only the expected callback path. Validate provider state, provider error, and authorization code before displaying success. A state mismatch should return a safe error without consuming the active flow. Exchange and store the token before displaying the final success page. Close the server on success, an expected provider rejection, or timeout.

**Acceptance:** Denial, missing code, incorrect state, token-exchange failure, unrelated requests, timeout, and genuine success each produce the correct outcome and lifecycle.

### 17. Saved window bounds can reopen offscreen

Clamp saved main and graph bounds against `screen.getAllDisplays()` work areas. Constrain sizes to the selected work area. If saved bounds no longer meaningfully intersect any display, center the window on the primary display and persist the corrected bounds.

**Acceptance:** Windows saved on a removed secondary monitor reopen fully reachable after the monitor is disconnected or DPI/topology changes.

### 18. No automated regression suite protects complex renderer and main-process behavior

Extract and unit-test pure functions for normalization, sample gaps, digest math, projections, history records, settings validation, and bounds clamping. Add IPC integration tests and Playwright Electron smoke tests for layouts, themes, projection synchronization, settings persistence, tray lifecycle, and graph detach/reattach. Refactor large renderer functions only after characterization tests preserve current intended behavior.

**Acceptance:** CI runs unit and IPC tests plus a packaged Windows smoke pass before a release can be published.

## Delivery sequence

1. Add a small characterization-test safety net from finding 18.
2. Fix correctness and credential safety: findings 1, 2, 4, and 16.
3. Fix persistence and lifecycle: findings 3, 13, 14, 15, and 17.
4. Fix visual behavior: findings 6 through 10 and 12.
5. Upgrade Electron and build dependencies as a dedicated change.
6. Run the complete manual and automated regression matrix before release.

## Release gates

- Optional endpoint failures cannot delete credentials or suppress mandatory usage.
- Missing measurements cannot become artificial zero measurements.
- Existing history migrates with verified record counts and a rollback path.
- Settings and legend state persist across a packaged-app restart.
- Close behavior always either quits or leaves a visible recovery path.
- Normal, tall, wide, compact, and detached layouts pass with one, two, and three providers in light and dark themes.
- Installer, portable build, auto-update, OAuth, tray, and safe-storage flows pass on Windows.
- The repository and packaged application pass the dependency audit policy adopted for release.
