const { app, BrowserWindow, ipcMain, Tray, Menu, session, shell, Notification, safeStorage, nativeImage } = require('electron');
const path = require('path');
const https = require('https');
const Store = require('electron-store');
const { fetchViaWindow, fetchMultipleViaWindow } = require('./src/fetch-via-window');

const GITHUB_OWNER = 'dev-newb';
const GITHUB_REPO = 'claude-usage-widget';

// Migration: Handle old encrypted config files from v1.7.0 and earlier
// Must happen BEFORE creating Store instance to prevent parse errors
const fs = require('fs');
const os = require('os');

// electron-store uses different paths per platform
let configPath;
if (process.platform === 'darwin') {
  configPath = path.join(os.homedir(), 'Library', 'Application Support', 'claude-usage-widget', 'config.json');
} else if (process.platform === 'win32') {
  configPath = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'claude-usage-widget', 'config.json');
} else {
  // Linux
  configPath = path.join(os.homedir(), '.config', 'claude-usage-widget', 'config.json');
}

try {
  if (fs.existsSync(configPath)) {
    const rawData = fs.readFileSync(configPath, 'utf-8');
    // Check if file looks encrypted (contains non-JSON garbage or doesn't start with {)
    if (rawData.includes('\u0000') || !rawData.trim().startsWith('{')) {
      console.log('[Migration] Detected old encrypted config from v1.7.0, deleting for fresh start');
      fs.unlinkSync(configPath);
    }
  }
} catch (err) {
  console.error('[Migration] Error checking config file:', err.message);
  // If we can't read it, try to delete it
  try {
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
  } catch {}
}

// Non-sensitive settings storage (no encryption needed)
const store = new Store();

// Debug mode: set DEBUG_LOG=1 env var or pass --debug flag to see verbose logs.
// Regular users will only see critical errors in the console.
const DEBUG = process.env.DEBUG_LOG === '1' || process.argv.includes('--debug');
function debugLog(...args) {
  if (DEBUG) console.log('[Debug]', ...args);
}

const CHROME_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

let mainWindow = null;
let sessionTray = null;  // Tray icon for Session usage
let weeklyTray = null;   // Tray icon for Weekly usage
let fableTray = null;    // Tray icon for the scoped weekly limit (e.g. Fable)

const WIDGET_WIDTH = process.platform === 'darwin' ? 590 : 560;
const WIDGET_HEIGHT = 155;
const HISTORY_RETENTION_DAYS = 8;
const CHART_DAYS = 7;
const MAX_HISTORY_SAMPLES = 10000; // Cap total samples to prevent unbounded growth

// Extract scoped weekly limits (e.g. Fable) from the `limits` array. The
// legacy seven_day_<model> fields arrive null for these models, so the
// array is the only source. Returns [{slug, name, percent, resetsAt}].
function getScopedWeeklyLimits(data) {
  const scoped = [];
  for (const limit of (data?.limits || [])) {
    if (limit.kind !== 'weekly_scoped' || limit.percent == null) continue;
    const name = String(limit.scope?.model?.display_name || limit.scope?.surface || 'Scoped');
    scoped.push({
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      name,
      percent: limit.percent,
      resetsAt: limit.resets_at,
      severity: limit.severity || null
    });
  }
  return scoped;
}

// ---- Claude Code (CLI) account usage ----
// Claude Code stores an OAuth token locally; api.anthropic.com's usage
// endpoint returns the same shape as the claude.ai one (limits[] included),
// so the widget can track the CLI account with no extra login.
function readClaudeCodeToken() {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    if (!fs.existsSync(credPath)) return null;
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    const oauth = creds.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    // Use the token only while it is fresh. Deliberately NO refresh-token flow:
    // consuming a (potentially rotating) refresh token here could invalidate
    // the CLI's own login. Claude Code refreshes this file whenever it runs.
    if (oauth.expiresAt && Date.now() >= oauth.expiresAt) {
      debugLog('[ClaudeCode] CLI token expired', new Date(oauth.expiresAt).toISOString(), '— skipping (runs of the claude CLI refresh it)');
      return null;
    }
    return oauth.accessToken;
  } catch (err) {
    debugLog('[ClaudeCode] Could not read CLI credentials:', err.message);
    return null;
  }
}

function fetchClaudeCodeUsage() {
  return new Promise((resolve) => {
    const token = readClaudeCodeToken();
    if (!token) return resolve(null);
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/api/oauth/usage',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Content-Type': 'application/json'
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          debugLog('[ClaudeCode] Usage fetch failed with status', res.statusCode);
          return resolve(null);
        }
        try { resolve(JSON.parse(body)); } catch { resolve(null); }
      });
    });
    req.on('error', (err) => {
      debugLog('[ClaudeCode] Usage fetch error:', err.message);
      resolve(null);
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// ---- CLI vs web account comparison (Anthropic) ----
// Same account ⇔ identical limit windows: the 5h and weekly reset timestamps
// are unique to an account down to the second, so both matching means the CLI
// login and the widget's claude.ai login share one limit pool and the CLI
// rows would be pure duplication. Mode changes are debounced over two
// consecutive fetches so a stale provider cache can't flap rows in and out.
let _ccSameState = { mode: null, candidate: null, streak: 0 };
function detectClaudeCliSameAccount(data) {
  const cc = data.claude_code;
  if (!cc) return _ccSameState.mode === true; // no CLI data — rows absent anyway
  const t = (iso) => iso ? new Date(iso).getTime() : null;
  // The two endpoints stamp resets_at with sub-second jitter (computed at
  // response time), so compare with a small tolerance; different accounts'
  // windows differ by minutes to days.
  const close = (a, b) => a !== null && b !== null && Math.abs(a - b) < 5000;
  const fiveMatch = close(t(cc.five_hour?.resets_at), t(data.five_hour?.resets_at));
  const weekMatch = close(t(cc.seven_day?.resets_at), t(data.seven_day?.resets_at));
  const observed = fiveMatch && weekMatch;

  if (_ccSameState.mode === null) {
    _ccSameState.mode = observed;
  } else if (observed === _ccSameState.mode) {
    _ccSameState.candidate = null;
    _ccSameState.streak = 0;
  } else if (_ccSameState.candidate === observed) {
    if (++_ccSameState.streak >= 2) {
      _ccSameState.mode = observed;
      _ccSameState.candidate = null;
      _ccSameState.streak = 0;
    }
  } else {
    _ccSameState.candidate = observed;
    _ccSameState.streak = 1;
  }
  return _ccSameState.mode;
}

// ---- Codex (OpenAI) account usage ----
// Reads the Codex CLI's local OAuth token (~/.codex/auth.json) and queries the
// same usage endpoint the CLI polls. The stored access token is used as-is —
// never refreshed here — and when it has expired we fall back to the newest
// rate-limit snapshot embedded in the CLI's own session logs.
function readCodexAuth() {
  try {
    const p = path.join(os.homedir(), '.codex', 'auth.json');
    if (!fs.existsSync(p)) return null;
    const auth = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const accessToken = auth.tokens?.access_token;
    if (!accessToken) return null;
    try {
      const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString());
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        debugLog('[Codex] Access token expired — will use session snapshot');
        return null;
      }
    } catch {}
    return { accessToken, accountId: auth.tokens?.account_id || null };
  } catch (err) {
    debugLog('[Codex] Could not read auth.json:', err.message);
    return null;
  }
}

function codexWindowLabel(windowSeconds) {
  if (windowSeconds == null) return 'Codex';
  const hours = Math.round(windowSeconds / 3600);
  if (hours >= 24 * 6) return 'Codex Weekly (7d)';
  if (hours <= 6) return `Codex ${hours}h`;
  return `Codex ${hours}h`;
}

function codexWindowKey(windowSeconds, prefix) {
  const hours = windowSeconds != null ? Math.round(windowSeconds / 3600) : 0;
  return hours >= 24 * 6 ? `${prefix}_seven_day` : `${prefix}_five_hour`;
}

// Normalize the live /backend-api/wham/usage response into rows
function normalizeCodexLive(json) {
  const limits = [];
  const pw = json?.rate_limit?.primary_window;
  if (pw && pw.used_percent != null) {
    limits.push({
      key: codexWindowKey(pw.limit_window_seconds, 'primary'),
      label: codexWindowLabel(pw.limit_window_seconds),
      percent: pw.used_percent,
      resetsAt: pw.reset_at ? new Date(pw.reset_at * 1000).toISOString() : null
    });
  }
  const sw = json?.rate_limit?.secondary_window;
  if (sw && sw.used_percent != null) {
    limits.push({
      key: codexWindowKey(sw.limit_window_seconds, 'secondary'),
      label: codexWindowLabel(sw.limit_window_seconds),
      percent: sw.used_percent,
      resetsAt: sw.reset_at ? new Date(sw.reset_at * 1000).toISOString() : null
    });
  }
  for (const extra of (json?.additional_rate_limits || [])) {
    const w = extra?.rate_limit?.primary_window;
    if (!w || w.used_percent == null || w.used_percent <= 0) continue; // skip untouched sub-limits
    const name = String(extra.limit_name || 'Extra').replace(/^gpt-[\d.]+-codex-/i, '');
    limits.push({
      key: 'extra_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_seven_day',
      label: `Codex ${name} (7d)`,
      percent: w.used_percent,
      resetsAt: w.reset_at ? new Date(w.reset_at * 1000).toISOString() : null
    });
  }
  if (!limits.length) return null;
  const credits = json?.credits
    ? { balance: json.credits.balance ?? null, hasCredits: !!json.credits.has_credits, unlimited: !!json.credits.unlimited }
    : null;
  // OpenAI's weekly-limit reset feature: banked resets that can be spent to
  // clear a hit limit early (applicable_available_count = usable right now)
  const resetCredits = json?.rate_limit_reset_credits
    ? { available: json.rate_limit_reset_credits.available_count ?? 0, applicable: json.rate_limit_reset_credits.applicable_available_count ?? 0 }
    : null;
  return { source: 'live', limits, credits, resetCredits };
}

