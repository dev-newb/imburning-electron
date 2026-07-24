'use strict';

const GEMINI_MODEL_PRIORITY = new Map([
  ['gemini-3.6-flash', 0],
  ['gemini-3.5-flash-lite', 1]
]);

function geminiModelLabel(modelId) {
  const parts = String(modelId).replace(/^gemini-/i, '').split('-')
    .map((part) => /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1));
  return `${parts.join(' ')} (daily)`;
}

function geminiModelPriority(modelId) {
  const normalized = String(modelId).toLowerCase();
  if (GEMINI_MODEL_PRIORITY.has(normalized)) return GEMINI_MODEL_PRIORITY.get(normalized);
  if (/pro/i.test(normalized)) return 10;
  return 20;
}

function normalizeGeminiQuota(json) {
  const buckets = json?.buckets || [];
  const limits = [];

  for (const [index, bucket] of buckets.entries()) {
    if (bucket.remainingFraction == null || !bucket.modelId) continue;
    limits.push({
      key: 'm_' + String(bucket.modelId).toLowerCase().replace(/[^a-z0-9]+/g, '_'),
      label: geminiModelLabel(bucket.modelId),
      percent: Math.round((1 - bucket.remainingFraction) * 1000) / 10,
      resetsAt: bucket.resetTime || null,
      _priority: geminiModelPriority(bucket.modelId),
      _index: index
    });
  }

  limits.sort((a, b) => a._priority - b._priority || a._index - b._index);
  for (const limit of limits) {
    delete limit._priority;
    delete limit._index;
  }
  return limits.length ? { source: 'live', limits } : null;
}

module.exports = { geminiModelLabel, normalizeGeminiQuota };
