'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createGoogleEmailLookup } = require('../src/google-account-email');

test('Google email lookup uses the quota token and cannot carry an email between accounts', async () => {
  const calls = [];
  const lookup = createGoogleEmailLookup(async (url, options) => {
    assert.equal(url, 'https://www.googleapis.com/oauth2/v3/userinfo');
    const token = options.headers.Authorization;
    calls.push(token);
    return { ok: true, json: async () => ({ email: token === 'Bearer first' ? 'alex@example.com' : 'jamie@example.com' }) };
  });
  assert.equal(await lookup('first'), 'alex@example.com');
  assert.equal(await lookup('first'), 'alex@example.com');
  assert.equal(await lookup('second'), 'jamie@example.com');
  assert.deepEqual(calls, ['Bearer first', 'Bearer second']);
});

test('unavailable Google identity stays unknown and can recover on the next fetch', async () => {
  for (const failure of [null, { ok: false }, { ok: true, json: async () => ({}) }, { ok: true, json: async () => ({ email: ' ' }) }]) {
    let response = { ok: true, json: async () => ({ email: 'alex@example.com' }) };
    const lookup = createGoogleEmailLookup(async () => { if (!response) throw new Error('offline'); return response; });
    assert.equal(await lookup('first'), 'alex@example.com');
    response = failure;
    assert.equal(await lookup('second'), null);
    response = { ok: true, json: async () => ({ email: 'jamie@example.com' }) };
    assert.equal(await lookup('second'), 'jamie@example.com');
  }
});