function fetchCodexUsageLive() {
  return new Promise((resolve) => {
    const auth = readCodexAuth();
    if (!auth) return resolve(null);
    const req = https.request({
      hostname: 'chatgpt.com',
      path: '/backend-api/wham/usage',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${auth.accessToken}`,
        ...(auth.accountId ? { 'chatgpt-account-id': auth.accountId } : {}),
        'User-Agent': CHROME_USER_AGENT
      },
      timeout: 10000
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          debugLog('[Codex] Live usage fetch failed with status', res.statusCode);
          return resolve(null);
        }
        try { resolve(normalizeCodexLive(JSON.parse(body))); } catch { resolve(null); }
      });
    });
    req.on('error', (err) => { debugLog('[Codex] Live usage error:', err.message); resolve(null); });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// Fallback: newest rate_limits snapshot from the Codex CLI's session logs
const CODEX_SNAPSHOT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
function readCodexSessionSnapshot() {
  try {
    const root = path.join(os.homedir(), '.codex', 'sessions');
    if (!fs.existsSync(root)) return null;
    let dir = root;
    for (let depth = 0; depth < 3; depth++) {
      const subs = fs.readdirSync(dir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^\d+$/.test(d.name))
        .map((d) => d.name)
        .sort((a, b) => Number(b) - Number(a));
      if (!subs.length) break;
      dir = path.join(dir, subs[0]);
    }
    const files = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.jsonl'))
      .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (!files.length) return null;
    const filePath = path.join(dir, files[0].f);
    if (Date.now() - files[0].m > CODEX_SNAPSHOT_MAX_AGE_MS) return null;

    const size = fs.statSync(filePath).size;
    const fd = fs.openSync(filePath, 'r');
    const readLen = Math.min(size, 262144);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, size - readLen);
    fs.closeSync(fd);

    const lines = buf.toString('utf-8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"rate_limits"')) continue;
      try {
        const event = JSON.parse(lines[i]);
        const rl = event.payload?.rate_limits || event.rate_limits;
        if (!rl) continue;
        const limits = [];
        for (const [prefix, w] of [['primary', rl.primary], ['secondary', rl.secondary]]) {
          if (!w || w.used_percent == null) continue;
          const windowSeconds = w.window_minutes != null ? w.window_minutes * 60 : null;
          limits.push({
            key: codexWindowKey(windowSeconds, prefix),
            label: codexWindowLabel(windowSeconds),
            percent: w.used_percent,
            resetsAt: w.resets_at ? new Date(w.resets_at * 1000).toISOString() : null
          });
        }
        if (limits.length) return { source: 'session', asOf: event.timestamp || null, limits };
      } catch {}
    }
    return null;
  } catch (err) {
    debugLog('[Codex] Session snapshot read failed:', err.message);
    return null;
  }
}

async function fetchCodexUsage() {
  return (await fetchCodexUsageLive()) || readCodexSessionSnapshot();
}

// ---- Gemini (Google) account usage ----
// The gemini CLI's backend exposes per-model daily quota buckets. Auth uses
// the CLI's own local OAuth credentials; Google refresh tokens do not rotate,
// so minting an access token here (exactly what the CLI does) cannot break
// the CLI's login. Nothing is written back to oauth_creds.json.
// The CLI's OAuth client id/secret are public constants shipped inside its
// npm bundle — read them from the local install rather than embedding them
// (matches whatever client the installed CLI actually uses).
let _geminiClient = null; // { id, secret } after discovery, false when unavailable
function getGeminiOAuthClient() {
  if (_geminiClient !== null) return _geminiClient || null;
  const npmPrefixes = [
    process.env.APPDATA ? path.join(process.env.APPDATA, 'npm', 'node_modules') : null,
    '/usr/local/lib/node_modules',
    '/usr/lib/node_modules',
    path.join(os.homedir(), '.npm-global', 'lib', 'node_modules'),
    path.join(os.homedir(), '.nvm', 'versions')
  ].filter(Boolean);
  for (const prefix of npmPrefixes) {
    const root = path.join(prefix, '@google', 'gemini-cli');
    try {
      if (!fs.existsSync(root)) continue;
      const stack = [root];
      while (stack.length) {
        const dir = stack.pop();
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const p = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'node_modules') stack.push(p);
            continue;
          }
          if (!entry.name.endsWith('.js') || fs.statSync(p).size > 30e6) continue;
          const text = fs.readFileSync(p, 'utf-8');
          const m = /([0-9]{10,}-[a-z0-9]+\.apps\.googleusercontent\.com)[\s\S]{0,300}?(GOCSPX-[A-Za-z0-9_-]+)/.exec(text);
          if (m) {
            _geminiClient = { id: m[1], secret: m[2] };
            debugLog('[Gemini] OAuth client discovered from local CLI install');
            return _geminiClient;
          }
        }
      }
    } catch (err) {
      debugLog('[Gemini] CLI install scan failed:', err.message);
    }
  }
  _geminiClient = false;
  debugLog('[Gemini] gemini-cli install not found — Gemini rows unavailable');
  return null;
}
let _geminiAccessToken = { token: null, expiresAt: 0 };

function getGeminiAccessToken() {
  return new Promise((resolve) => {
    try {
      const credPath = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
      if (!fs.existsSync(credPath)) return resolve(null);
      const creds = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
      if (creds.access_token && creds.expiry_date && creds.expiry_date - Date.now() > 60000) {
        return resolve(creds.access_token);
      }
      if (_geminiAccessToken.token && Date.now() < _geminiAccessToken.expiresAt - 60000) {
        return resolve(_geminiAccessToken.token);
      }
      if (!creds.refresh_token) return resolve(null);
      const client = getGeminiOAuthClient();
      if (!client) return resolve(null);
      const body = new URLSearchParams({
        client_id: client.id,
        client_secret: client.secret,
        refresh_token: creds.refresh_token,
        grant_type: 'refresh_token'
      }).toString();
      const req = https.request({
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (!json.access_token) {
              debugLog('[Gemini] Token refresh failed:', res.statusCode);
              return resolve(null);
            }
            _geminiAccessToken = { token: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 };
            resolve(json.access_token);
          } catch { resolve(null); }
        });
      });
      req.on('error', (err) => { debugLog('[Gemini] Token refresh error:', err.message); resolve(null); });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end(body);
    } catch (err) {
      debugLog('[Gemini] Could not read oauth_creds.json:', err.message);
      resolve(null);
    }
  });
}

// Group per-model buckets into Pro / Flash family rows (worst bucket wins)
function normalizeGeminiQuota(json) {
  const buckets = json?.buckets || [];
  const families = { pro: null, flash: null };
  for (const b of buckets) {
    if (b.remainingFraction == null || !b.modelId) continue;
    const family = /pro/i.test(b.modelId) ? 'pro' : /flash/i.test(b.modelId) ? 'flash' : null;
    if (!family) continue;
    if (!families[family] || b.remainingFraction < families[family].remainingFraction) {
      families[family] = b;
    }
  }
  const limits = [];
  for (const [family, bucket] of Object.entries(families)) {
    if (!bucket) continue;
    limits.push({
      key: `${family}_daily`,
      label: `Gemini ${family.charAt(0).toUpperCase() + family.slice(1)} (daily)`,
      percent: Math.round((1 - bucket.remainingFraction) * 1000) / 10,
      resetsAt: bucket.resetTime || null
    });
  }
  return limits.length ? { source: 'live', limits } : null;
}

function fetchGeminiUsage() {
  return getGeminiAccessToken().then((token) => {
    if (!token) return null;
    return new Promise((resolve) => {
      const body = JSON.stringify({});
      const req = https.request({
        hostname: 'cloudcode-pa.googleapis.com',
        path: '/v1internal:retrieveUserQuota',
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            debugLog('[Gemini] Quota fetch failed with status', res.statusCode);
            return resolve(null);
          }
          try { resolve(normalizeGeminiQuota(JSON.parse(data))); } catch { resolve(null); }
        });
      });
      req.on('error', (err) => { debugLog('[Gemini] Quota fetch error:', err.message); resolve(null); });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.end(body);
    });
  });
}

// The widget refreshes every 30s, but external provider endpoints rate-limit
// aggressive polling (429s) — cache each provider's result for 5 minutes.
const PROVIDER_CACHE_MS = 5 * 60 * 1000;
const _providerCache = {};
function cachedProviderFetch(key, fetchFn) {
  const entry = _providerCache[key];
  if (entry && Date.now() - entry.at < PROVIDER_CACHE_MS) return Promise.resolve(entry.data);
  return fetchFn().then((data) => {
    // Keep serving the previous good result through transient failures
    const previous = entry?.data || null;
    _providerCache[key] = { at: Date.now(), data: data || previous };
    return _providerCache[key].data;
  });
}

// ---- Alert webhook (phone-reaching alerts via ntfy or generic JSON POST) ----
function sendAlertWebhook(event, title, message) {
  const wh = store.get('settings.webhook', {});
  if (!wh.enabled || !wh.url) return;
  try {
    const target = new URL(wh.url);
    const isLocal = target.hostname === 'localhost' || target.hostname === '127.0.0.1';
    if (target.protocol !== 'https:' && !(target.protocol === 'http:' && isLocal)) return;
    const isNtfy = /ntfy/i.test(target.hostname);
    const body = isNtfy
      ? message
      : JSON.stringify({ event, title, message, timestamp: new Date().toISOString(), source: 'claude-usage-widget' });
    const mod = target.protocol === 'http:' ? require('http') : https;
    const req = mod.request({
      hostname: target.hostname,
      port: target.port || undefined,
      path: target.pathname + target.search,
      method: 'POST',
      headers: isNtfy
        ? { 'Content-Type': 'text/plain', 'Title': title, 'Tags': 'chart_with_upwards_trend' }
        : { 'Content-Type': 'application/json' },
      timeout: 10000
    }, (res) => { res.resume(); debugLog('[Webhook]', event, '→', res.statusCode); });
    req.on('error', (err) => debugLog('[Webhook] Failed:', err.message));
    req.on('timeout', () => req.destroy());
    req.end(body);
  } catch (err) {
    debugLog('[Webhook] Bad URL or send error:', err.message);
  }
}

ipcMain.on('alert-webhook', (event, { event: alertEvent, title, message }) => {
  sendAlertWebhook(alertEvent || 'alert', title || 'Claude Usage Widget', message || '');
});

// ---- Session-window planner ----
// Finds the heaviest 5-hour stretch of the day from a week of history for
// each provider. For Anthropic the hint includes aligning a fresh 5h session
// window; external providers get the plain heavy-hours pattern.
function fmtPlanHour(h, timeFormat) {
  h = ((h % 24) + 24) % 24;
  if (timeFormat === '24h') return `${String(h).padStart(2, '0')}:00`;
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 || 12;
  return `${h12}${ampm}`;
}

function computePlanFromSeries(history, pick, { minTotal, sessionAdvice }) {
  if (history.length < 100) return null;

  const hourly = new Array(24).fill(0);
  for (let i = 1; i < history.length; i++) {
    const dt = history[i].timestamp - history[i - 1].timestamp;
    if (dt <= 0 || dt > 3 * 60 * 1000) continue;
    const cur = pick(history[i]);
    const prev = pick(history[i - 1]);
    if (cur == null || prev == null) continue;
    const dv = cur - prev;
    if (dv <= 0) continue;
    hourly[new Date(history[i].timestamp).getHours()] += dv;
  }
  const total = hourly.reduce((a, b) => a + b, 0);
  if (total < minTotal) return null; // not enough burn to find a pattern

  let bestStart = 0;
  let bestSum = -1;
  for (let s = 0; s < 24; s++) {
    let sum = 0;
    for (let k = 0; k < 5; k++) sum += hourly[(s + k) % 24];
    if (sum > bestSum) { bestSum = sum; bestStart = s; }
  }
  if (bestSum < total * 0.35) return null; // usage too evenly spread — no useful peak

  const timeFormat = store.get('settings.timeFormat', '12h');
  const share = Math.round((bestSum / total) * 100);
  const range = `${fmtPlanHour(bestStart, timeFormat)}–${fmtPlanHour(bestStart + 5, timeFormat)}`;
  const text = sessionAdvice
    ? `Planner: your heaviest hours are ${range} (${share}% of burn) — start a fresh session just before ${fmtPlanHour(bestStart, timeFormat)} to cover them in one 5h window.`
    : `Planner: your heaviest hours here are ${range} (${share}% of burn).`;
  return { startHour: bestStart, text };
}

function computeSessionPlans() {
  const organizationId = store.get('organizationId');
  const historyKey = organizationId ? `usageHistory_${organizationId}` : 'usageHistory';
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const history = store.get(historyKey, []).filter((e) => e.timestamp > cutoff);
  return {
    anthropic: computePlanFromSeries(history, (e) => e.session, { minTotal: 20, sessionAdvice: true }),
    openai: computePlanFromSeries(history, (e) => e.codex, { minTotal: 10, sessionAdvice: false }),
    google: computePlanFromSeries(history, (e) => e.gemini, { minTotal: 10, sessionAdvice: false })
  };
}

// ---- Daily digest ----
function localDateString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function checkDailyDigest(data) {
  if (!store.get('settings.dailyDigest', true)) return;
  const now = new Date();
  if (now.getHours() < 9) return; // fire with the first refresh after 9am
  const today = localDateString(now);
  if (store.get('digest.lastShown') === today) return;

  const organizationId = store.get('organizationId');
  const historyKey = organizationId ? `usageHistory_${organizationId}` : 'usageHistory';
  const history = store.get(historyKey, []);
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yStart = dayStart - 24 * 60 * 60 * 1000;

  const burnOf = (pick) => {
    let burn = 0;
    for (let i = 1; i < history.length; i++) {
      if (history[i].timestamp < yStart || history[i].timestamp >= dayStart) continue;
      const dt = history[i].timestamp - history[i - 1].timestamp;
      if (dt <= 0 || dt > 3 * 60 * 1000) continue;
      const dv = (pick(history[i]) || 0) - (pick(history[i - 1]) || 0);
      if (dv > 0) burn += dv;
    }
    return Math.round(burn);
  };
  const weeklyBurn = burnOf((e) => e.weekly);
  const scopedSlugs = new Set();
  for (const e of history) for (const s of Object.keys(e.scoped || {})) scopedSlugs.add(s);
  const scopedParts = [...scopedSlugs].map((slug) => {
    const label = slug.charAt(0).toUpperCase() + slug.slice(1);
    return `${label} +${burnOf((e) => e.scoped?.[slug])} pts`;
  });

  const yesterday = localDateString(new Date(yStart));
  const anomalies = store.get(`burnAlerts_${yesterday}`, 0);

  const weeklyNow = Math.round(data.seven_day?.utilization || 0);
  let paceStr = '';
  if (data.seven_day?.resets_at) {
    const daysLeft = (new Date(data.seven_day.resets_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    if (daysLeft > 0.25) {
      paceStr = ` Stay under ~${Math.max(1, Math.floor((100 - weeklyNow) / daysLeft))} pts/day to reach the reset.`;
    }
  }

  const body = `Yesterday: Weekly +${weeklyBurn} pts${scopedParts.length ? ', ' + scopedParts.join(', ') : ''}`
    + `${anomalies ? `, ${anomalies} burn alert${anomalies > 1 ? 's' : ''}` : ''}. Weekly now ${weeklyNow}%.${paceStr}`;

  store.set('digest.lastShown', today);
  try {
    new Notification({ title: 'Daily usage digest', body }).show();
  } catch (err) {
    console.error('Digest notification failed:', err.message);
  }
  sendAlertWebhook('daily_digest', 'Daily usage digest', body);
}

// ---- Burn-rate forecast ----
// Least-squares slope over recent history → projected time of hitting 100%.
// Samples before the most recent value drop (a window reset) are discarded
// so a reset never poisons the slope.
const FORECAST_WINDOW_MS = 6 * 60 * 60 * 1000;
const FORECAST_MIN_SPAN_MS = 30 * 60 * 1000;
const FORECAST_MAX_HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

function forecastSeries(samples) {
  if (samples.length < 3) return null;
  let start = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i].v < samples[i - 1].v) start = i;
  }
  const win = samples.slice(start);
  if (win.length < 3) return null;
  const last = win[win.length - 1];
  if (last.v >= 100 || last.t - win[0].t < FORECAST_MIN_SPAN_MS) return null;

  const t0 = win[0].t;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const { t, v } of win) {
    const x = (t - t0) / 3600000; // hours
    sx += x; sy += v; sxx += x * x; sxy += x * v;
  }
  const n = win.length;
  const denom = n * sxx - sx * sx;
  if (!denom) return null;
  const slope = (n * sxy - sx * sy) / denom; // percent per hour
  if (slope < 0.1) return null; // flat or falling — no meaningful forecast

  const etaMs = last.t + ((100 - last.v) / slope) * 3600000;
  if (etaMs - Date.now() > FORECAST_MAX_HORIZON_MS) return null;
  return new Date(etaMs).toISOString();
}

// Projected 100% timestamps for weekly + each scoped series, from stored history
function computeForecasts() {
  const organizationId = store.get('organizationId');
  const historyKey = organizationId ? `usageHistory_${organizationId}` : 'usageHistory';
  const cutoff = Date.now() - FORECAST_WINDOW_MS;
  const recent = store.get(historyKey, []).filter((entry) => entry.timestamp > cutoff);

  const series = (pick) => recent
    .map((entry) => ({ t: entry.timestamp, v: pick(entry) }))
    .filter((sample) => sample.v != null);

  const forecasts = {
    weekly: forecastSeries(series((entry) => entry.weekly)),
    scoped: {}
  };
  const slugs = new Set();
  for (const entry of recent) {
    for (const slug of Object.keys(entry.scoped || {})) slugs.add(slug);
  }
  for (const slug of slugs) {
    forecasts.scoped[slug] = forecastSeries(series((entry) => entry.scoped?.[slug]));
  }
  return forecasts;
}

// ---- Burn-spike anomaly detection ----
// Learns the user's "normal" burn rate from history and alerts (with sound)
// when the recent window burns tokens far outside that pattern — catches
// unintended token sinks early. Baseline is robust (median + MAD of
// per-minute rates over the retention window), so occasional heavy sessions
// don't blind it, and window resets never poison it.
const BURN_WINDOW_MS = 10 * 60 * 1000;        // jump measured over this window
const BURN_MIN_WINDOW_MS = 4 * 60 * 1000;     // need at least this much data
const BURN_PAIR_MAX_GAP_MS = 3 * 60 * 1000;   // ignore pairs across app-closed gaps
const BURN_COOLDOWN_MS = 30 * 60 * 1000;      // one alert per series per half hour
const BURN_MIN_JUMP = 3;                      // pct points per window — absolute floor
const BURN_FALLBACK_JUMP = 8;                 // floor when too little baseline data
const BURN_MAD_K = 6;                         // sensitivity: median + K * MAD
const _burnAlertAt = {};                      // seriesKey -> last alert timestamp

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function checkBurnAnomalies() {
  if (!store.get('settings.burnAlerts', true)) return;

  const organizationId = store.get('organizationId');
  const historyKey = organizationId ? `usageHistory_${organizationId}` : 'usageHistory';
  const history = store.get(historyKey, []);
  if (history.length < 5) return;
  const now = history[history.length - 1].timestamp;

  const seriesList = [
    { key: 'session', label: 'Session', pick: (e) => e.session },
    { key: 'weekly', label: 'Weekly', pick: (e) => e.weekly }
  ];
  const slugs = new Set();
  for (const entry of history) {
    for (const slug of Object.keys(entry.scoped || {})) slugs.add(slug);
  }
  for (const slug of slugs) {
    const label = slug.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    seriesList.push({ key: `scoped_${slug}`, label: `${label} (weekly)`, pick: (e) => e.scoped?.[slug] });
  }

  for (const series of seriesList) {
    const samples = history
      .map((e) => ({ t: e.timestamp, v: series.pick(e) }))
      .filter((s) => s.v != null);
    if (samples.length < 5) continue;

    // Current jump: oldest in-window sample → newest
    const windowSamples = samples.filter((s) => s.t >= now - BURN_WINDOW_MS);
    if (windowSamples.length < 2) continue;
    const first = windowSamples[0];
    const last = windowSamples[windowSamples.length - 1];
    const spanMs = last.t - first.t;
    if (spanMs < BURN_MIN_WINDOW_MS) continue;
    const jump = last.v - first.v;
    if (jump < BURN_MIN_JUMP) continue; // negative = reset, small = normal

    // Baseline: per-minute rates from consecutive pairs OLDER than the window
    const rates = [];
    for (let i = 1; i < samples.length; i++) {
      const dt = samples[i].t - samples[i - 1].t;
      if (samples[i].t >= now - BURN_WINDOW_MS) break;
      if (dt <= 0 || dt > BURN_PAIR_MAX_GAP_MS) continue;
      const dv = samples[i].v - samples[i - 1].v;
      if (dv < 0) continue; // window reset
      rates.push(dv / (dt / 60000));
    }

    const jumpRate = jump / (spanMs / 60000);
    let isAnomaly;
    let typicalJump;
    if (rates.length >= 50) {
      const med = median(rates);
      const mad = median(rates.map((r) => Math.abs(r - med))) * 1.4826;
      const threshold = med + BURN_MAD_K * Math.max(mad, 0.01);
      isAnomaly = jumpRate > threshold;
      typicalJump = Math.round(med * (BURN_WINDOW_MS / 60000) * 10) / 10;
    } else {
      // Not enough learned baseline yet — use a conservative absolute floor
      isAnomaly = jump >= BURN_FALLBACK_JUMP;
      typicalJump = null;
    }
    if (!isAnomaly) continue;

    if (_burnAlertAt[series.key] && now - _burnAlertAt[series.key] < BURN_COOLDOWN_MS) continue;
    _burnAlertAt[series.key] = now;

    const minutes = Math.round(spanMs / 60000);
    const typicalStr = typicalJump != null ? ` (typical: ~${typicalJump}% per 10 min)` : '';
    const alertBody = `${series.label} jumped ${Math.round(jump)}% in ${minutes} min${typicalStr}. Something may be eating tokens.`;
    debugLog('[BurnAlert]', series.key, `+${jump}% in ${minutes}min`, 'rate', jumpRate.toFixed(2), '%/min');
    const dateKey = `burnAlerts_${localDateString(new Date())}`;
    store.set(dateKey, store.get(dateKey, 0) + 1);
    try {
      shell.beep();
      new Notification({
        title: 'Unusual token burn',
        body: alertBody
      }).show();
    } catch (err) {
      console.error('Burn alert notification failed:', err.message);
    }
    sendAlertWebhook('burn_spike', 'Unusual token burn', alertBody);
  }
}

function storeUsageHistory(data) {
  // Skip write if the session is invalid — a live session always has resets_at timestamps.
  // Absent timestamps mean the API returned empty/zeroed data (dead session, removed device, etc.)
  if (!data.five_hour?.resets_at && !data.seven_day?.resets_at) {
    debugLog('[History] Skipping write — no reset timestamps, likely invalid session data');
    return;
  }

  const organizationId = store.get('organizationId');
  const historyKey = organizationId ? `usageHistory_${organizationId}` : 'usageHistory';

  const timestamp = Date.now();
  let history = store.get(historyKey, []);

  // Record scoped weekly limits (e.g. Fable) under a slug keyed by display
  // name (same slug the renderer derives) so the chart can plot whatever
  // scopes the API sends without a per-model release.
  const scoped = {};
  for (const limit of getScopedWeeklyLimits(data)) {
    scoped[limit.slug] = limit.percent;
  }

  // External provider samples (single percent each) power their planner hints
  const codexPct = data.codex?.limits?.[0]?.percent;
  const geminiPct = (data.gemini?.limits || []).reduce(
    (worst, l) => (worst == null || l.percent > worst) ? l.percent : worst, null);

  history.push({
    timestamp,
    session: data.five_hour?.utilization || 0,
    weekly: data.seven_day?.utilization || 0,
    sonnet: data.seven_day_sonnet?.utilization || 0,
    opus: data.seven_day_opus?.utilization || 0,
    cowork: data.seven_day_cowork?.utilization || 0,
    design: data.seven_day_omelette?.utilization || 0,
    oauthApps: data.seven_day_oauth_apps?.utilization || 0,
    extraUsage: data.extra_usage?.utilization || 0,
    ...(Object.keys(scoped).length ? { scoped } : {}),
    ...(codexPct != null ? { codex: codexPct } : {}),
    ...(geminiPct != null ? { gemini: geminiPct } : {})
  });

  // Rotation: apply both time-based and count-based limits
  const cutoff = timestamp - (HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  history = history.filter((entry) => entry.timestamp > cutoff);

  if (history.length > MAX_HISTORY_SAMPLES) {
    history = history.slice(history.length - MAX_HISTORY_SAMPLES);
  }

  store.set(historyKey, history);
}

// Migrate legacy single-key history to the per-org namespaced key at startup,
// so get-usage-history reads from the right place before any fetch has run.
function migrateUsageHistoryKey() {
  const organizationId = store.get('organizationId');
  if (!organizationId) return;
  const historyKey = `usageHistory_${organizationId}`;
  if (store.has(historyKey)) return;
  const legacy = store.get('usageHistory', []);
  if (legacy.length > 0) {
    store.set(historyKey, legacy);
    store.delete('usageHistory');
    debugLog('[History] Migrated legacy usageHistory →', historyKey);
  }
}

// Prune all per-org history keys at startup. Trims entries older than the retention
// window and deletes the key entirely if nothing remains — cleans up abandoned accounts.
function pruneStaleHistoryKeys() {
  const cutoff = Date.now() - (HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const allKeys = Object.keys(store.store);
  for (const key of allKeys) {
    if (!key.startsWith('usageHistory_') && key !== 'usageHistory') continue;
    const history = store.get(key, []);
    const fresh = history.filter((entry) => entry.timestamp > cutoff);
    if (fresh.length === 0) {
      store.delete(key);
      debugLog('[History] Deleted stale key:', key);
    } else if (fresh.length < history.length) {
      store.set(key, fresh);
      debugLog('[History] Pruned', history.length - fresh.length, 'old entries from', key);
    }
  }
}

// Set session-level User-Agent to avoid Electron detection
app.on('ready', () => {
  session.defaultSession.setUserAgent(CHROME_USER_AGENT);
});

// Set sessionKey as a cookie in Electron's session
async function setSessionCookie(sessionKey) {
  await session.defaultSession.cookies.set({
    url: 'https://claude.ai',
    name: 'sessionKey',
    value: sessionKey,
    domain: '.claude.ai',
    path: '/',
    secure: true,
    httpOnly: true
  });
  debugLog('sessionKey cookie set in Electron session');
}

function createMainWindow() {
  const savedPosition = store.get('windowPosition');
  const windowOptions = {
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: false,
    icon: path.join(__dirname, process.platform === 'darwin' ? 'assets/icon.icns' : process.platform === 'linux' ? 'assets/logo.png' : 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  };

  if (savedPosition) {
    windowOptions.x = savedPosition.x;
    windowOptions.y = savedPosition.y;
  }

  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.loadFile('src/renderer/index.html');

  // Re-announce a downloaded update once the renderer is actually listening
  mainWindow.webContents.on('did-finish-load', sendUpdateReady);

  let positionSaveTimer = null;
  mainWindow.on('move', () => {
    if (positionSaveTimer) clearTimeout(positionSaveTimer);
    positionSaveTimer = setTimeout(() => {
      const position = mainWindow.getBounds();
      store.set('windowPosition', { x: position.x, y: position.y });
    }, 300);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

/**
 * Determine background color based on thresholds
 * @param {number} percent
 * @param {object} defaultColor - {r, g, b} used below the warn threshold
 */
function getBackgroundColor(percent, defaultColor, warnThreshold, dangerThreshold) {
  if (percent >= dangerThreshold) {
    // Red #ef4444
    return { r: 239, g: 68, b: 68 };
  } else if (percent >= warnThreshold) {
    // Amber/Orange #f59e0b
    return { r: 245, g: 158, b: 11 };
  }
  return defaultColor;
}

// ---- Tray icon colours (customizable in Settings) ----
const DEFAULT_TRAY_COLORS = {
  // Weekly (left) and Session (right) share the blue background; the number
  // colour tells them apart — white = Weekly, black = Session
  session: { bg: '#3b82f6', text: '#000000' },
  weekly:  { bg: '#3b82f6', text: '#ffffff' },
  fable:   { bg: '#ef4444', text: '#000000' }
};
const DEFAULT_TRAY_OUTLINE = { enabled: true, color: '#facc15' };

function hexToRgb(hex, fallback = { r: 0, g: 0, b: 0 }) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!match) return fallback;
  const n = parseInt(match[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

// Resolve saved tray colour settings (hex strings) into rgb objects
function getTrayColorSettings() {
  const savedColors = store.get('settings.trayColors', {});
  const savedOutline = store.get('settings.trayOutline', {});
  const resolve = (key) => ({
    bg: hexToRgb(savedColors[key]?.bg, hexToRgb(DEFAULT_TRAY_COLORS[key].bg)),
    text: { ...hexToRgb(savedColors[key]?.text, hexToRgb(DEFAULT_TRAY_COLORS[key].text)), a: 255 }
  });
  return {
    session: resolve('session'),
    weekly: resolve('weekly'),
    fable: resolve('fable'),
    outline: {
      enabled: savedOutline.enabled !== false,
      color: hexToRgb(savedOutline.color, hexToRgb(DEFAULT_TRAY_OUTLINE.color))
    }
  };
}

// API-reported severity ("normal" | "warning" | "critical") for a limits[] kind
function getLimitSeverity(data, kind) {
  const limit = (data?.limits || []).find((l) => l.kind === kind);
  return limit?.severity || null;
}

function isElevatedSeverity(severity) {
  return !!severity && severity !== 'normal';
}

// 2px border drawn inside the icon edge, used to flag API-critical limits
function drawIconOutline(buffer, width, height, color) {
  const T = 2;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x < T || y < T || x >= width - T || y >= height - T) {
        const offset = (y * width + x) * 4;
        buffer[offset] = color.b;
        buffer[offset + 1] = color.g;
        buffer[offset + 2] = color.r;
        buffer[offset + 3] = 255;
      }
    }
  }
}

/**
 * Bold 8x11 bitmap font for numbers 0-9 (2-pixel strokes for bold look)
 * Each number is represented as an array of 11 rows, each row is 8 bits
 */
const BITMAP_FONT = {
  '0': [
    0b00111100,
    0b01111110,
    0b11100111,
    0b11000011,
    0b11000011,
    0b11000011,
    0b11000011,
    0b11000011,
    0b11100111,
    0b01111110,
    0b00111100
  ],
  '1': [
    0b00011000,
    0b00111000,
    0b01111000,
    0b00011000,
    0b00011000,
    0b00011000,
    0b00011000,
    0b00011000,
    0b00011000,
    0b01111110,
    0b01111110
  ],
  '2': [
    0b00111100,
    0b01111110,
    0b11100111,
    0b00000011,
    0b00000110,
    0b00011100,
    0b00111000,
    0b01110000,
    0b11100000,
    0b11111111,
    0b11111111
  ],
  '3': [
    0b00111100,
    0b01111110,
    0b11100111,
    0b00000011,
    0b00000110,
    0b00111100,
    0b00000110,
    0b00000011,
    0b11100111,
    0b01111110,
    0b00111100
  ],
  '4': [
    0b00000110,
    0b00001110,
    0b00011110,
    0b00110110,
    0b01100110,
    0b11111111,
    0b11111111,
    0b00000110,
    0b00000110,
    0b00000110,
    0b00000110
  ],
  '5': [
    0b11111111,
    0b11111111,
    0b11000000,
    0b11000000,
    0b11111100,
    0b00000110,
    0b00000011,
    0b00000011,
    0b11100111,
    0b01111110,
    0b00111100
  ],
  '6': [
    0b00111100,
    0b01111110,
    0b11100000,
    0b11000000,
    0b11111100,
    0b11100110,
    0b11000011,
    0b11000011,
    0b11100111,
    0b01111110,
    0b00111100
  ],
  '7': [
    0b11111111,
    0b11111111,
    0b00000011,
    0b00000110,
    0b00001100,
    0b00011000,
    0b00110000,
    0b00110000,
    0b01100000,
    0b01100000,
    0b01100000
  ],
  '8': [
    0b00111100,
    0b01111110,
    0b11100111,
    0b11000011,
    0b01111110,
    0b00111100,
    0b01111110,
    0b11000011,
    0b11100111,
    0b01111110,
    0b00111100
  ],
  '9': [
    0b00111100,
    0b01111110,
    0b11100111,
    0b11000011,
    0b11000011,
    0b01111111,
    0b00111111,
    0b00000011,
    0b00000111,
    0b01111110,
    0b00111100
  ]
};

/**
 * Narrow 6x11 bitmap font for 3-digit numbers (100%)
 * Bold version to match
 */
const BITMAP_FONT_NARROW = {
  '0': [
    0b011110,
    0b111111,
    0b110011,
    0b110011,
    0b110011,
    0b110011,
    0b110011,
    0b110011,
    0b110011,
    0b111111,
    0b011110
  ],
  '1': [
    0b001100,
    0b011100,
    0b111100,
    0b001100,
    0b001100,
    0b001100,
    0b001100,
    0b001100,
    0b001100,
    0b111111,
    0b111111
  ]
};

/**
 * Draw a crisp bitmap character at position (x, y) in the buffer
 */
function drawChar(buffer, width, height, char, x, y, color, useNarrow = false) {
  const bitmap = useNarrow ? BITMAP_FONT_NARROW[char] : BITMAP_FONT[char];
  if (!bitmap) return useNarrow ? 6 : 8;
  
  const charWidth = useNarrow ? 6 : 8;
  const charHeight = 11;
  const maxCol = useNarrow ? 5 : 7;
  
  for (let row = 0; row < charHeight; row++) {
    for (let col = 0; col < charWidth; col++) {
      if (bitmap[row] & (1 << (maxCol - col))) {
        const px = x + col;
        const py = y + row;
        if (px >= 0 && px < width && py >= 0 && py < height) {
          const offset = (py * width + px) * 4;
          buffer[offset] = color.b;
          buffer[offset + 1] = color.g;
          buffer[offset + 2] = color.r;
          buffer[offset + 3] = color.a;
        }
      }
    }
  }
  return charWidth;
}

/**
 * Generate a single percentage badge icon with colored background and bitmap text
 * @param {number} percent - Usage percentage (0-100)
 * @param {object} bgColor - Background color {r, g, b}
 * @param {object} [textColor] - Text color {r, g, b, a}, defaults to white
 * @param {object|null} [outlineColor] - Border color {r, g, b} for critical limits
 * @returns {NativeImage} Generated tray icon
 */
function generatePercentageIcon(percent, bgColor, textColor = { r: 255, g: 255, b: 255, a: 255 }, outlineColor = null) {
  const width = 20;  // Back to 20x20
  const height = 20;
  const buffer = Buffer.alloc(width * height * 4);
  
  // Draw filled square background
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      buffer[offset] = bgColor.b;
      buffer[offset + 1] = bgColor.g;
      buffer[offset + 2] = bgColor.r;
      buffer[offset + 3] = 255;
    }
  }
  
  // Draw text (white unless a custom color was passed)
  const percentText = Math.round(percent).toString();

  // Use narrow font for 3-digit numbers (100%)
  const useNarrow = percentText.length >= 3;
  const charWidth = useNarrow ? 6 : 8;
  const charHeight = 11;
  const gap = percentText.length >= 3 ? 0 : 1; // 1px gap for 1-2 digits, no gap for 100
  const totalWidth = percentText.length * charWidth + (percentText.length - 1) * gap;
  let startX = Math.floor((width - totalWidth) / 2);
  const startY = Math.floor((height - charHeight) / 2);
  
  // Draw each digit
  for (let i = 0; i < percentText.length; i++) {
    drawChar(buffer, width, height, percentText[i], startX, startY, textColor, useNarrow);
    startX += charWidth + gap;
  }

  if (outlineColor) drawIconOutline(buffer, width, height, outlineColor);

  return nativeImage.createFromBuffer(buffer, { width, height });
}

/**
 * Generate an X icon for 99-100% usage (maxed out)
 * @param {object} [bgColor] - Background color {r, g, b}, defaults to #dc3545
 * @param {object} [xColor] - X color {r, g, b, a}, defaults to white
 * @param {object|null} [outlineColor] - Border color {r, g, b} for critical limits
 * @returns {NativeImage} Generated X tray icon
 */
function generateRedXIcon(bgColor = { r: 220, g: 53, b: 69 }, xColor = { r: 255, g: 255, b: 255, a: 255 }, outlineColor = null) {
  const width = 20;
  const height = 20;
  const buffer = Buffer.alloc(width * height * 4);

  // Filled background
  const red = bgColor;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      buffer[offset] = red.b;
      buffer[offset + 1] = red.g;
      buffer[offset + 2] = red.r;
      buffer[offset + 3] = 255;
    }
  }

  // Draw X (2 pixel thick lines)
  const white = xColor;
  
  // Diagonal line from top-left to bottom-right
  for (let i = 0; i < 11; i++) {
    const x1 = 5 + i;
    const y1 = 5 + i;
    // Draw 2x2 pixel for thickness
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const px = x1 + dx;
        const py = y1 + dy;
        if (px < width && py < height) {
          const offset = (py * width + px) * 4;
          buffer[offset] = white.b;
          buffer[offset + 1] = white.g;
          buffer[offset + 2] = white.r;
          buffer[offset + 3] = white.a;
        }
      }
    }
  }
  
  // Diagonal line from top-right to bottom-left
  for (let i = 0; i < 11; i++) {
    const x1 = 15 - i;
    const y1 = 5 + i;
    // Draw 2x2 pixel for thickness
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const px = x1 + dx;
        const py = y1 + dy;
        if (px < width && py < height) {
          const offset = (py * width + px) * 4;
          buffer[offset] = white.b;
          buffer[offset + 1] = white.g;
          buffer[offset + 2] = white.r;
          buffer[offset + 3] = white.a;
        }
      }
    }
  }

  if (outlineColor) drawIconOutline(buffer, width, height, outlineColor);

  return nativeImage.createFromBuffer(buffer, { width, height });
}



/**
 * Show the main window without the double-blink artifact on Windows.
 *
 * On Windows, transparent + alwaysOnTop + frameless windows re-enter the DWM
 * compositing pipeline in two steps when shown after hide(): an initial layered
 * window render (blink 1) followed by the alwaysOnTop z-order re-assertion
 * (blink 2). Setting opacity to 0 before show() masks those intermediate states;
 * the window is made opaque again after the DWM has had time to settle (~3 frames).
 * macOS and Linux do not have this issue so they just call show() directly.
 */
function showMainWindowClean() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function trayStaticIconPath() {
  return path.join(__dirname, process.platform === 'darwin' ? 'assets/tray-icon-mac.png' : process.platform === 'linux' ? 'assets/tray-icon-linux.png' : 'assets/tray-icon.png');
}

// Show/hide the widget when a stats tray icon is left-clicked
function attachTrayToggleClick(tray) {
  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
        mainWindow.hide();
      } else {
        showMainWindowClean();
      }
    }
  });
}

function buildTrayContextMenu() {
  return Menu.buildFromTemplate([
      {
        label: 'Show Widget',
        click: () => {
          if (mainWindow) {
            showMainWindowClean();
          } else {
            createMainWindow();
          }
        }
      },
      {
        label: 'Refresh',
        click: () => {
          if (mainWindow) {
            mainWindow.webContents.send('refresh-usage');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Log Out',
        click: async () => {
          store.delete('sessionKey');
          store.delete('organizationId');
          // Clear all Claude.ai cookies and session storage
          const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
          for (const cookie of cookies) {
            await session.defaultSession.cookies.remove('https://claude.ai', cookie.name);
          }
          await session.defaultSession.clearStorageData({
            storages: ['localstorage', 'sessionstorage', 'cachestorage'],
            origin: 'https://claude.ai'
          });
          if (mainWindow) {
            mainWindow.webContents.send('session-expired');
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          app.quit();
        }
      }
  ]);
}

function createTray() {
  // Respect the tray stats setting even when createTray is called from generic refresh paths.
  if (!store.get('settings.showTrayStats', false)) {
    destroyTrayIcons();
    return;
  }

  // Rebuild from a clean state if only one of the two stats tray icons survived.
  const hasSessionTray = sessionTray && !sessionTray.isDestroyed();
  const hasWeeklyTray = weeklyTray && !weeklyTray.isDestroyed();
  if (hasSessionTray && hasWeeklyTray) return;
  if (hasSessionTray || hasWeeklyTray) destroyTrayIcons();

  try {
    const staticIconPath = trayStaticIconPath();

    // Create Weekly tray icon FIRST (left position, blue)
    weeklyTray = new Tray(staticIconPath);
    weeklyTray.setToolTip('Weekly Usage');

    // Create Session tray icon SECOND (right position, purple)
    sessionTray = new Tray(staticIconPath);
    sessionTray.setToolTip('Session Usage');

    const contextMenu = buildTrayContextMenu();
    sessionTray.setContextMenu(contextMenu);
    weeklyTray.setContextMenu(contextMenu);

    attachTrayToggleClick(weeklyTray);
    attachTrayToggleClick(sessionTray);
  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}

/**
 * Create/update or destroy the scoped-weekly (Fable) tray icon.
 * Red background with a black number, unlike the threshold-coloured
 * session/weekly icons. Exists only while tray stats are enabled AND the
 * API reports a scoped weekly limit.
 * @param {object|null} scopedLimit - {name, percent, resetsAt} or null
 * @param {string|null} [forecastAt] - projected 100% ISO timestamp, if any
 */
function syncFableTray(scopedLimit, forecastAt = null) {
  if (!scopedLimit || !store.get('settings.showTrayStats', false)) {
    if (fableTray && !fableTray.isDestroyed()) {
      try {
        fableTray.removeAllListeners();
        fableTray.setContextMenu(null);
        fableTray.setToolTip('');
        if (process.platform === 'linux') fableTray.setImage(nativeImage.createEmpty());
        fableTray.destroy();
      } catch (_) {}
    }
    fableTray = null;
    return;
  }

  try {
    if (!fableTray || fableTray.isDestroyed()) {
      fableTray = new Tray(trayStaticIconPath());
      fableTray.setContextMenu(buildTrayContextMenu());
      attachTrayToggleClick(fableTray);
    }

    const colors = getTrayColorSettings();
    const outline = colors.outline.enabled && isElevatedSeverity(scopedLimit.severity)
      ? colors.outline.color
      : null;
    // X on the badge when maxed out, otherwise the number
    fableTray.setImage(scopedLimit.percent >= 99
      ? generateRedXIcon(colors.fable.bg, colors.fable.text, outline)
      : generatePercentageIcon(scopedLimit.percent, colors.fable.bg, colors.fable.text, outline));

    const timeFormat = store.get('settings.timeFormat', '12h');
    let tooltip = `${scopedLimit.name} (weekly): ${Math.round(scopedLimit.percent)}%`;
    const resetTime = formatResetTime(scopedLimit.resetsAt, timeFormat, true);
    if (resetTime) {
      tooltip += `\nResets: ${resetTime}`;
    }
    const forecastTime = formatResetTime(forecastAt, timeFormat, true);
    if (forecastTime && scopedLimit.percent < 99) {
      tooltip += `\nAt current pace, 100% by ${forecastTime}`;
    }
    fableTray.setToolTip(tooltip);
    debugLog('[Tray] Scoped tray updated:', scopedLimit.name, scopedLimit.percent + '%');
  } catch (error) {
    console.error('Failed to update Fable tray icon:', error);
  }
}

function destroyTrayIcons() {
  // Centralized tray cleanup keeps Linux appindicator hosts from showing stale icons.
  const trays = [sessionTray, weeklyTray, fableTray, _providerTrays.codex, _providerTrays.gemini];
  sessionTray = null;
  weeklyTray = null;
  fableTray = null;
  _providerTrays.codex = null;
  _providerTrays.gemini = null;

  for (const tray of trays) {
    if (!tray || tray.isDestroyed()) continue;

    try {
      tray.removeAllListeners();
      tray.setContextMenu(null);
      tray.setToolTip('');

      // On Linux, some appindicator hosts repaint stale tray entries lazily.
      // Clearing the image before destroy gives the host an explicit update.
      if (process.platform === 'linux') {
        tray.setImage(nativeImage.createEmpty());
      }
    } catch (error) {
      console.error('Failed to clear tray icon:', error);
    }

    try {
      tray.destroy();
    } catch (error) {
      console.error('Failed to destroy tray icon:', error);
    }
  }
}

/**
 * Format reset time for tray tooltip
 * @param {string} resetsAt - ISO timestamp string
 * @param {string} timeFormat - '12h' or '24h'
 * @param {boolean} includeDate - Whether to include the date (for weekly resets)
 * @returns {string} Formatted time string
 */
function formatResetTime(resetsAt, timeFormat, includeDate = false) {
  if (!resetsAt) return null;
  const date = new Date(resetsAt);
  
  const formatTime = () => {
    if (timeFormat === '24h') {
      return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    } else {
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${hours}:${minutes} ${ampm}`;
    }
  };
  
  if (includeDate) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthStr = months[date.getMonth()];
    const dayNum = date.getDate();
    return `${monthStr} ${dayNum}, ${formatTime()}`;
  } else {
    return formatTime();
  }
}

// ---- External provider tray icons (OpenAI / Google sections) ----
// Independent of the Anthropic tray setting: each provider section's
// checkbox controls its own badge.
const _providerTrays = { codex: null, gemini: null };

function syncProviderTray(name, enabled, badge) {
  let tray = _providerTrays[name];
  if (!enabled || !badge) {
    if (tray && !tray.isDestroyed()) {
      try {
        tray.removeAllListeners();
        tray.setContextMenu(null);
        tray.setToolTip('');
        if (process.platform === 'linux') tray.setImage(nativeImage.createEmpty());
        tray.destroy();
      } catch (_) {}
    }
    _providerTrays[name] = null;
    return;
  }

  try {
    if (!tray || tray.isDestroyed()) {
      tray = new Tray(trayStaticIconPath());
      tray.setContextMenu(buildTrayContextMenu());
      attachTrayToggleClick(tray);
      _providerTrays[name] = tray;
    }
    const dangerThreshold = store.get('settings.dangerThreshold', 90);
    const colors = getTrayColorSettings();
    const outline = colors.outline.enabled && badge.percent >= dangerThreshold
      ? colors.outline.color : null;
    tray.setImage(badge.percent >= 99
      ? generateRedXIcon(badge.bg, badge.text, outline)
      : generatePercentageIcon(badge.percent, badge.bg, badge.text, outline));
    const timeFormat = store.get('settings.timeFormat', '12h');
    let tooltip = `${badge.label}: ${Math.round(badge.percent)}%`;
    const resetTime = formatResetTime(badge.resetsAt, timeFormat, true);
    if (resetTime) tooltip += `\nResets: ${resetTime}`;
    tray.setToolTip(tooltip);
  } catch (error) {
    console.error(`Failed to update ${name} tray icon:`, error);
  }
}

function syncExternalProviderTrays(usageData) {
  const codexLimit = usageData?.codex?.limits?.[0] || null;
  syncProviderTray('codex', store.get('settings.trayOpenai', false), codexLimit && {
    percent: codexLimit.percent,
    label: codexLimit.label,
    resetsAt: codexLimit.resetsAt,
    bg: { r: 16, g: 163, b: 127 },                 // OpenAI teal
    text: { r: 255, g: 255, b: 255, a: 255 }
  });

  const geminiLimits = usageData?.gemini?.limits || [];
  const worstGemini = geminiLimits.reduce((worst, l) => (!worst || l.percent > worst.percent) ? l : worst, null);
  syncProviderTray('gemini', store.get('settings.trayGoogle', false), worstGemini && {
    percent: worstGemini.percent,
    label: worstGemini.label,
    resetsAt: worstGemini.resetsAt,
    bg: { r: 244, g: 180, b: 0 },                  // Google yellow
    text: { r: 0, g: 0, b: 0, a: 255 }
  });
}

/**
 * Update tray icons with current usage data
 * @param {Object} usageData - Usage data object containing session and weekly percentages
 */
function updateTrayIcon(usageData) {
  // Provider badges are governed by their own section checkboxes,
  // independent of the Anthropic tray setting below
  syncExternalProviderTrays(usageData);

  const showTrayStats = store.get('settings.showTrayStats', false);
  
  if (!showTrayStats) {
    // Destroy only weeklyTray (and the scoped/Fable tray), keeping sessionTray
    // alive as a persistent restore icon. Without it, hide() on Windows leaves
    // no way to restore the window.
    // Apply the same Linux appindicator cleanup that destroyTrayIcons() uses.
    if (weeklyTray && !weeklyTray.isDestroyed()) {
      try {
        weeklyTray.removeAllListeners();
        weeklyTray.setContextMenu(null);
        weeklyTray.setToolTip('');
        if (process.platform === 'linux') weeklyTray.setImage(nativeImage.createEmpty());
        weeklyTray.destroy();
      } catch (_) {}
      weeklyTray = null;
    }
    syncFableTray(null);
    return;
  }

  // Recreate tray icons if they were destroyed
  if (!sessionTray || sessionTray.isDestroyed() || !weeklyTray || weeklyTray.isDestroyed()) {
    createTray();
  }

  // Scoped weekly tray (e.g. Fable): shown while the API reports one
  const scopedLimit = getScopedWeeklyLimits(usageData)[0] || null;
  syncFableTray(scopedLimit, scopedLimit ? usageData?.forecasts?.scoped?.[scopedLimit.slug] : null);

  if ((!sessionTray || sessionTray.isDestroyed()) && (!weeklyTray || weeklyTray.isDestroyed())) return;

  // Get threshold settings and time format
  const warnThreshold = store.get('settings.warnThreshold', 75);
  const dangerThreshold = store.get('settings.dangerThreshold', 90);
  const timeFormat = store.get('settings.timeFormat', '12h');
  const colors = getTrayColorSettings();

  // Outline flags API-elevated severity when enabled in settings
  const outlineFor = (severity) =>
    colors.outline.enabled && isElevatedSeverity(severity) ? colors.outline.color : null;

  // Extract percentages and reset times from usage data
  const sessionPercent = usageData?.five_hour?.utilization || 0;
  const sessionResetsAt = usageData?.five_hour?.resets_at;
  const weeklyPercent = usageData?.seven_day?.utilization || 0;
  const weeklyResetsAt = usageData?.seven_day?.resets_at;
  const sessionOutline = outlineFor(getLimitSeverity(usageData, 'session'));
  const weeklyOutline = outlineFor(getLimitSeverity(usageData, 'weekly_all'));

  try {
    // Generate Weekly icon (blue background) - LEFT position
    let weeklyIcon;
    if (weeklyPercent >= 99) {
      weeklyIcon = generateRedXIcon(undefined, undefined, weeklyOutline);
    } else {
      const weeklyColor = getBackgroundColor(weeklyPercent, colors.weekly.bg, warnThreshold, dangerThreshold);
      weeklyIcon = generatePercentageIcon(weeklyPercent, weeklyColor, colors.weekly.text, weeklyOutline);
    }
    if (weeklyTray && !weeklyTray.isDestroyed()) {
      weeklyTray.setImage(weeklyIcon);
      let weeklyTooltip = `Weekly: ${Math.round(weeklyPercent)}%`;
      const weeklyResetTime = formatResetTime(weeklyResetsAt, timeFormat, true);
      if (weeklyResetTime) {
        weeklyTooltip += `\nResets: ${weeklyResetTime}`;
      }
      const weeklyForecastTime = formatResetTime(usageData?.forecasts?.weekly, timeFormat, true);
      if (weeklyForecastTime && weeklyPercent < 99) {
        weeklyTooltip += `\nAt current pace, 100% by ${weeklyForecastTime}`;
      }
      weeklyTray.setToolTip(weeklyTooltip);
    }
    
    // Generate Session icon (purple background) - RIGHT position
    let sessionIcon;
    if (sessionPercent >= 99) {
      sessionIcon = generateRedXIcon(undefined, undefined, sessionOutline);
    } else {
      const sessionColor = getBackgroundColor(sessionPercent, colors.session.bg, warnThreshold, dangerThreshold);
      sessionIcon = generatePercentageIcon(sessionPercent, sessionColor, colors.session.text, sessionOutline);
    }
    if (sessionTray && !sessionTray.isDestroyed()) {
      sessionTray.setImage(sessionIcon);
      let sessionTooltip = `Session: ${Math.round(sessionPercent)}%`;
      const sessionResetTime = formatResetTime(sessionResetsAt, timeFormat, false);
      if (sessionResetTime) {
        sessionTooltip += `\nResets: ${sessionResetTime}`;
      }
      sessionTray.setToolTip(sessionTooltip);
    }
  } catch (error) {
    console.error('Failed to update tray icons:', error);
  }
}


// IPC Handlers
ipcMain.handle('get-credentials', () => {
  let sessionKey = null;
  // Try safeStorage first (OS keychain)
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = store.get('sessionKey_encrypted');
    if (encrypted) {
      try {
        sessionKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (err) {
        console.error('[Keychain] Failed to decrypt session key:', err.message);
      }
    }
  } else {
    // Fallback: plain storage (legacy or safeStorage unavailable)
    sessionKey = store.get('sessionKey');
  }
  return {
    sessionKey,
    organizationId: store.get('organizationId')
  };
});

ipcMain.handle('save-credentials', async (event, { sessionKey, organizationId }) => {
  // Store session key in OS keychain if available
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(sessionKey);
    store.set('sessionKey_encrypted', encrypted.toString('base64'));
    store.delete('sessionKey'); // Remove legacy plain storage
  } else {
    // Fallback: plain storage
    store.set('sessionKey', sessionKey);
  }
  if (organizationId) {
    store.set('organizationId', organizationId);
  }
  // Also set cookie in Electron session for window-based fetching
  await setSessionCookie(sessionKey);
  return true;
});

