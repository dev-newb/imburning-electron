'use strict';

function sanitizeHiddenSeries(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([key, hidden]) => typeof key === 'string'
      && key.length > 0
      && key.length <= 80
      && hidden === true)
    .slice(0, 100));
}

function sanitizeFetchOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const sanitized = {};
  if (value.forceExtended === true) sanitized.forceExtended = true;
  if (value.forceProviders === true) sanitized.forceProviders = true;
  if (value.refreshLocalCredentials === true) sanitized.refreshLocalCredentials = true;
  return sanitized;
}

// v2.1.1 persisted chart legend visibility under dataset LABELS; the current
// charts key it by stable seriesId. Translate stored legacy keys once so an
// upgrader's hidden series stay hidden instead of silently reappearing.
const LEGACY_LABEL_TO_SERIES_ID = {
  'CLA 5H': 'claude:session',
  'CLA 7D': 'claude:weekly',
  'Sonnet': 'anthropic:sonnet',
  'Opus': 'anthropic:opus',
  'Cowork': 'anthropic:cowork',
  'Design': 'anthropic:design',
  'OAuth Apps': 'anthropic:oauth-apps',
  'Extra Usage': 'anthropic:extra-usage',
  'Codex': 'provider:codex',
  'Gemini': 'provider:gemini',
  'Claude CLI': 'provider:claudeCli',
  'Codex CLI': 'provider:codexCli',
  'Gemini CLI': 'provider:geminiCli'
};

function migrateHiddenSeriesLabels(value) {
  const source = sanitizeHiddenSeries(value);
  const migrated = {};
  for (const key of Object.keys(source)) {
    // New-style keys always carry a namespace separator.
    if (key.includes(':')) { migrated[key] = true; continue; }
    const mapped = LEGACY_LABEL_TO_SERIES_ID[key];
    if (mapped) { migrated[mapped] = true; continue; }
    // Scoped pools were labelled with their capitalized slug words ("Fable").
    // Anything else (old projection/marker text) is dropped as junk.
    if (/^[A-Za-z0-9][A-Za-z0-9 ]*$/.test(key)) {
      migrated['scoped:' + key.trim().toLowerCase().replace(/\s+/g, '_')] = true;
    }
  }
  return migrated;
}

module.exports = { sanitizeHiddenSeries, sanitizeFetchOptions, migrateHiddenSeriesLabels };
