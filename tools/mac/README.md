# Burnwatch on macOS

No signed Mac builds are published, so macOS installs are built from source.
These two scripts make that self-updating: the app lives in `/Applications`
like any other app, and updates itself at login with no Terminal window.

## Setup (once)

Requires [Node.js](https://nodejs.org) 18+ and git.

```bash
git clone https://github.com/dev-newb/burnwatch.git
cd burnwatch
bash tools/mac/install.sh
```

That installs a launchd agent and kicks off the first build. A few minutes
later `Claude-Usage-Widget.app` appears in Applications and launches.

## After that

Nothing. At every login the agent checks GitHub for a newer release tag. If
there is one it rebuilds, replaces the app, and relaunches it; if not it just
launches the app. Normal logins cost one quick `git fetch` — the slow rebuild
only happens on the logins where a new version actually exists.

Keep the cloned folder where it is — the agent builds from it.

## Notes

- Locally built apps are not quarantined, so there is no Gatekeeper
  "unidentified developer" prompt and no signing certificate needed.
- Log: `~/Library/Logs/burnwatch-update.log`
- Update immediately instead of waiting for a login: `bash tools/mac/update.sh`
- Uninstall the agent:
  `launchctl unload -w ~/Library/LaunchAgents/com.burnwatch.updater.plist && rm ~/Library/LaunchAgents/com.burnwatch.updater.plist`

Windows is different: it ships signed installers and updates itself in-app via
the release banner. None of this applies there.
