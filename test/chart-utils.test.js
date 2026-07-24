'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { finiteOrNull, hasPositive, point, formatTimestampTick } = require('../src/renderer/chart-utils');

test('chart values preserve zero and gap unavailable samples', () => {
  assert.equal(finiteOrNull(0), 0);
  assert.equal(finiteOrNull(undefined), null);
  assert.deepEqual(point(123, undefined), { x: 123, y: null });
  assert.equal(hasPositive([null, 0, undefined]), false);
  assert.equal(hasPositive([null, 0, 2]), true);
});

test('timestamp labels are human-readable rather than epoch numbers', () => {
  const timestamp = Date.UTC(2026, 6, 20, 12, 30);
  const label = formatTimestampTick(timestamp, 60 * 60 * 1000, '24h');
  assert.equal(typeof label, 'string');
  assert.equal(label.includes(String(timestamp)), false);
});