ipcMain.handle('delete-credentials', async () => {
  store.delete('sessionKey');
  store.delete('sessionKey_encrypted');
  store.delete('organizationId');
  // Remove all Claude.ai cookies
  const cookies = await session.defaultSession.cookies.get({ url: 'https://claude.ai' });
  for (const cookie of cookies) {
    await session.defaultSession.cookies.remove('https://claude.ai', cookie.name);
  }
  // Clear any cached data from the Electron session (storage, cache)
  // so nothing lingers on shared machines
  await session.defaultSession.clearStorageData({
    storages: ['localstorage', 'sessionstorage', 'cachestorage'],
    origin: 'https://claude.ai'
  });
  return true;
});

// Validate a sessionKey by fetching org ID via hidden BrowserWindow
ipcMain.handle('validate-session-key', async (event, sessionKey) => {
  debugLog('Validating session key:', sessionKey.substring(0, 20) + '...');
  try {
    // Set the cookie in Electron's session first
    await setSessionCookie(sessionKey);

    // Fetch organizations using hidden BrowserWindow (bypasses Cloudflare)
    const data = await fetchViaWindow('https://claude.ai/api/organizations');

    if (data && Array.isArray(data) && data.length > 0) {
      // Filter to orgs with 'chat' capability (excludes API-only orgs)
      const chatOrgs = data.filter(org => 
        org.capabilities && org.capabilities.includes('chat')
      );

      if (chatOrgs.length === 0) {
        return { success: false, error: 'No chat-enabled organizations found' };
      }

      // Prioritize Teams org if present, otherwise use first chat org
      const defaultOrg = chatOrgs.find(org => org.raven_type === 'team') || chatOrgs[0];
      const orgId = defaultOrg.uuid || defaultOrg.id;
      
      debugLog(`Session key validated, found ${chatOrgs.length} chat org(s), default org ID:`, orgId);
      
      return { 
        success: true, 
        organizationId: orgId,
        organizations: chatOrgs.map(org => ({
          id: org.uuid || org.id,
          name: org.name,
          isTeam: org.raven_type === 'team'
        }))
      };
    }

    // Check if it's an error response
    if (data && data.error) {
      return { success: false, error: data.error.message || data.error };
    }

    return { success: false, error: 'No organization found' };
  } catch (error) {
    console.error('Session key validation failed:', error.message);
    // Clean up the invalid cookie
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey');
    return { success: false, error: error.message };
  }
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) {
    if (process.platform === 'darwin') {
      mainWindow.minimize();
    } else {
      const minimizeToTray = store.get('settings.minimizeToTray', false);
      if (minimizeToTray) {
        mainWindow.hide();
      } else {
        mainWindow.minimize();
      }
    }
  }
});

