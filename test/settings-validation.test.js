'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeHiddenSeries, sanitizeFetchOptions } = require('../src/settings-validation');

test('hidden chart series accepts only bounded stable ids explicitly set true', () => {
  const oversized = 'x'.repeat(81);
  assert.deepEqual(sanitizeHiddenSeries({
    'claude:session': true,
    'provider:codex': false,
    [oversized]: true,
    empty: null
  }), { 'claude:session': true });
});

test('fetch options expose only explicit supported refresh requests', () => {
  assert.deepEqual(sanitizeFetchOptions({
    forceExtended: true,
    forceProviders: true,
    refreshLocalCredentials: true,
    unsafe: 'ignored'
  }), {
    forceExtended: true,
    forceProviders: true,
    refreshLocalCredentials: true
  });
  assert.deepEqual(sanitizeFetchOptions({ forceExtended: false }), {});
  assert.deepEqual(sanitizeFetchOptions({ forceProviders: 'yes' }), {});
  assert.deepEqual(sanitizeFetchOptions({ refreshLocalCredentials: 'yes' }), {});
  assert.deepEqual(sanitizeFetchOptions(null), {});
});
