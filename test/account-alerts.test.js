'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const resetAlerts = require('../src/renderer/reset-alerts');
const app = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
const fn = name => app.match(new RegExp(`(?:async )?function ${name}\\([^]*?\\n}`))[0];
function harness() {
  const sounds = [], notifications = [], ledger = [];
  const ctx = vm.createContext({
    Date, Set, Map, credentials: {}, EXTRA_ROW_CONFIG: {},
    window: { BurnwatchResetAlerts: resetAlerts, _cachedSettings: { usageAlerts: true }, electronAPI: {
      showNotification: (...args) => notifications.push(args), sendAlertWebhook() {},
      alertSoundEvent: event => { ledger.push(event); return Promise.resolve({ play: false }); }
    } },
    playAlertSound: kind => sounds.push(kind), formatResetsAt: () => 'later',
    warnThreshold: 80, dangerThreshold: 90
  });
  vm.runInContext(`let _alertAccounts = {}, _prevBurningKeys = new Set(), _burnWatchSeeded = false;
    const _resetTracker = window.BurnwatchResetAlerts.createTracker();
    let isFirstDataLoad = true; const alertFired = {};\n` +
    ['alertAccountIdentities', 'alertPoolAccount', 'resetAccountAlertBaseline', 'checkAccountAlerts',
      'computeBurningRowKeys', 'checkBurnSpikeSound', 'resetWatchPools', 'checkResetAlerts',
      'seedAlertFlags', 'checkUsageAlerts'].map(fn).join('\n'), ctx);
  let at = Date.now();
  const stamp = data => {
    const value = structuredClone(data); at += 300000; value.observedAt = at;
    for (const provider of ['codex', 'gemini', 'claude_code']) {
      if (value[provider]) { value[provider].observedAt = at; if (value[provider].cli) value[provider].cli.observedAt = at; }
    }
    return value;
  };
  return { ctx, sounds, notifications, ledger, feed: data => ctx.checkAccountAlerts(stamp(data)),
    clear() { sounds.length = 0; notifications.length = 0; ledger.length = 0; } };
}
const account = (id, percent, available = 0, connected = false) => ({ accountId: id, connected,
  source: 'live', email: id + '@example.test', resetCredits: { available },
  limits: [{ key: 'primary_seven_day', label: 'Codex (7d)', percent,
    resetsAt: new Date(Date.now() + 86400000).toISOString() }] });

test('connecting desktop after CLI silently seeds existing bank, exhaustion and burning state', () => {
  const h = harness();
  h.feed({ codex: account('cli', 56) });
  const data = { codex: { ...account('desktop', 100, 3, true), cli: account('cli', 56) }, burningSeries: { codex: true } };
  h.feed(data); h.feed(data);
  assert.deepEqual(h.sounds, []); assert.deepEqual(h.notifications, []);
  h.feed({ ...data, codex: { ...data.codex, resetCredits: { available: 4 } } });
  h.feed({ ...data, codex: { ...data.codex, resetCredits: { available: 4 } } });
  assert.deepEqual(h.sounds, ['banked']);
});

test('account swaps cannot produce reset, wall, banked or available catchup alerts', () => {
  for (const [from, to] of [[account('a', 100, 0), account('b', 0, 3)],
    [account('a', 30, 0), account('b', 100, 3)]]) {
    const h = harness(); h.feed({ codex: from }); h.feed({ codex: to });
    assert.deepEqual(h.sounds, []); assert.deepEqual(h.notifications, []);
  }
});

test('same-account transitions still announce banked resets, early resets, walls and recovery', () => {
  const h = harness();
  h.feed({ codex: account('a', 56, 0) });
  h.feed({ codex: account('a', 100, 0) });
  assert.deepEqual(h.sounds, ['wall']); assert.equal(h.notifications.length, 1);
  h.clear(); h.feed({ codex: account('a', 0, 0) });
  assert.deepEqual(h.sounds, []); assert.deepEqual(h.notifications, []);
  h.feed({ codex: account('a', 0, 0) });
  assert.deepEqual(h.sounds, ['reset']); assert.match(h.notifications[0][1], /available again/);
  h.clear(); h.feed({ codex: account('a', 0, 1) });
  h.feed({ codex: account('a', 0, 1) });
  assert.deepEqual(h.sounds, ['banked']);
});

