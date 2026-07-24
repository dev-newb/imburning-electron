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

module.exports = { sanitizeHiddenSeries, sanitizeFetchOptions };
