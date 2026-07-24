'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

test('hidden-window response parsing distinguishes JSON from provider block pages', () => {
  const Module = require('node:module');
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return { BrowserWindow: class {} };
    return originalLoad.call(this, request, parent, isMain);
  };
  let parseResponseBody;
  try {
    ({ parseResponseBody } = require('../src/fetch-via-window'));
  } finally {
    Module._load = originalLoad;
  }

  assert.deepEqual(parseResponseBody('{"ok":true}'), { ok: true });
  assert.throws(() => parseResponseBody('<html>Just a moment</html>'), /CloudflareBlocked|UnexpectedHTML/);
  assert.throws(() => parseResponseBody('not json'), /InvalidJSON/);
});
