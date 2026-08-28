# Release Process

For maintainers. I'm Burning! releases are **built locally and published with the GitHub CLI** — there
is no GitHub Actions tag-based release pipeline, no CHANGELOG file to maintain, and no code-signing
step. Only **Windows** binaries are published; macOS/Linux are build-from-source for now.

## Prerequisites

- A working Windows build environment (Node.js 18+, `npm install` done).
- The [GitHub CLI](https://cli.github.com/) (`gh`) authenticated with push/release rights on
  `dev-newb/imburning-electron`.

## Steps

1. **Bump the version** in `package.json` (the `version` field). This value drives both the built
   artifact filenames and the electron-updater `latest.yml`.

2. **Gate it:** `npm test` (must be all-green) and `npm audit --omit=dev` (no high/critical, or an
   explicitly documented acceptance).

3. **Commit and push** to the default branch — the lockfile ships with every version/dependency
   change, never `package.json` alone:
   ```bash
   git add package.json package-lock.json
   git commit -m "release: vX.Y.Z"
   git push origin feature/fable-usage
   ```

4. **Build the Windows artifacts:**
   ```bash
   npm run build:win
   ```
   This produces, in `dist/`:
   - `Claude-Usage-Widget-{version}-win-Setup.exe`
   - `Claude-Usage-Widget-{version}-win-Setup.exe.blockmap`
   - `Claude-Usage-Widget-{version}-win-portable.exe`
   - `latest.yml`

5. **Create the GitHub Release** and attach those four files:
   ```bash
   gh release create vX.Y.Z \
     --repo dev-newb/imburning-electron \
     --target feature/fable-usage \
     --title "vX.Y.Z" \
     dist/Claude-Usage-Widget-*-win-Setup.exe \
     dist/Claude-Usage-Widget-*-win-Setup.exe.blockmap \
     dist/Claude-Usage-Widget-*-win-portable.exe \
     dist/latest.yml
   ```

6. **Done.** electron-updater reads `latest.yml` from the release and delivers the update to
   installed (installer-build) clients **silently** — they pick it up on launch or the daily check,
   download in the background, and apply it on next launch. Portable users update by re-downloading.

## Notes

- **All four Windows assets are required.** `latest.yml` and the `.blockmap` are what electron-updater
  uses to detect and delta-download the new version; omitting them breaks auto-update.
- **`--target feature/fable-usage`** ties the release to the default branch you just pushed.
- **No code signing.** Windows builds are unsigned; macOS builds (when built from source) are not
  signed or notarized. Do not add a signing/notarization step here unless the project actually
  obtains certificates.
- **macOS/Linux binaries are not published.** If/when that changes, build with `npm run build:mac` /
  `npm run build:linux` and attach those artifacts to the same release.
