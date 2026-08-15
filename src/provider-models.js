'use strict';

// Owner-confirmed display order: Pro pools first (still the premium tier,
// even when the version number is older), then the current Flash models,
// then unknown/future buckets in API order.
const GEMINI_MODEL_PRIORITY = new Map([
  ['gemini-3.6-flash', 10],
  ['gemini-3.5-flash-lite', 11]
]);

function geminiModelLabel(modelId) {
  const parts = String(modelId).replace(/^gemini-/i, '').split('-')
    .map((part) => /^\d/.test(part) ? part : part.charAt(0).toUpperCase() + part.slice(1));
  // "(1D)" not "(daily)" — Google meters many model versions at once and the
  // long suffix crowded labels into the bars (owner-requested).
  return `${parts.join(' ')} (1D)`;
}

function geminiModelPriority(modelId) {
  const normalized = String(modelId).toLowerCase();
  if (/pro/i.test(normalized)) return 0;
  if (GEMINI_MODEL_PRIORITY.has(normalized)) return GEMINI_MODEL_PRIORITY.get(normalized);
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

// ---- Antigravity (agy CLI) model quota --------------------------------------
// Antigravity's fetchAvailableModels returns the WHOLE model catalogue the
// account can call (Gemini + Claude + GPT-OSS), each optionally carrying a
// { quotaInfo: { remainingFraction, resetTime } }. This is the only surface
// that meters agent usage — the plain Code Assist retrieveUserQuota shows just
// the four free-tier buckets, all unused. We keep the Google section coherent
// by rendering only the Gemini pools here; the Claude/GPT-OSS-via-Antigravity
// pools are returned separately under `.foreign` for a caller that wants them.
// Effort tiers (High/Low/Medium/Tiered…) are reasoning-effort variants that
// share one quota pool, so collapse them to the base model — "Gemini 3.1 Pro",
// not three rows. Capability suffixes that ARE a distinct model/pool (Image,
// Thinking) are kept.
const AG_EFFORT_SUFFIX = /\s*\((?:high|low|medium|extra low|tiered|standard)\)\s*$/i;
function antigravityLabel(displayName, modelId) {
  const dn = (displayName || '').trim().replace(AG_EFFORT_SUFFIX, '');
  if (dn) return dn;
  const stem = String(modelId).replace(/^gemini-/i, '').replace(/-(high|low|medium|agent|tiered)$/i, '')
    .split('-').map((p) => /^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
  // Keep the family prefix the displayName would have carried, so a model
  // missing one doesn't render as a bare "3.6 Flash" next to "Gemini 3.6 Flash".
  return /^gemini-/i.test(modelId) ? `Gemini ${stem}` : stem;
}

function antigravityPriority(label) {
  const l = label.toLowerCase();
  if (/\bpro\b/.test(l)) return 0;       // Pro pools first (premium tier)
  if (/\bflash\b/.test(l) && !/lite/.test(l)) return 10;
  if (/lite/.test(l)) return 11;
  return 20;
}

// Group by the QUOTA ITSELF (remainingFraction + resetTime), not by model name.
// Antigravity meters a whole family against one shared allowance — as of
// 2026-08-12 all 20 Gemini entries report an identical fraction and reset, and
// the Claude/GPT-OSS entries share a second one. Rendering per model would draw
// eight identical bars for what is really one pool. Grouping by signature also
// degrades correctly if Google later splits the allowance: distinct quotas
// simply become distinct rows.
// Antigravity meters on a rolling ~5-hour window, not the daily one the
// classic Code Assist buckets use — measured from live resetTime values, which
// land exactly 5h after the observed snapshot. Stated on every row so the
// renderer sizes its elapsed ring from data instead of guessing off the key
// prefix, which cannot tell the two Google surfaces apart.
const AG_WINDOW_MINUTES = 5 * 60;

function antigravityGroups(entries, familyLabel) {
  const groups = new Map();
  for (const e of entries) {
    const sig = `${e.percent}|${e.resetsAt || ''}`;
    if (!groups.has(sig)) groups.set(sig, { percent: e.percent, resetsAt: e.resetsAt, names: new Set() });
    groups.get(sig).names.add(e.label);
  }
  const only = groups.size === 1;
  return [...groups.values()].map((g) => {
    const names = [...g.names].sort();
    const label = names.length === 1 ? names[0]
      : only ? familyLabel
      : `${names[0]} +${names.length - 1}`;
    return {
      key: 'm_' + label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/_+$/, ''),
      label,
      percent: g.percent,
      resetsAt: g.resetsAt,
      windowMinutes: AG_WINDOW_MINUTES,
      _p: antigravityPriority(names.join(' '))
    };
  }).sort((a, b) => a._p - b._p || a.label.localeCompare(b.label))
    .map(({ _p, ...rest }) => rest);
}

function normalizeAntigravityModels(json) {
  const models = (json && json.models) || {};
  const gemini = [];
  for (const [modelId, m] of Object.entries(models)) {
    const qi = m && m.quotaInfo;
    if (!qi) continue;
    if (/^(chat_|tab_)/i.test(modelId)) continue; // internal editor pseudo-models
    if (!qi.resetTime) continue; // unmetered helpers report a bare fraction of 1
    // The Google section tracks GOOGLE models. Antigravity's catalogue also
    // meters Claude and GPT-OSS against a separate allowance, and those are
    // dropped here rather than downstream — they are Anthropic's and OpenAI's
    // models, and no filter further along can be forgotten if the rows never
    // exist. (They previously rode along in this array and, being invisible
    // to the UI but visible to every reducer over it, drove the Google tray
    // badge, history series and burn alerts.)
    const isGemini = /^gemini/i.test(modelId) || /gemini/i.test(m.displayName || '');
    if (!isGemini) continue;
    // A METERED pool (it has a resetTime) with no remainingFraction is
    // exhausted, not unknown: this is a proto-backed JSON API, and proto3
    // omits a scalar sitting at its default — so 0.0 remaining can arrive as
    // an absent field. Dropping it would hide the row at exactly the moment
    // the widget exists to warn about, and with every Gemini pool sharing one
    // allowance, dropping them all reverts the section to a stale snapshot.
    const remaining = isFinite(qi.remainingFraction) ? qi.remainingFraction : 0;
    const entry = {
      label: antigravityLabel(m.displayName, modelId),
      percent: Math.round((1 - remaining) * 1000) / 10,
      resetsAt: qi.resetTime
    };
    gemini.push(entry);
  }
  const limits = antigravityGroups(gemini, 'Gemini (all models)');
  if (!limits.length) return null;
  return { source: 'antigravity', limits };
}

module.exports = { geminiModelLabel, normalizeGeminiQuota, normalizeAntigravityModels };
