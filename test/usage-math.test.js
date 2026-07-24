'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  finiteOrNull,
  sampleGapLimitMs,
  positiveBurn,
  latestContiguousRun,
  isExplicitAuthFailure
} = require('../src/usage-math');

test('finiteOrNull preserves real zero and rejects unavailable values', () => {
  assert.equal(finiteOrNull(0), 0);
  assert.equal(finiteOrNull(12.5), 12.5);
  assert.equal(finiteOrNull(undefined), null);
  assert.equal(finiteOrNull(NaN), null);
  assert.equal(finiteOrNull(Infinity), null);
});

test('latestContiguousRun drops invalid samples before finding the run', () => {
  assert.deepEqual(latestContiguousRun([
    { t: 1000, v: 5 },
    null,
    { t: NaN, v: 9 },
    { t: 61000, v: 'not-a-number' },
    { t: 121000, v: 7 }
  ], 300000), [
    { t: 1000, v: 5 },
    { t: 121000, v: 7 }
  ]);
});

test('explicit auth failure recognizes string statuses and the statusCode field', () => {
  assert.equal(isExplicitAuthFailure({ status: '401' }), true);
  assert.equal(isExplicitAuthFailure({ statusCode: 403 }), true);
  assert.equal(isExplicitAuthFailure({ status: 500 }), false);
  assert.equal(isExplicitAuthFailure(null), false);
});

test('sample gap follows the configured refresh interval', () => {
  assert.equal(sampleGapLimitMs('30'), 180000);
  assert.equal(sampleGapLimitMs('300'), 750000);
  assert.equal(sampleGapLimitMs('invalid'), 750000);
});

test('positiveBurn skips missing samples, resets, and long gaps', () => {
  const history = [
    { timestamp: 0, value: 10 },
    { timestamp: 300000, value: 14 },
    { timestamp: 600000, value: null },
    { timestamp: 900000, value: 20 },
    { timestamp: 1200000, value: 5 },
    { timestamp: 3000000, value: 40 }
  ];
  assert.equal(positiveBurn(history, (entry) => entry.value, { maxGapMs: 750000 }), 4);
});

test('positiveBurn does not count a delta that crosses the requested start boundary', () => {
  const history = [
    { timestamp: 900, value: 10 },
    { timestamp: 1100, value: 40 },
    { timestamp: 1200, value: 45 }
  ];
  assert.equal(positiveBurn(history, (entry) => entry.value, {
    start: 1000,
    end: 2000,
    maxGapMs: 1000
  }), 5);
});

test('forecast input uses only the latest reset-free run after an outage', () => {
  const samples = [
    { t: 0, v: 10 },
    { t: 60000, v: 12 },
    { t: 600000, v: 30 },
    { t: 660000, v: 32 },
    { t: 720000, v: 5 },
    { t: 780000, v: 7 }
  ];
  assert.deepEqual(latestContiguousRun(samples, 180000), samples.slice(4));
});

test('only explicit authentication responses expire credentials', () => {
  assert.equal(isExplicitAuthFailure({ status: 401 }), true);
  assert.equal(isExplicitAuthFailure({ error: { code: 'invalid_session' } }), true);
  assert.equal(isExplicitAuthFailure({ error: 'Session expired' }), true);
  assert.equal(isExplicitAuthFailure({ error: 'Cloudflare challenge' }), false);
  assert.equal(isExplicitAuthFailure({ status: 500, message: 'Unexpected HTML' }), false);
});