ipcMain.on('close-window', () => {
  const showTrayStats = store.get('settings.showTrayStats', false);
  if (showTrayStats && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  } else {
    app.quit();
  }
});

ipcMain.on('resize-window', (event, height) => {
  if (mainWindow) {
    mainWindow.setContentSize(WIDGET_WIDTH, height);
  }
});

ipcMain.handle('get-window-position', () => {
  if (mainWindow) {
    return mainWindow.getBounds();
  }
  return null;
});

ipcMain.handle('set-window-position', (event, { x, y }) => {
  if (mainWindow) {
    mainWindow.setPosition(x, y);
    return true;
  }
  return false;
});

ipcMain.on('open-external', (event, url) => {
  // Trust boundary enforcement: duplicate allowlist check in main process
  const allowedDomains = ['claude.ai', 'github.com', 'paypal.me'];
  try {
    const parsedUrl = new URL(url);
    const isAllowed = allowedDomains.some(domain => 
      parsedUrl.hostname === domain || parsedUrl.hostname.endsWith('.' + domain)
    );
    if (isAllowed) {
      shell.openExternal(url);
    } else {
      console.warn(`[Security] Blocked openExternal call to disallowed domain: ${parsedUrl.hostname}`);
    }
  } catch (err) {
    console.warn(`[Security] Blocked openExternal call with invalid URL: ${url}`);
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-usage-history', () => {
  const organizationId = store.get('organizationId');
  const historyKey = organizationId ? `usageHistory_${organizationId}` : 'usageHistory';
  const history = store.get(historyKey, []);
  const cutoff = Date.now() - (CHART_DAYS * 24 * 60 * 60 * 1000);
  return history
    .filter((entry) => entry.timestamp > cutoff)
    .sort((a, b) => a.timestamp - b.timestamp);
});

// Show a native OS desktop notification (Windows toast, macOS NC, Linux libnotify)
ipcMain.on('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false });
    n.show();
  }
});

