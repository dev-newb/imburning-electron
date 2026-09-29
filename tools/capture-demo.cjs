// Run with Electron, not Node. Uses the production renderer with fictional data.
const { app, BrowserWindow, ipcMain, session } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = process.env.DEMO_RENDERER_ROOT || path.resolve(__dirname, '..');
const output = process.env.DEMO_OUTPUT || path.join(root, 'assets/screenshots');
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'imburning-demo-')));
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const now = Date.now(), hour = 3600000;
const iso = hours => new Date(now + hours * hour).toISOString();
const pool = (key, label, percent, hours, windowMinutes) => ({ key, label, percent, resetsAt: iso(hours), windowMinutes });
const account = (email, limits, available = 0) => ({ email, accountId: email, connected: true, source: 'live', observedAt: now, limits, resetCredits: { available }, credits: { balance: 1250, hasCredits: true, unlimited: false } });
const data = {
  observedAt: now, anthropic_email: 'alex@example.com', anthropic_source: 'web',
  five_hour: { utilization: 62, resets_at: iso(2.4) }, seven_day: { utilization: 43, resets_at: iso(96) },
  seven_day_sonnet: { utilization: 31, resets_at: iso(96) },
  extra_usage: { is_enabled: true, utilization: 24, used_credits: 1200, monthly_limit: 5000, balance_cents: 3800, currency: 'USD' },
  codex: account('alex@example.com', [pool('primary_seven_day', 'Codex (7d)', 100, 26, 10080), pool('secondary_five_hour', 'Spark (5h)', 34, 3.2, 300)], 3),
  gemini: account('alex@example.com', [pool('pro', 'Gemini Pro', 0, 12, 1440), pool('flash', 'Gemini Flash', 0, 12, 1440)]),
  burningSeries: { session: true, codexCli: true }, frozenProviders: { google: true },
  forecasts: { weekly: now + 150 * hour },
  sessionPlans: { anthropic: { text: 'Planner: your heaviest hours are 1pm–6pm — start a fresh session just before 1pm.' }, openai: { text: 'Planner: your heaviest hours here are 2pm–7pm (64% of burn).' }, google: { text: 'Planner: still learning this account’s rhythm — needs more usage history.' } }
};
data.codex.cli = account('jamie@example.com', [pool('primary_seven_day', 'Codex (7d)', 76, 148, 10080), pool('secondary_five_hour', 'Spark (5h)', 18, 2.8, 300)], 1);
data.codex.resetCredits.credits = [14 * 24, 72, 12].map(hours => ({ expiresAt: now + hours * hour }));
const history = Array.from({ length: 145 }, (_, i) => ({ timestamp: now - (144-i)*hour, session: (i*7)%90, weekly: Math.round(i/144*43), sonnet: Math.round(i/144*31), codex: Math.min(100, Math.round(i/110*100)), codexCli: Math.round(i/144*76), gemini: 0 }));
const settings = { theme: 'dark', warnThreshold: 75, dangerThreshold: 90, timeFormat: '12h', weeklyDateFormat: 'date', refreshInterval: '300', graphVisible: true, expandedOpen: true, openaiExtrasOpen: true, projectionsOn: true, pizazz: true, showCodex: true, showCodexCli: true, showGemini: true, showGeminiCli: true, showClaudeCode: true, alwaysOnTop: true, usageAlerts: false, burnAlerts: false, trayColors: {}, trayOutline: {}, fontColor: {}, webhook: {}, sounds: {}, hiddenProviders: {}, hiddenRows: {}, cliAdopted: { anthropic: true, openai: true, google: true } };
const credentials = { loggedIn: true, organizationId: 'demo', email: 'alex@example.com', encryptionAvailable: true, organizations: [{ id: 'demo', name: 'Demo workspace' }], providerFallbackAvailable: true };
const initialSettings = structuredClone(settings);
let win;
ipcMain.handle('demo', (_, name, value) => {
  if (name === 'getCredentials') return credentials;
  if (name === 'getSettings') return settings;
  if (name === 'saveSettings') { Object.assign(settings, value); return settings; }
  if (name === 'fetchUsageData' || name === 'getLatestUsage') return data;
  if (name === 'getUsageHistory') return history;
  if (name === 'getAppVersion') return '2.7.0';
  if (name === 'getWindowBounds') return win.getBounds();
  if (name === 'checkForUpdate') return { updateAvailable: false };
  if (name === 'alertSoundEvent') return { play: false };
  return false;
});
const pause = ms => new Promise(r => setTimeout(r, ms));
async function capture(name) { fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()); console.log('Captured', name); }
const evaluate = code => win.webContents.executeJavaScript(code);
async function layout(width, height) {
  win.setSize(width, height);
  await evaluate('_windowUserSized=innerWidth>innerHeight && innerWidth>=760; applySqueezeClasses(); if(latestUsageData) updateUI(latestUsageData); void 0');
  await pause(800);
}
async function clip(name, action, seconds = 5) {
  const dir = path.join(process.env.DEMO_FRAMES || path.join(os.tmpdir(), 'imburning-gallery-frames'), name);
  fs.mkdirSync(dir, { recursive: true });
  // Timed native captures retain alpha, unlike desktop screen recordings.
  const start = Date.now();
  let triggered = false;
  const frames = [];
  for (let i = 0; Date.now() - start < seconds * 1000; i++) {
    if (!triggered && Date.now() - start >= 750) { triggered = true; await evaluate(action + '; void 0'); }
    const bitmap = await win.webContents.capturePage();
    const at = Date.now();
    const size = win.getSize();
    const file = path.join(dir, String(i).padStart(4, '0') + '.png');
    fs.writeFileSync(file, bitmap.resize({ width: size[0] }).toPNG());
    frames.push({ file, at });
    await pause(Math.max(0, at + 50 - Date.now()));
  }
  fs.writeFileSync(path.join(dir, 'frames.txt'), frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i+1]?.at || Date.now())-f.at)/1000}\n`).join('') + `file '${frames.at(-1).file}'\n`);
  console.log('Recorded', name, Date.now() - start, 'ms');
}
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true });
  session.defaultSession.webRequest.onBeforeRequest((details, done) => done({ cancel: /^https?:/.test(details.url) }));
  win = new BrowserWindow({ width: 520, height: 1160, frame: false, transparent: true, backgroundColor: '#00000000', show: false, focusable: false, webPreferences: { offscreen: true, preload: path.join(__dirname, 'demo-preload.cjs'), backgroundThrottling: false } });
  win.webContents.on('console-message', (_, level, message) => { if (level >= 2) console.log('Renderer:', message); });
  await win.loadFile(path.join(root, 'src/renderer/index.html'));
  // Offscreen capture has no visible window; let production effects animate.
  await evaluate("Object.defineProperty(document, 'hidden', {get:()=>false}); Object.defineProperty(document, 'visibilityState', {get:()=> 'visible'}); void 0");
  await win.webContents.insertCSS('html, body, html:has(body.theme-light) { background: transparent !important; }');
  await pause(2000);
  await capture('main-portrait-dark');
  if (process.env.DEMO_PREVIEW) { app.quit(); return; }
  await capture('tall-preset-dark');
  await evaluate("applyTheme('light')"); await pause(500); await capture('main-portrait-light');
  await evaluate("applyTheme('dark')");
  await layout(1320, 720); await capture('wide-preset-dark');
  await evaluate('applyPizazz(false)'); await pause(700); await capture('pizazz-off-dark');
  await evaluate('applyPizazz(true); applyCompactMode(true)');
  await layout(360, 450); await capture('compact-dark');
  await evaluate("applyTheme('light')"); await pause(300); await capture('compact-light');
  await evaluate("applyTheme('dark'); applyCompactMode(false)");
  await layout(1184, 720);
  await evaluate("document.getElementById('settingsBtn').click()"); await pause(600); await capture('settings-top');
  await evaluate("elements.settingsOverlay.style.display='none'");
  // Start each effects scene from the default portrait, without inheriting
  // compact/settings state or the user-resize squeeze ladder.
  Object.assign(settings, structuredClone(initialSettings), { graphVisible: false, compactMode: false });
  win.setSize(520, 920);
  await win.loadFile(path.join(root, 'src/renderer/index.html'));
  await evaluate("Object.defineProperty(document, 'hidden', {get:()=>false}); Object.defineProperty(document, 'visibilityState', {get:()=> 'visible'}); void 0");
  await win.webContents.insertCSS('html, body, html:has(body.theme-light) { background: transparent !important; }');
  await pause(2000);
  const orbRect = await evaluate("JSON.stringify((()=>{const r=document.querySelector('[data-row-key=codex_row_resets]').getBoundingClientRect(); return {x:Math.floor(r.x),y:Math.floor(r.y-12),width:Math.ceil(r.width),height:Math.ceil(r.height+24)}})())");
  fs.writeFileSync(path.join(output, 'reset-orbs.png'), (await win.webContents.capturePage(JSON.parse(orbRect))).toPNG());
  await evaluate("graphVisible=false; elements.graphSection.style.display='none'; syncGraphLayoutState(); void 0");
  await clip('burning-classic', 'void 0', 5);
  await evaluate("window._cachedSettings.flameStyle='particle'");
  await clip('burning-inferno', 'void 0', 5);
  await evaluate("window._cachedSettings.flameStyle='classic'");
  await clip('hide-row-smoke', "document.querySelector('[data-row-key=seven_day_sonnet] .row-hide-btn').click()", 6);
  await clip('remove-company-explosion', "document.getElementById('tntAnthropic').click()", 5);
  console.log('Demo capture complete');
  app.quit();
}).catch(error => { console.error(error); app.exit(1); });
