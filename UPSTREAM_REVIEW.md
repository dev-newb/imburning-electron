# Upstream review — 2026-10-16

Compared I'm Burning at `b46d32f` with the original
[Claude Usage Widget](https://github.com/SlavomirDurej/claude-usage-widget):
stable `v1.7.6`, main `c9b3bdb`, and develop `7cdd2ab` / `v1.7.7-rc.2`.
Also inspected open issues and pull requests and ran npm audit against our lockfile.
Commit ancestry alone overstates the gap: this fork independently implements or
selectively ports many upstream fixes.

## Priorities

1. **High: refresh Electron security patches.** Our lockfile pins Electron 43.1.1.
   The audit lists high-severity Electron advisories, including sandbox inheritance,
   protocol cross-origin reads, and preload cache poisoning. The reported fixed
   versions for these issues require at least 43.5.0 on the 43.x line. Select a
   currently supported patched version and test packaged login, updates and window
   behavior before replacing the runtime. Upstream's lockfile is still on 41.10.1;
   copying its dependency file is not an appropriate upgrade strategy.
   Sources: [sandbox inheritance](https://github.com/advisories/GHSA-gr2m-v5gq-v685),
   [protocol access](https://github.com/advisories/GHSA-j84w-jfhq-vhvj),
   [preload cache](https://github.com/advisories/GHSA-qmv3-fv6v-rmhq).
2. **Medium: member-specific Extra Usage limits.** Our Electron overage merge in
   `main.js` overwrites `/usage.extra_usage` with organization-wide spending figures.
   Team/Enterprise users can therefore see the wrong cap and spend. Adapt upstream
   [296cbd3](https://github.com/SlavomirDurej/claude-usage-widget/commit/296cbd3):
   prefer a numeric member `monthly_limit` and member enablement, with organization
   data only as fallback. Test zero, null and missing caps and disabled members.
   Tauri preserves the member amounts but still overwrites member enablement and
   currency with organization values; align that precedence too.
3. **Medium, conditional on login method: Google sign-in popups.** Electron's
   Claude login window denies every popup. Upstream
   [PR 133](https://github.com/SlavomirDurej/claude-usage-widget/pull/133) reports that
   Claude's Google login now uses one, and country-specific Google hosts can fail
   the allowlist. This PR remains unmerged. Implement trusted popup navigation with
   redirect guards and token-safe logging; do not simply allow all popups. Test
   legitimate and hostile domains, then a fresh Google login. We confirmed the
   blanket denial in our source, not an end-to-end login failure on this Mac.
4. **Dependency maintenance:** npm audit reports 15 affected package entries
   (6 high, 9 moderate; zero critical). Most are build-tool dependencies. The
   production-only audit reports one moderate entry, `fast-uri` 3.1.7; its reported
   fix is 3.1.8. Electron is classified as a development dependency by npm but is
   shipped as the application's runtime, so a production-only audit understates
   the installed app's exposure. Refresh compatible dependencies and review the
   resulting lockfile; do not use `npm audit fix --force` blindly.

## Already covered or not a required bug fix

The fork has bounded 429 retry handling, session decryption recovery, transient
failure handling that preserves login, profile isolation, window recovery,
guarded window lifecycle behavior, prerelease update comparisons, scoped model
limits, threshold coloring, enterprise domain guards, and Linux AppImage/Wayland
startup handling. Exact implementations differ from upstream.

The RC also adds scheduled local/cloud session starts and a redesigned credits
panel. Those are optional product features, not prerequisites for correctness.
Upstream's credit-spend heuristic can force a reported 95–99% quota to 100%; that
needs an explicit product decision because this fork uses quota changes for
alerts and history. It should not be imported as an unquestioned fix.

## Naming change in this review

The installed Electron bundle already had the name `I'm Burning!`; no installed
`Claude Usage Widget.app` was found in `/Applications` or `~/Applications`.
The new build and Mac installer now use exactly `I'm Burning.app`, and obsolete
installation instructions have been corrected. The internal package name and
`claude-usage-widget` data directory intentionally remain stable to preserve
accounts, encrypted credentials, profiles and history. The upstream attribution
in Settings remains intact.

The naming change passed all 200 Electron tests, macOS packaging, bundle-name
inspection and strict signature verification. This review does not apply the
security or behavior fixes listed above, and does not claim a full Tauri audit.