// Resize window for compact vs normal mode
// Compact: 290px wide, normal: 530px wide. Height stays managed by renderer.
ipcMain.on('set-compact-mode', (event, compact) => {
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    const width = compact ? 290 : WIDGET_WIDTH;
    // Compact view grows by one slim row per scoped weekly limit (e.g. Fable)
    const scopedCount = compact
      ? getScopedWeeklyLimits(store.get('latestUsageData') || {}).length
      : 0;
    const height = compact ? 105 + (scopedCount * 26) : WIDGET_HEIGHT;
    mainWindow.setBounds({ x: bounds.x, y: bounds.y, width, height });
  }
});

// Settings handlers
ipcMain.handle('get-settings', () => {
  return {
    autoStart: store.get('settings.autoStart', false),
    minimizeToTray: store.get('settings.minimizeToTray', false),
    alwaysOnTop: store.get('settings.alwaysOnTop', true),
    theme: store.get('settings.theme', 'dark'),
    warnThreshold: store.get('settings.warnThreshold', 75),
    dangerThreshold: store.get('settings.dangerThreshold', 90),
    timeFormat: store.get('settings.timeFormat', '12h'),
    weeklyDateFormat: store.get('settings.weeklyDateFormat', 'date'),
    usageAlerts: store.get('settings.usageAlerts', true),
    compactMode: store.get('settings.compactMode', false),
    refreshInterval: store.get('settings.refreshInterval', '300'),
    graphVisible: store.get('settings.graphVisible', false),
    expandedOpen: store.get('settings.expandedOpen', false),
    showTrayStats: store.get('settings.showTrayStats', false),
    showClaudeCode: store.get('settings.showClaudeCode', true),
    trayColors: { ...DEFAULT_TRAY_COLORS, ...store.get('settings.trayColors', {}) },
    trayOutline: { ...DEFAULT_TRAY_OUTLINE, ...store.get('settings.trayOutline', {}) },
    burnAlerts: store.get('settings.burnAlerts', true),
    fontColor: store.get('settings.fontColor', { enabled: false, color: '#e0e0e0' }),
    webhook: store.get('settings.webhook', { enabled: false, url: '' }),
    dailyDigest: store.get('settings.dailyDigest', true),
    showCodex: store.get('settings.showCodex', true),
    showGemini: store.get('settings.showGemini', true),
    trayOpenai: store.get('settings.trayOpenai', false),
    trayGoogle: store.get('settings.trayGoogle', false),
    sectionCollapsed: store.get('settings.sectionCollapsed', {})
  };
});

