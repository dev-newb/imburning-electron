'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeHiddenSeries, sanitizeFetchOptions, migrateHiddenSeriesLabels } = require('../src/settings-validation');

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

test('legacy chart-legend label keys migrate to stable series ids', () => {
  assert.deepEqual(migrateHiddenSeriesLabels({
    'CLA 5H': true,             // legacy label
    'Codex CLI': true,          // legacy label
    'Fable': true,              // legacy scoped label
    'provider:gemini': true,    // already new-style — untouched
    '→ 100% junk!': true        // legacy junk — dropped
  }), {
    'claude:session': true,
    'provider:codexCli': true,
    'scoped:fable': true,
    'provider:gemini': true
  });
});

test('hidden-series migration is a no-op for already-migrated maps', () => {
  const migrated = { 'claude:weekly': true, 'scoped:fable': true };
  assert.deepEqual(migrateHiddenSeriesLabels(migrated), migrated);
});