test('scheduled 5-hour rollover is logged but silent; weekly rollover and early 5-hour reset ring', async () => {
  const base = Date.now();
  const h = harness();
  const claude = (field, pct, resetsAt) => ({ anthropic_email: 'a@example.test', anthropic_source: 'web',
    [field]: { utilization: pct, resets_at: new Date(resetsAt).toISOString() } });

  h.feed(claude('five_hour', 45, base + 10 * 60000));
  h.feed(claude('five_hour', 0, base + 310 * 60000));
  h.feed(claude('five_hour', 0, base + 310 * 60000));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.sounds, []);
  assert.equal(h.ledger.length, 1);
  assert.equal(h.ledger[0].phase, 'suppressed');
  assert.equal(h.ledger[0].events[0].reason, 'scheduled');
  assert.equal(h.ledger[0].events[0].from, 45);

  h.clear(); h.ctx.resetAccountAlertBaseline('anthropic');
  h.feed(claude('seven_day', 98, base + 40 * 60000));
  h.feed(claude('seven_day', 0, base + 7 * 86400000));
  h.feed(claude('seven_day', 0, base + 7 * 86400000));
  assert.deepEqual(h.sounds, ['reset']);

  h.clear(); h.ctx.resetAccountAlertBaseline('anthropic');
  h.feed(claude('five_hour', 16, base + 86400000));
  h.feed(claude('five_hour', 1, base + 86400000));
  h.feed(claude('five_hour', 1, base + 86400000));
  assert.deepEqual(h.sounds, ['reset']);
});

test('disconnects, missing data, delayed first quotas and re-adoption are quiet', () => {
  for (const missing of [{}, { codex: { ...account('a', 0), limits: [] } }]) {
    const h = harness(); h.feed({ codex: account('a', 100, 0) });
    h.feed(missing); h.feed({ codex: account('a', 0, 3), burningSeries: { codex: true } });
    assert.deepEqual(h.sounds, []); assert.deepEqual(h.notifications, []);
  }
  const h = harness(); h.feed({ codex: account('a', 50, 0) });
  h.ctx.resetAccountAlertBaseline('openai');
  h.feed({ codex: account('a', 100, 3) });
  assert.deepEqual(h.sounds, []); assert.deepEqual(h.notifications, []);
});

test('connecting another provider leaves existing account alerts active', () => {
  const h = harness(); h.feed({ codex: account('a', 55, 0) });
  h.ctx.resetAccountAlertBaseline('google');
  h.feed({ codex: account('a', 100, 0), gemini: account('g', 100), burningSeries: { gemini: true } });
  assert.deepEqual(h.sounds, ['wall']); assert.equal(h.notifications.length, 1);
});

test('CLI account switches are quiet without muting a continuing desktop account', () => {
  const h = harness();
  h.feed({ codex: { ...account('desktop', 50, 0, true), cli: account('cli-a', 50) } });
  h.feed({ codex: { ...account('desktop', 100, 0, true), cli: account('cli-b', 100) } });
  assert.deepEqual(h.sounds, ['wall']); assert.equal(h.notifications.length, 1);
  assert.doesNotMatch(h.notifications[0][0], /CLI/);
});

test('Claude account changes seed threshold notifications and sound baselines', () => {
  const h = harness();
  const claude = (email, pct) => ({ anthropic_email: email, anthropic_source: 'web',
    five_hour: { utilization: pct, resets_at: new Date(Date.now() + 86400000).toISOString() } });
  h.feed(claude('a@example.test', 30)); h.feed(claude('b@example.test', 100));
  assert.deepEqual(h.sounds, []); assert.deepEqual(h.notifications, []);
});

test('second-account emails are visible, use textContent, hide and clear with account settings', () => {
  const elements = {};
  for (const id of ['emailAnthropic', 'emailOpenai', 'emailGoogle', 'emailOpenaiCli', 'emailGoogleCli']) {
    const text = { textContent: '' };
    elements[id] = { style: {}, textContent: '', title: '', querySelector: () => text };
  }
  const ctx = vm.createContext({ document: { getElementById: id => elements[id] }, window: { _cachedSettings: {} } });
  vm.runInContext(fn('renderAccountEmails'), ctx);
  const data = { codex: { email: 'desktop@example.test', cli: { email: '<cli@example.test>' } } };
  ctx.renderAccountEmails(data);
  assert.equal(elements.emailOpenaiCli.textContent, '<cli@example.test>');
  assert.equal(elements.emailOpenaiCli.style.display, '');
  assert.equal(elements.emailOpenai.querySelector().textContent, 'desktop@example.test');
  ctx.window._cachedSettings.hideAccountEmails = true; ctx.renderAccountEmails(data);
  assert.equal(elements.emailOpenaiCli.style.display, 'none');
  assert.equal(elements.emailOpenaiCli.textContent, ''); assert.equal(elements.emailOpenaiCli.title, '');
  ctx.window._cachedSettings.hideAccountEmails = false; ctx.renderAccountEmails({});
  assert.equal(elements.emailOpenaiCli.style.display, 'none');
});