ipcMain.handle('save-settings', (event, settings) => {
  debugLog('[Settings] save-settings received:', JSON.stringify({
    trayOpenai: settings.trayOpenai, trayGoogle: settings.trayGoogle,
    sectionCollapsed: settings.sectionCollapsed, showTrayStats: settings.showTrayStats
  }));
  const supportsLoginItems = process.platform !== 'linux';
  const autoStart = supportsLoginItems ? settings.autoStart : false;

  store.set('settings.autoStart', autoStart);
  store.set('settings.minimizeToTray', settings.minimizeToTray);
  store.set('settings.alwaysOnTop', settings.alwaysOnTop);
  store.set('settings.theme', settings.theme);
  store.set('settings.warnThreshold', settings.warnThreshold);
  store.set('settings.dangerThreshold', settings.dangerThreshold);
  store.set('settings.timeFormat', settings.timeFormat);
  store.set('settings.weeklyDateFormat', settings.weeklyDateFormat);
  store.set('settings.usageAlerts', settings.usageAlerts);
  store.set('settings.compactMode', settings.compactMode);
  store.set('settings.refreshInterval', settings.refreshInterval);
  store.set('settings.graphVisible', settings.graphVisible);
  store.set('settings.expandedOpen', settings.expandedOpen);
  store.set('settings.showTrayStats', settings.showTrayStats);
  store.set('settings.showClaudeCode', settings.showClaudeCode !== false);
  if (settings.trayColors) store.set('settings.trayColors', settings.trayColors);
  if (settings.trayOutline) store.set('settings.trayOutline', settings.trayOutline);
  store.set('settings.burnAlerts', settings.burnAlerts !== false);
  if (settings.fontColor) store.set('settings.fontColor', settings.fontColor);
  if (settings.webhook) store.set('settings.webhook', settings.webhook);
  store.set('settings.dailyDigest', settings.dailyDigest !== false);
  store.set('settings.showCodex', settings.showCodex !== false);
  store.set('settings.showGemini', settings.showGemini !== false);
  if (settings.trayOpenai !== undefined) store.set('settings.trayOpenai', settings.trayOpenai === true);
  if (settings.trayGoogle !== undefined) store.set('settings.trayGoogle', settings.trayGoogle === true);
  if (settings.sectionCollapsed !== undefined) store.set('settings.sectionCollapsed', settings.sectionCollapsed || {});

  const isPortable = process.platform === 'win32' && !!process.env.PORTABLE_EXECUTABLE_FILE;

  // openAtLogin is not supported on Linux — Electron silently ignores it.
  // Skip the call entirely to avoid misleading behaviour.
  // Also skip for portable builds — autorun via registry is unreliable when the
  // exe path changes with each version. Users should use shell:startup instead.
  if (supportsLoginItems && !isPortable) {
    app.setLoginItemSettings({
      openAtLogin: autoStart,
      ...(process.platform !== 'darwin' && { path: app.getPath('exe') })
    });
  }

  if (mainWindow) {
    if (process.platform === 'darwin') {
      if (settings.minimizeToTray) { app.dock.hide(); } else { app.dock.show(); }
    } else {
      mainWindow.setSkipTaskbar(settings.minimizeToTray);
    }
    mainWindow.setAlwaysOnTop(settings.alwaysOnTop, 'floating');
  }

  if (!settings.showTrayStats) {
    // Remove tray icons immediately when the setting is turned off from the UI.
    destroyTrayIcons();
  } else {
    // Refresh tray icons immediately with new threshold settings
    const latestUsageData = store.get('latestUsageData');
    if (latestUsageData) {
      updateTrayIcon(latestUsageData);
    } else {
      // Create empty tray icons now; the next usage refresh will draw the stats.
      createTray();
    }
  }

  return true;
});

