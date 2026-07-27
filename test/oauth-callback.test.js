'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startOAuthCallbackServer } = require('../src/oauth-callback');

function request(port, target) {
  let ended = false;
  const responsePromise = new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: target }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { ended = true; resolve({ status: res.statusCode, body }); });
    });
    req.on('error', reject);
  });
  return { responsePromise, hasEnded: () => ended };
}

test('wrong OAuth state is rejected without consuming the valid callback', async () => {
  const callback = await startOAuthCallbackServer({ port: 0, pathName: '/callback', state: 'expected', timeoutMs: 5000 });
  const wrong = await request(callback.port, '/callback?state=wrong&code=bad').responsePromise;
  assert.equal(wrong.status, 400);

  const validRequest = request(callback.port, '/callback?state=expected&code=good');
  const result = await callback.resultPromise;
  assert.equal(result.code, 'good');
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(validRequest.hasEnded(), false);
  result.complete({ ok: true });
  const valid = await validRequest.responsePromise;
  assert.equal(valid.status, 200);
  assert.match(valid.body, /connected/);
});

test('provider rejection produces a failure page and rejects the flow', async () => {
  const callback = await startOAuthCallbackServer({ port: 0, pathName: '/callback', state: 'expected', timeoutMs: 5000 });
  const rejectionRequest = request(callback.port, '/callback?state=expected&error=access_denied');
  await assert.rejects(callback.resultPromise, /Login refused/);
  const response = await rejectionRequest.responsePromise;
  assert.equal(response.status, 400);
  assert.match(response.body, /not connected/);
});

test('login times out and rejects when nobody completes the flow', async () => {
  const callback = await startOAuthCallbackServer({ port: 0, pathName: '/callback', state: 'expected', timeoutMs: 60 });
  await assert.rejects(callback.resultPromise, /timed out/);
});

test('a busy port rejects the listen instead of hanging the flow', async () => {
  const first = await startOAuthCallbackServer({ port: 0, pathName: '/callback', state: 'a', timeoutMs: 200 });
  await assert.rejects(
    startOAuthCallbackServer({ port: first.port, pathName: '/callback', state: 'b', timeoutMs: 200 }),
    /port busy/i
  );
  first.close();
});

test('cancel settles a parked flow and frees its fixed port for a retry', async () => {
  const first = await startOAuthCallbackServer({ port: 0, pathName: '/callback', state: 'a', timeoutMs: 60000 });
  first.cancel('Superseded by a new sign-in attempt');
  await assert.rejects(first.resultPromise, /Superseded/);
  // The whole point: a fresh Connect click can rebind the same port at once,
  // instead of dying on EADDRINUSE for the rest of the old 5-minute window.
  await new Promise((resolve) => setTimeout(resolve, 50));
  const second = await startOAuthCallbackServer({ port: first.port, pathName: '/callback', state: 'b', timeoutMs: 500 });
  assert.equal(second.port, first.port);
  second.cancel();
  await assert.rejects(second.resultPromise, /cancelled/i);
});

test('a callback without an authorization code fails the flow explicitly', async () => {
  const callback = await startOAuthCallbackServer({ port: 0, pathName: '/callback', state: 'expected', timeoutMs: 5000 });
  const bad = request(callback.port, '/callback?state=expected');
  await assert.rejects(callback.resultPromise, /missing authorization code/);
  const response = await bad.responsePromise;
  assert.equal(response.status, 400);
});
