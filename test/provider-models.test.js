'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { geminiModelLabel, normalizeGeminiQuota } = require('../src/provider-models');

test('Gemini 3.6 Flash and 3.5 Flash-Lite receive stable display labels', () => {
  assert.equal(geminiModelLabel('gemini-3.6-flash'), '3.6 Flash (daily)');
  assert.equal(geminiModelLabel('gemini-3.5-flash-lite'), '3.5 Flash Lite (daily)');
});

test('Gemini rows order Pro first, then current Flash models, keeping future buckets', () => {
  const quota = normalizeGeminiQuota({
    buckets: [
      { modelId: 'gemini-future-experimental', remainingFraction: 0.8, resetTime: 'future' },
      { modelId: 'gemini-2.5-pro', remainingFraction: 0.6, resetTime: 'pro' },
      { modelId: 'gemini-3.5-flash-lite', remainingFraction: 0.5, resetTime: 'lite' },
      { modelId: 'gemini-3.6-flash', remainingFraction: 0.25, resetTime: 'flash' }
    ]
  });

  // Owner-confirmed: Pro stays on top (premium tier), new Flash models next,
  // unknown/future buckets keep API order at the end.
  assert.deepEqual(quota.limits.map((limit) => limit.key), [
    'm_gemini_2_5_pro',
    'm_gemini_3_6_flash',
    'm_gemini_3_5_flash_lite',
    'm_gemini_future_experimental'
  ]);
  assert.equal(quota.limits[0].percent, 40);
  assert.equal(quota.limits.length, 4);
});