// Open a visible BrowserWindow for the user to log in to Claude.ai.
//
// Why we don't embed login directly in the app:
// Claude.ai (via Cloudflare) detects and blocks Electron-embedded logins.
// Instead, we open a standalone browser window, let the user authenticate
// normally, then capture the sessionKey cookie once login completes.
// Do NOT attempt to "fix" this back to an embedded login without verifying
// that Claude.ai/Cloudflare no longer blocks it.
//
// SECURITY: Navigation is restricted to trusted domains (claude.ai and OAuth
// providers) to prevent phishing attacks. Popup windows are blocked. Current
// URL is displayed in the window title bar for transparency.
ipcMain.handle('detect-session-key', async () => {
  // Clear any leftover sessionKey cookie
  try {
    await session.defaultSession.cookies.remove('https://claude.ai', 'sessionKey');
  } catch (e) { /* ignore */ }

  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 1000,
      height: 700,
      title: 'Claude Login - https://claude.ai/login',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    let resolved = false;

    // Security: restrict navigation to trusted domains only
    const allowedLoginDomains = [
      'claude.ai',
      'accounts.google.com',
      'appleid.apple.com',
      'login.microsoftonline.com'
    ];

    loginWin.webContents.on('will-navigate', (event, url) => {
      try {
        const hostname = new URL(url).hostname;
        const isAllowed = allowedLoginDomains.some(domain =>
          hostname === domain || hostname.endsWith('.' + domain)
        );
        if (!isAllowed) {
          event.preventDefault();
          console.warn('[Security] Blocked login navigation to untrusted domain:', url);
        } else {
          // Update title bar to show current URL (read-only)
          loginWin.setTitle(`Claude Login - ${url}`);
        }
      } catch (err) {
        event.preventDefault();
        console.warn('[Security] Blocked login navigation with invalid URL:', url);
      }
    });

    // Update title on OAuth redirects and in-page navigation
    loginWin.webContents.on('did-navigate', (event, url) => {
      loginWin.setTitle(`Claude Login - ${url}`);
    });

    loginWin.webContents.on('did-navigate-in-page', (event, url) => {
      loginWin.setTitle(`Claude Login - ${url}`);
    });

    // Security: block popup windows from login page
    loginWin.webContents.setWindowOpenHandler(() => {
      console.warn('[Security] Blocked popup window attempt from login page');
      return { action: 'deny' };
    });

    // Listen for sessionKey cookie being set after login
    const onCookieChanged = (event, cookie, cause, removed) => {
      if (
        cookie.name === 'sessionKey' &&
        cookie.domain.includes('claude.ai') &&
        !removed &&
        cookie.value
      ) {
        resolved = true;
        session.defaultSession.cookies.removeListener('changed', onCookieChanged);
        loginWin.close();
        resolve({ success: true, sessionKey: cookie.value });
      }
    };

    session.defaultSession.cookies.on('changed', onCookieChanged);

    loginWin.on('closed', () => {
      session.defaultSession.cookies.removeListener('changed', onCookieChanged);
      if (!resolved) {
        resolve({ success: false, error: 'Login window closed' });
      }
    });

    loginWin.loadURL('https://claude.ai/login');
  });
});

// ---- Auto-update (electron-updater) ----
// Downloads new fork releases in the background and applies them silently —
// no installer wizard. Renderer gets 'update-downloaded' and offers a
// one-click restart; otherwise the update applies on next quit.
let autoUpdater = null;
try {
  ({ autoUpdater } = require('electron-updater'));
} catch (err) {
  debugLog('[AutoUpdate] electron-updater unavailable:', err.message);
}

// On fast connections the download can finish before the renderer has
// registered its listener, so the ready signal is re-sent on every
// did-finish-load (createMainWindow wires this up).
let _downloadedUpdateVersion = null;
function sendUpdateReady() {
  if (_downloadedUpdateVersion && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-downloaded', _downloadedUpdateVersion);
  }
}

