'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { alertSoundEvent } = require('../src/alert-events');
const event = { key: 'private@example.test', pool: 'codex_weekly', reason: 'scheduled', from: 80, to: 0 };
const request = { kind: 'reset', phase: 'claim', events: [event] };
test('concurrent app claims make one sound, preserve distinct accounts and recover after failure', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imburning-alerts-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const outcomes = await Promise.all(['electron', 'tauri'].map(async app => ({ app, ...await alertSoundEvent(root, app, request, 1000000) })));
  assert.equal(outcomes.filter(o => o.play).length, 1);
  const owner = outcomes.find(o => o.play).app;
  assert.equal((await alertSoundEvent(root, 'tauri', { ...request, events: [{ ...event, key: 'different account' }] }, 1000001)).play, true);
  await alertSoundEvent(root, owner, { ...request, phase: 'failed' }, 1000002);
  assert.equal((await alertSoundEvent(root, 'tauri', request, 1000003)).play, true);
  assert.equal((await alertSoundEvent(root, 'electron', request, 1600004)).play, true);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'events.jsonl'), 'utf8'), /private@example/);
});
test('disabled sounds and previews never claim events; logs rotate', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imburning-alerts-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await alertSoundEvent(root, 'electron', { ...request, phase: 'disabled' });
  await alertSoundEvent(root, 'electron', { ...request, phase: 'preview' });
  assert.equal((await alertSoundEvent(root, 'tauri', request)).play, true);
  fs.writeFileSync(path.join(root, 'events.jsonl'), 'x'.repeat(1024 * 1024));
  await alertSoundEvent(root, 'tauri', { ...request, phase: 'played' });
  assert.equal(fs.statSync(path.join(root, 'events.jsonl.1')).size, 1024 * 1024);
  assert.ok(fs.statSync(path.join(root, 'events.jsonl')).size < 2000);
});

test('the actual playback function lets only one app play, while previews and disabled sounds behave correctly', async t => {
  const vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/app.js'), 'utf8');
  const fn = source.match(/async function playAlertSound\([^]*?\n}/)[0];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imburning-playback-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  let plays = 0;
  function renderer(app, enabled = true) {
    const ctx = vm.createContext({
      soundCfg: () => ({ enabled, volume: 0.85 }), resolveSoundSrc: async () => 'fixture.wav',
      _soundPlaying: {}, debugLog() {},
      window: { electronAPI: { alertSoundEvent: request => alertSoundEvent(root, app, request) } },
      Audio: class { async play() { plays++; } pause() {} }
    });
    vm.runInContext(fn, ctx); return ctx;
  }
  await renderer('electron', false).playAlertSound('reset', { events: [event] });
  assert.equal(plays, 0);
  await Promise.all(['electron', 'tauri'].map(app => renderer(app).playAlertSound('reset', { events: [event] })));
  assert.equal(plays, 1);
  await renderer('tauri', false).playAlertSound('reset', { force: true });
  assert.equal(plays, 2);
  const log = fs.readFileSync(path.join(root, 'events.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(log.filter(e => e.phase === 'played').length, 1);
  assert.equal(log.filter(e => e.phase === 'claim' && e.events[0].decision === 'duplicate').length, 1);
});

test('accounts without a known identity do not suppress another apps alerts', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imburning-unknown-account-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const unknown = { ...request, events: [{ ...event, shared: false }] };
  assert.equal((await alertSoundEvent(root, 'electron', unknown)).play, true);
  assert.equal((await alertSoundEvent(root, 'tauri', unknown)).play, true);
});
