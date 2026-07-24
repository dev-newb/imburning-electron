'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rendererDir = path.join(__dirname, '..', 'src', 'renderer');
const repoDir = path.join(__dirname, '..');

test('CLI compact labels retain the intentional terminal cursor', () => {
  const source = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  assert.match(source, /labelEl\.textContent = p\.code \+ \(p\.cli \? '_' : ''\);/);
});

test('both charts preserve gaps and persist stable series identifiers', () => {
  for (const name of ['app.js', 'graph.js']) {
    const source = fs.readFileSync(path.join(rendererDir, name), 'utf8');
    assert.match(source, /spanGaps: false/);
    assert.match(source, /seriesId/);
    assert.doesNotMatch(source, /y:\s*pick\(e\)\s*\|\|\s*0/);
  }
});

test('sandboxed preload stays self-contained and strictly sanitizes fetch options', () => {
  const source = fs.readFileSync(path.join(repoDir, 'preload.js'), 'utf8');
  assert.doesNotMatch(source, /require\(['"]\.\/src\//);
  assert.match(source, /value\.forceExtended === true/);
  assert.match(source, /value\.forceProviders === true/);
  assert.match(source, /value\.refreshLocalCredentials === true/);
  assert.doesNotMatch(source, /\.\.\.value/);
});

test('wide layout keeps the requested graph and toolbar control placement', () => {
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(rendererDir, 'styles.css'), 'utf8');
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');

  assert.match(html, /title-caption[\s\S]*id="minimizeBtn"[\s\S]*id="wideBtn"/);
  assert.match(html, /toolbar-group-play[\s\S]*toolbar-spacer[\s\S]*toolbar-group-utility/);
  assert.match(css, /\.psychic-btn\s*\{[\s\S]*bottom:\s*6px;[\s\S]*right:\s*10px;/);
  assert.match(css, /\.graph-popout-btn\s*\{[\s\S]*top:\s*6px;[\s\S]*right:\s*8px;/);
  assert.match(css, /body\.landscape \.graph-section\s*\{[\s\S]*align-self:\s*stretch;/);
  assert.doesNotMatch(app, /elements\.(?:settingsBtn|refreshBtn|graphBtn)\.style\.display = 'none';/);
});

test('Claude login lives in Settings and follows fresh credential state', () => {
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');

  assert.doesNotMatch(html, /Connect to Claude\.ai/);
  assert.match(html, /id="anthropicLoginStatus">Not connected</);
  assert.match(html, /id="logoutBtn"[^>]*>Log In</);
  assert.match(app, /async function loadSettings\(\)[\s\S]*credentials = await window\.electronAPI\.getCredentials\(\);[\s\S]*syncAnthropicAuthControls\(\);/);
  assert.match(app, /elements\.logoutBtn\.textContent = connected \? 'Log Out' : 'Log In';/);
});

test('second toolbar provides a dedicated forced rescan for local CLI accounts', () => {
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');

  assert.match(html, /toolbar-group-utility[\s\S]*id="refreshBtn"[\s\S]*id="refreshLocalLoginsBtn"[\s\S]*id="graphBtn"[\s\S]*id="settingsBtn"/);
  assert.doesNotMatch(html, /settings-account-refresh/);
  assert.match(app, /async function refreshLocalLogins\(\)[\s\S]*getCredentials\(\)[\s\S]*localProviderCredentialsAvailable[\s\S]*refreshLocalCredentials: true/);
  assert.doesNotMatch(app, /button\.textContent = 'Refresh local logins'/);
});

test('local credential rescan clears account-bound provider caches', () => {
  const main = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');

  assert.match(main, /function resetLocalCredentialCaches\(\)[\s\S]*clearCredentialHomeCache\(\)[\s\S]*_geminiAccessToken = \{ token: null, expiresAt: 0 \};[\s\S]*_ccSameState = \{ mode: null, candidate: null, streak: 0 \};[\s\S]*delete _providerCache\[key\]/);
  assert.match(main, /options\.refreshLocalCredentials === true\) resetLocalCredentialCaches\(\)/);
  assert.match(main, /localProviderCredentialsAvailable: claudeCliAvailable \|\| hasLocalProviderCredentials\(\)/);
});

test('Claude and Codex local login discovery includes WSL and avoids desktop-account masking', () => {
  const main = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');

  assert.match(main, /require\('\.\/src\/local-credential-sources'\)/);
  assert.match(main, /localCredentialFiles\('\.claude', '\.credentials\.json'\)/);
  assert.match(main, /localCredentialFiles\('\.codex', 'auth\.json'\)/);
  assert.match(main, /Number\(b\.kind === 'wsl'\) - Number\(a\.kind === 'wsl'\)/);
  assert.match(main, /usableCliResults\.find\([\s\S]*result\.data\.accountId !== primary\.accountId/);
  assert.match(main, /path\.join\(source\.home, '\.codex', 'sessions'\)/);
});

test('Codex CLI credits and banked resets render beside the CLI account in every wide mode', () => {
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(rendererDir, 'styles.css'), 'utf8');

  assert.match(app, /appendCodexCreditsRow\(data\.codex\?\.cli, 'codex_cli_row_credits', elements\.openaiCliRows/);
  assert.match(app, /appendCodexResetsRow\(data\.codex\?\.cli, 'codex_cli_row_resets', elements\.openaiCliRows/);
  assert.match(app, /cliCredits = hiddenRows\.codex_cli_row_credits \? null : creditInfo\(d\.cli\.credits\)/);
  assert.match(app, /cliResets = hiddenRows\.codex_cli_row_resets \? null : resetInfo\(d\.cli\.resetCredits\)/);
  assert.match(app, /info\.kind === 'summary'[\s\S]*dual-special-value/);
  assert.match(css, /\.dual-pair\.special\s*\{[\s\S]*grid-template-columns: 1fr;/);
});

test('Gemini quota discovery uses the CLI account project and preserves fallback behavior', () => {
  const main = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');

  assert.match(main, /postGeminiCodeAssist\(token, 'loadCodeAssist',[\s\S]*pluginType: 'GEMINI'/);
  assert.match(main, /load\?\.cloudaicompanionProject[\s\S]*postGeminiCodeAssist\(token, 'retrieveUserQuota', project \? \{ project \} : \{\}\)/);
  assert.match(main, /return normalizeGeminiQuota\(quota\);/);
});

test('window presets remain user-sized and enforce the narrow-layout floor', () => {
  const main = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');

  assert.match(main, /const MIN_WIDGET_WIDTH = 290;/);
  assert.match(main, /minWidth: MIN_WIDGET_WIDTH/);
  assert.match(main, /setMinimumSize\(MIN_WIDGET_WIDTH,/);
  assert.match(main, /if \(_activeWindowPreset !== null\) return true;/);
  assert.match(main, /_activeWindowPreset = preset;[\s\S]*mainWindow\.setBounds\(\{ x, y, width, height \}\);/);
  assert.match(main, /preset === 'reset'[\s\S]*_activeWindowPreset = null;/);
});

test('hidden charts collapse preset height without surrendering manual resize', () => {
  const preload = fs.readFileSync(path.join(repoDir, 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(rendererDir, 'styles.css'), 'utf8');

  assert.match(app, /classList\.toggle\('graph-off', !_graphIsInline\(\)\)/);
  assert.match(app, /_forceFitHeight\(\{ fitPreset: true, intrinsic: true \}\)/);
  assert.match(css, /body\.landscape\.graph-off:not\(\.compact-mode\) \.content\s*\{[\s\S]*grid-template-rows: auto;/);
  assert.match(preload, /resizeWindow: \(height, force, fitPreset, userAction\)/);
  assert.match(main, /explicitPresetFit = fitPreset === true && _activeWindowPreset !== null/);
  // Direct user actions (graph toggle, burn, hide) may adopt the new content
  // height even in a hand-sized window; background refits never may.
  assert.match(main, /const explicitUserAction = userAction === true;/);
  assert.match(main, /if \(windowIsUserSized\(\) && !explicitPresetFit && !explicitUserAction\) return;/);
});

test('ultra-wide provider columns restore full dual-account rows', () => {
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(rendererDir, 'styles.css'), 'utf8');

  assert.match(app, /classList\.toggle\('dual-compact', landscape && eff < 450\)/);
  assert.match(css, /body\.landscape\.dual-compact \.section-body\.has-dual \.dual-table/);
  assert.doesNotMatch(css, /body\.landscape \.section-body\.has-dual \.dual-table/);
  assert.doesNotMatch(css, /body\.landscape #sgGoogleCli \.usage-label/);
  assert.match(css, /body\.landscape\.vh-short\.dual-compact \.dual-table > \.dual-head:nth-child\(2\)[\s\S]*display: none;/);
});

test('collapsed landscape CLI groups become terminal buttons and release preset-owned width', () => {
  const preload = fs.readFileSync(path.join(repoDir, 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(rendererDir, 'styles.css'), 'utf8');

  assert.match(preload, /fitLandscapeWidth: \(width\) => ipcRenderer\.send\('fit-landscape-width', Number\(width\) \|\| 0\)/);
  assert.match(main, /ipcMain\.on\('fit-landscape-width'[\s\S]*Math\.abs\(bounds\.width - _managedPresetWidth\) > PRESET_WIDTH_TOLERANCE[\s\S]*_managedPresetWidth = null/);
  // Collapsed columns get a fixed narrow width; the window shrinks to fit them
  assert.match(app, /function syncLandscapeCliWidth\(\)[\s\S]*COLLAPSED_COL_W[\s\S]*fitLandscapeWidth\(Math\.max\(786, target\)\)/);
  assert.match(app, /if \(!hidden\) \{[\s\S]*table\.classList\.remove\('hide-cli'\)[\s\S]*syncLandscapeCliWidth\(\)/);
  assert.match(css, /body\.landscape \.dual-table\.hide-cli \.dual-row,[\s\S]*grid-template-columns: minmax\(42px, 46px\) minmax\(0, 1fr\) 24px;/);
  assert.match(css, /\.dual-table\.hide-cli \.dual-pill::after\s*\{[\s\S]*content: '>_';/);
});

test('diagnostic launch avoids the Electron-reserved debug flag', () => {
  const source = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');
  assert.match(source, /process\.argv\.includes\('--burnwatch-debug'\)/);
  assert.doesNotMatch(source, /process\.argv\.includes\('--debug'\)/);
});

test('the session key never crosses into the renderer', () => {
  const preload = fs.readFileSync(path.join(repoDir, 'preload.js'), 'utf8');
  const main = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');
  // The old key-carrying IPC surface is gone; login state is all that crosses.
  assert.doesNotMatch(preload, /save-credentials|validate-session-key|detect-session-key/);
  assert.match(preload, /anthropicLogin: \(\) => ipcRenderer\.invoke\('anthropic-login'\)/);
  assert.match(main, /loggedIn: !!readStoredSessionKey\(\)/);
  // Diagnostics never print any part of the key or OAuth account identity.
  assert.doesNotMatch(main, /sessionKey\.substring/);
  assert.doesNotMatch(main, /Connected as`, tokens\.email/);
});

test('sort-by-usage is whitelisted on both sides and wired in the renderer', () => {
  const main = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  assert.match(main, /sortByUsage: store\.get\('settings\.sortByUsage', false\)/);
  assert.match(main, /store\.set\('settings\.sortByUsage', settings\.sortByUsage === true\)/);
  assert.match(app, /function _sortRowsByUsage\(\)/);
  assert.match(html, /id="sortByUsageToggle"/);
});

test('the compact chevron ghost is fully gone (markup, styles, wiring)', () => {
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(rendererDir, 'styles.css'), 'utf8');
  for (const source of [app, html, css]) {
    assert.doesNotMatch(source, /compact-(collapse|expand)-btn|compactCollapseBtn|compactExpandBtn/);
  }
});

test('burn-detector fire is wired end to end in the pool colour', () => {
  const main = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(rendererDir, 'styles.css'), 'utf8');
  // main tracks burning state with settle hysteresis and ships it in the snapshot
  assert.match(main, /function getBurningSeriesMap\(\)/);
  assert.match(main, /data\.burningSeries = getBurningSeriesMap\(\);/);
  assert.match(main, /BURN_SETTLE_MS/);
  // renderer maps series onto rows and tints the flame from the bar's colour
  assert.match(app, /function computeBurningRowKeys\(data\)/);
  assert.match(app, /_burningRowKeys = computeBurningRowKeys\(data\);/);
  assert.match(app, /--fire-col/);
  // CSS: heat underlay on full and compact bars, halo on the reset orbs,
  // and the live pixel-fire loop that actually burns them
  assert.match(css, /\.progress-fill\.on-fire,\s*\.compact-bar-fill\.on-fire/);
  assert.match(css, /\.reset-dot::after/);
  assert.match(css, /\.ambient-fire/);
  assert.match(app, /function _tickElementFire/);
  assert.match(app, /_spawnPixelFlame\(layer, _rnd\(0, width\), _rnd\(240, 460\), Math\.random\(\) < 0\.1, palette\)/);
  // Flame style: persisted on both sides, both engines present, and switched
  // by CLICKING a burning bar (not a Settings control)
  assert.match(main, /flameStyle: store\.get\('settings\.flameStyle', 'classic'\)/);
  assert.match(main, /settings\.flameStyle === 'particle' \? 'particle' : 'classic'/);
  assert.match(app, /function _spawnFireParticle/);
  assert.match(app, /_saveSettingsPatch\(\{ flameStyle: next \}\)/);
  const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /id="flameStyle"/);
});

test('settings window fits all content and restores the prior window', () => {
  const main = fs.readFileSync(path.join(repoDir, 'main.js'), 'utf8');
  const app = fs.readFileSync(path.join(rendererDir, 'app.js'), 'utf8');
  const preload = fs.readFileSync(path.join(repoDir, 'preload.js'), 'utf8');
  assert.match(main, /ipcMain\.on\('settings-fit'/);
  assert.match(main, /ipcMain\.on\('settings-restore'/);
  assert.match(main, /mainWindow\.setResizable\(false\)/);
  assert.match(preload, /settingsFit:/);
  assert.match(preload, /settingsRestore:/);
  assert.match(app, /function fitSettingsWindow/);
});

test('no-pizazz keeps functional spinners alive and reaches the detached graph', () => {
  const css = fs.readFileSync(path.join(rendererDir, 'styles.css'), 'utf8');
  const graphHtml = fs.readFileSync(path.join(rendererDir, 'graph.html'), 'utf8');
  const graphJs = fs.readFileSync(path.join(rendererDir, 'graph.js'), 'utf8');
  assert.match(css, /body\.no-pizazz \.spinner \{\s*animation: spin 1s linear infinite !important;/);
  assert.match(graphHtml, /body\.no-pizazz \*/);
  assert.match(graphJs, /classList\.toggle\('no-pizazz', pizazzOff\)/);
});