function setupAutoUpdate() {
  if (!autoUpdater || !app.isPackaged) return;
  // Portable builds can't self-replace their exe — they keep the banner+link flow
  if (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_FILE) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => {
    debugLog('[AutoUpdate] Downloaded', info.version);
    _downloadedUpdateVersion = info.version;
    sendUpdateReady();
  });
  autoUpdater.on('error', (err) => debugLog('[AutoUpdate] Error:', err.message));

  const check = () => autoUpdater.checkForUpdates().catch((err) => debugLog('[AutoUpdate] Check failed:', err.message));
  check();
  setInterval(check, 6 * 60 * 60 * 1000);
}

ipcMain.on('install-update', () => {
  if (autoUpdater) {
    // silent install, relaunch when done
    autoUpdater.quitAndInstall(true, true);
  }
});

// Check GitHub releases for a newer version
ipcMain.handle('check-for-update', () => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
      method: 'GET',
      headers: {
        'User-Agent': 'claude-usage-widget',
        'Accept': 'application/vnd.github+json'
      },
      timeout: 5000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const tag = (data.tag_name || '').replace(/^v/, '');
          const current = app.getVersion();
          if (tag && isNewerVersion(tag, current)) {
            resolve({ hasUpdate: true, version: tag });
          } else {
            resolve({ hasUpdate: false, version: null });
          }
        } catch {
          resolve({ hasUpdate: false, version: null });
        }
      });
    });

    req.on('error', () => resolve({ hasUpdate: false, version: null }));
    req.on('timeout', () => { req.destroy(); resolve({ hasUpdate: false, version: null }); });
    req.end();
  });
});

function isNewerVersion(remote, local) {
  try {
    const parseVersion = (ver) => {
      const [mainVer, preRelease] = ver.split('-');
      const parts = mainVer.split('.').map(Number);
      return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
        preRelease: preRelease || null
      };
    };

    const r = parseVersion(remote);
    const l = parseVersion(local);

    // Never notify about pre-release versions (rc, beta, alpha, etc.)
    if (r.preRelease !== null) return false;

    // Compare major.minor.patch
    if (r.major !== l.major) return r.major > l.major;
    if (r.minor !== l.minor) return r.minor > l.minor;
    if (r.patch !== l.patch) return r.patch > l.patch;

    // Same version numbers — notify if local is a pre-release and remote is stable
    // e.g. local=1.7.5-rc.1, remote=1.7.5 → user should be told stable is out
    return l.preRelease !== null;
  } catch { return false; }
}

ipcMain.handle('fetch-usage-data', async (event, options = {}) => {
  // Use the same credential retrieval logic as get-credentials
  let sessionKey = null;
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = store.get('sessionKey_encrypted');
    if (encrypted) {
      try {
        sessionKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (err) {
        console.error('[Keychain] Failed to decrypt session key:', err.message);
      }
    }
  } else {
    sessionKey = store.get('sessionKey');
  }

  const organizationId = store.get('organizationId');

  if (!sessionKey || !organizationId) {
    throw new Error('Missing credentials');
  }

  // Kick off the Claude Code (CLI) and Codex account fetches concurrently
  // with the claude.ai one; each resolves to null on any failure.
  const claudeCodePromise = store.get('settings.showClaudeCode', true)
    ? cachedProviderFetch('claude_code', fetchClaudeCodeUsage)
    : Promise.resolve(null);
  const codexPromise = store.get('settings.showCodex', true)
    ? cachedProviderFetch('codex', fetchCodexUsage)
    : Promise.resolve(null);
  const geminiPromise = store.get('settings.showGemini', true)
    ? cachedProviderFetch('gemini', fetchGeminiUsage)
    : Promise.resolve(null);

  // Ensure cookie is set
  await setSessionCookie(sessionKey);

  // Conditional API polling: Only fetch overage/prepaid if the expand panel is open
  // or if compact mode is disabled (normal mode). This reduces API calls when the
  // user won't see the extra usage data anyway.
  // If forceExtended is passed (e.g., when user clicks expand), use that instead of saved setting
  const expandedOpen = options.forceExtended !== undefined ? options.forceExtended : store.get('settings.expandedOpen', false);
  const compactMode = store.get('settings.compactMode', false);
  const shouldFetchExtended = expandedOpen;

  const usageUrl = `https://claude.ai/api/organizations/${organizationId}/usage`;
  const overageUrl = `https://claude.ai/api/organizations/${organizationId}/overage_spend_limit`;
  const prepaidUrl = `https://claude.ai/api/organizations/${organizationId}/prepaid/credits`;

  // Build URL array based on UI state
  const urls = [usageUrl];
  if (shouldFetchExtended) {
    urls.push(overageUrl, prepaidUrl);
    debugLog('[Conditional Polling] Fetching extended data (overage + prepaid) - panel is visible');
  } else {
    debugLog('[Conditional Polling] Skipping extended data - panel not visible');
  }

  // Fetch endpoints sequentially using a single reused BrowserWindow.
  // This reduces memory overhead compared to creating 3 separate windows.
  // Usage is always required; overage and prepaid are conditional based on UI state.
  let usageResult, overageResult, prepaidResult;
  
  try {
    const results = await fetchMultipleViaWindow(urls);
    
    // Always have usage result (first in array)
    usageResult = { status: 'fulfilled', value: results[0] };
    
    // Conditionally map overage/prepaid results
    if (shouldFetchExtended) {
      overageResult = { status: 'fulfilled', value: results[1] };
      prepaidResult = { status: 'fulfilled', value: results[2] };
    } else {
      // Mark as skipped (not an error, just not fetched)
      overageResult = { status: 'skipped', reason: 'UI panel not visible' };
      prepaidResult = { status: 'skipped', reason: 'UI panel not visible' };
    }
  } catch (error) {
    // If any fetch fails, determine which one and set appropriate result statuses
    // For now, if the batch fails, treat usage as failed (required endpoint)
    usageResult = { status: 'rejected', reason: error };
    overageResult = { status: 'rejected', reason: error };
    prepaidResult = { status: 'rejected', reason: error };
  }

  // Usage endpoint is mandatory
  if (usageResult.status === 'rejected') {
    const error = usageResult.reason;
    debugLog('API request failed:', error.message);
    const isBlocked = error.message.startsWith('CloudflareBlocked')
      || error.message.startsWith('CloudflareChallenge')
      || error.message.startsWith('UnexpectedHTML');
    if (isBlocked) {
      store.delete('sessionKey');
      store.delete('organizationId');
      if (mainWindow) {
        mainWindow.webContents.send('session-expired');
      }
      throw new Error('SessionExpired');
    }
    throw error;
  }

  const data = usageResult.value;

  // Merge overage spending data into data.extra_usage
  if (overageResult.status === 'fulfilled' && overageResult.value) {
    const overage = overageResult.value;
    const limit = overage.monthly_credit_limit ?? overage.spend_limit_amount_cents;
    const used = overage.used_credits ?? overage.balance_cents;
    const enabled = overage.is_enabled !== undefined ? overage.is_enabled : (limit != null);

    if (enabled && typeof limit === 'number' && limit > 0 && typeof used === 'number') {
      data.extra_usage = {
        utilization: (used / limit) * 100,
        resets_at: null,
        used_cents: used,
        limit_cents: limit,
        is_enabled: true,
        currency: overage.currency || 'USD',
      };
    } else if (!enabled) {
      // Extra usage is off — still pass the flag so the renderer can show status
      if (!data.extra_usage) data.extra_usage = {};
      data.extra_usage.is_enabled = false;
      data.extra_usage.currency = overage.currency || 'USD';
    }
  } else {
    debugLog('Overage fetch skipped or failed:', overageResult.reason?.message || 'no data');
  }

  // Merge prepaid balance into data.extra_usage
  if (prepaidResult.status === 'fulfilled' && prepaidResult.value) {
    const prepaid = prepaidResult.value;
    if (typeof prepaid.amount === 'number') {
      if (!data.extra_usage) data.extra_usage = {};
      data.extra_usage.balance_cents = prepaid.amount;
      // Use prepaid currency if overage didn't already set one
      if (!data.extra_usage.currency && prepaid.currency) {
        data.extra_usage.currency = prepaid.currency;
      }
    }
  } else {
    debugLog('Prepaid fetch skipped or failed:', prepaidResult.reason?.message || 'no data');
  }

  // Attach the Claude Code (CLI) account usage, if available. A live account
  // always carries resets_at timestamps — anything else is a dead session.
  const claudeCode = await claudeCodePromise;
  if (claudeCode && (claudeCode.five_hour?.resets_at || claudeCode.seven_day?.resets_at)) {
    data.claude_code = claudeCode;
  }
  // Merged mode: CLI login matches the web login — CLI rows would duplicate
  data.claude_code_same_account = detectClaudeCliSameAccount(data);
  const codex = await codexPromise;
  if (codex) data.codex = codex;
  const gemini = await geminiPromise;
  if (gemini) data.gemini = gemini;

  storeUsageHistory(data);

  // Burn-rate forecasts, anomaly check, planner, digest — after the new sample lands
  data.forecasts = computeForecasts();
  data.sessionPlans = computeSessionPlans();
  checkBurnAnomalies();
  checkDailyDigest(data);

  // Store latest usage data for settings refresh
  store.set('latestUsageData', data);

  // Update tray icon with current usage data
  updateTrayIcon(data);

  // Re-assert always-on-top after hidden BrowserWindows from fetchViaWindow
  // are destroyed — creating/destroying BrowserWindows can temporarily disrupt
  // the main window's z-order on some OS/window manager combinations.
  if (mainWindow && !mainWindow.isDestroyed()) {
    const alwaysOnTop = store.get('settings.alwaysOnTop', true);
    if (alwaysOnTop) {
      mainWindow.setAlwaysOnTop(true, 'floating');
    }
  }

  return data;
});

// App lifecycle
app.whenReady().then(async () => {
  setupAutoUpdate();

  // Restore session cookie if we have stored credentials
  let sessionKey = null;
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = store.get('sessionKey_encrypted');
    if (encrypted) {
      try {
        sessionKey = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
      } catch (err) {
        console.error('[Keychain] Failed to decrypt session key on startup:', err.message);
      }
    }
  } else {
    sessionKey = store.get('sessionKey');
  }

  if (sessionKey) {
    await setSessionCookie(sessionKey);
  }

  migrateUsageHistoryKey();
  pruneStaleHistoryKeys();

  createMainWindow();
  // Avoid creating temporary tray icons during startup when tray stats are disabled.
  if (store.get('settings.showTrayStats', false)) {
    createTray();
  }

  // Apply persisted settings
  const minimizeToTray = store.get('settings.minimizeToTray', false);
  const alwaysOnTop = store.get('settings.alwaysOnTop', true);
  if (mainWindow) {
    if (process.platform === 'darwin') {
      if (minimizeToTray) app.dock.hide();
    } else {
      if (minimizeToTray) mainWindow.setSkipTaskbar(true);
    }
    mainWindow.setAlwaysOnTop(alwaysOnTop, 'floating');
  }

  // Periodic always-on-top re-assertion to recover from z-order disruptions
  // (hidden window spawns, window manager shortcuts, alt-tab, etc.)
  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const alwaysOnTopSetting = store.get('settings.alwaysOnTop', true);
      if (alwaysOnTopSetting) {
        mainWindow.setAlwaysOnTop(true, 'floating');
      }
    }
  }, 5000);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in tray
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow();
  } else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
