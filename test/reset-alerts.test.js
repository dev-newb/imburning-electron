'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTracker } = require('../src/renderer/reset-alerts');
const start = Date.parse('2026-09-14T12:00:00Z');
const minute = 60000;
const p = (pct, step, extra = {}) => ({ key: 'codex_weekly', pool: 'codex_weekly',
  identity: 'account-a', account: ['codex', 'a'], pct, resetsAt: start + 60 * minute,
  observedAt: start + step * minute, ...extra });
const bank = (count, step, extra = {}) => ({ ...p(50, step), key: 'codex_bank', pool: 'reset-credits', count, ...extra });

test('one zero, repeated redraws and cached samples cannot confirm a reset or clear a wall', () => {
  const t = createTracker(); t.observe([p(100, 0)], []);
  assert.equal(t.observe([p(0, 5)], []).reset.length, 0);
  assert.equal(t.observe([p(0, 5)], []).reset.length, 0);
  assert.equal(t.observe([p(0, 4)], []).reset.length, 0);
  const rebound = t.observe([p(100, 10)], []);
  assert.equal(rebound.reset.length, 0); assert.equal(rebound.wall.length, 0); assert.equal(rebound.recovered, false);
});
test('two fresh low readings confirm an early reset, even after some new usage', () => {
  const t = createTracker(); t.observe([p(100, 0)], []); t.observe([p(0, 5)], []);
  const result = t.observe([p(4, 10)], []);
  assert.equal(result.reset[0].reason, 'early'); assert.equal(result.recovered, true);
  assert.equal(t.observe([p(4, 15)], []).reset.length, 0);
});
test('scheduled rollovers sound after confirmation, including unused and lightly used pools', () => {
  for (const used of [0, 2, 50, 100]) {
    const t = createTracker(); t.observe([p(used, 55)], []);
    const next = { resetsAt: start + 360 * minute };
    assert.equal(t.observe([p(0, 60, next)], []).reset.length, 0);
    const result = t.observe([p(10, 65, next)], []);
    assert.equal(result.reset[0].reason, 'scheduled');
    assert.equal(t.observe([p(10, 70, next)], []).reset.length, 0);
  }
});
test('near-deadline rollovers still sound and are classified as scheduled', () => {
  const t = createTracker(); t.observe([p(50, 55)], []);
  const next = { resetsAt: start + 360 * minute };
  t.observe([p(0, 60 - 1 / 60, next)], []);
  assert.equal(t.observe([p(0, 65, next)], []).reset[0].reason, 'scheduled');
});
test('scheduled five-hour rollovers are suppressed, while early five-hour resets still ring', () => {
  const fiveHour = { key: 'five_hour', pool: 'five_hour', label: 'Claude Session (5h)', windowMinutes: 300 };
  let t = createTracker(); t.observe([p(45, 55, fiveHour)], []);
  const next = { ...fiveHour, resetsAt: start + 360 * minute };
  t.observe([p(0, 60, next)], []);
  let result = t.observe([p(0, 65, next)], []);
  assert.equal(result.reset.length, 0);
  assert.equal(result.suppressed[0].reason, 'scheduled');
  assert.equal(result.suppressed[0].from, 45);

  t = createTracker(); t.observe([p(16, 0, fiveHour)], []);
  t.observe([p(1, 5, fiveHour)], []);
  result = t.observe([p(1, 10, fiveHour)], []);
  assert.equal(result.reset[0].reason, 'early');
  assert.equal(result.suppressed.length, 0);
});
test('expiry alone never makes noise and an idle pool needs an actual rollover', () => {
  const t = createTracker(); t.observe([p(0, 55)], []);
  assert.equal(t.observe([p(0, 60)], []).reset.length, 0);
  assert.equal(t.observe([p(0, 65)], []).reset.length, 0);
});
test('scheduled resets can clear their timestamp until the next use', () => {
  const t = createTracker(); t.observe([p(2, 55)], []);
  t.observe([p(0, 60, { resetsAt: NaN })], []);
  assert.equal(t.observe([p(0, 65, { resetsAt: NaN })], []).reset[0].reason, 'scheduled');
});
test('rolling future deadlines on unused pools are quiet', () => {
  const t = createTracker(); t.observe([p(0, 0)], []);
  for (let i = 5; i < 120; i += 5) {
    assert.equal(t.observe([p(0, i, { resetsAt: start + (i + 60) * minute })], []).reset.length, 0);
  }
});
test('missing data, changed accounts and a long offline gap cancel pending alerts', () => {
  for (const change of ['missing', 'account', 'sleep', 'unknown', 'explicit']) {
    const t = createTracker(); t.observe([p(50, 0)], []); t.observe([p(0, 5)], []);
    if (change === 'missing') t.observe([], []);
    if (change === 'unknown') t.observe([p(null, 7)], []);
    if (change === 'explicit') t.forget(['codex_weekly']);
    const next = p(0, change === 'sleep' ? 90 : 10, change === 'account' ? { identity: 'account-b' } : {});
    assert.equal(t.observe([next], []).reset.length, 0, change);
  }
});
test('unknown, negative or string quota readings cannot be zeros or confirm resets', () => {
  for (const value of [null, undefined, NaN, Infinity, -1, '0']) {
    const t = createTracker(); t.observe([p(50, 0)], []);
    t.observe([p(value, 5)], []);
    assert.equal(t.observe([p(0, 10)], []).reset.length, 0);
  }
});
test('missing bank counts and a single explicit zero never announce the existing credit again', () => {
  for (const value of [undefined, null, -1, '0', 0]) {
    const t = createTracker(); t.observe([], [bank(1, 0)]);
    t.observe([], [bank(value, 5)]);
    assert.equal(t.observe([], [bank(1, 10)]).banked.length, 0);
    assert.equal(t.observe([], [bank(1, 15)]).banked.length, 0);
  }
});
test('real bank grants and spends require independent samples, including separate CLI accounts', () => {
  const t = createTracker(); t.observe([], [bank(1, 0)]);
  t.observe([], [bank(2, 5)]); assert.equal(t.observe([], [bank(2, 5)]).banked.length, 0);
  assert.equal(t.observe([], [bank(2, 10)]).banked.length, 1);
  t.observe([], [bank(1, 15)]); assert.equal(t.observe([], [bank(1, 20)]).banked.length, 0);
  t.observe([], [bank(2, 25)]); assert.equal(t.observe([], [bank(2, 30)]).banked.length, 1);
});
test('reset and bank events on the same refresh both survive', () => {
  const t = createTracker(); t.observe([p(100, 0)], [bank(0, 0)]);
  t.observe([p(0, 5)], [bank(1, 5)]);
  const result = t.observe([p(0, 10)], [bank(1, 10)]);
  assert.equal(result.reset.length, 1); assert.equal(result.banked.length, 1);
});

test('a deliberately slower refresh interval can still confirm a scheduled reset', () => {
  const t = createTracker(); t.observe([p(50, 55)], [], 180 * minute);
  const next = { resetsAt: start + 360 * minute };
  t.observe([p(0, 115, next)], [], 180 * minute);
  assert.equal(t.observe([p(10, 175, next)], [], 180 * minute).reset[0].reason, 'scheduled');
});
