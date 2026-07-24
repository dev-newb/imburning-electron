'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const packageJson = require('../package.json');

test('production package excludes development-only tests and tools', () => {
  assert.ok(packageJson.build.files.includes('!test/**'));
  assert.ok(packageJson.build.files.includes('!tools/**'));
});
