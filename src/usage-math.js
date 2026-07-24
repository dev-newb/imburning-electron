'use strict';

const DEFAULT_REFRESH_SECONDS = 300;
const MIN_SAMPLE_GAP_MS = 3 * 60 * 1000;
const SAMPLE_GAP_MULTIPLIER = 2.5;

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sampleGapLimitMs(refreshSeconds, {
  floorMs = MIN_SAMPLE_GAP_MS,
  multiplier = SAMPLE_GAP_MULTIPLIER
} = {}) {
  const parsed = Number.parseInt(refreshSeconds, 10);
  const seconds = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_REFRESH_SECONDS;
  return Math.max(floorMs, Math.round(seconds * 1000 * multiplier));
}

function positiveBurn(history, pick, {
  start = -Infinity,
  end = Infinity,
  maxGapMs = sampleGapLimitMs(DEFAULT_REFRESH_SECONDS)
} = {}) {
  let burn = 0;
  for (let i = 1; i < history.length; i++) {
    const current = history[i];
    const previous = history[i - 1];
    if (current.timestamp < start || current.timestamp >= end || previous.timestamp < start) continue;
    const dt = current.timestamp - previous.timestamp;
    if (dt <= 0 || dt > maxGapMs) continue;
    const currentValue = finiteOrNull(pick(current));
    const previousValue = finiteOrNull(pick(previous));
    if (currentValue == null || previousValue == null) continue;
    const delta = currentValue - previousValue;
    if (delta > 0) burn += delta;
  }
  return burn;
}

function latestContiguousRun(samples, maxGapMs = sampleGapLimitMs(DEFAULT_REFRESH_SECONDS)) {
  const valid = Array.isArray(samples)
    ? samples.filter((sample) => sample
      && Number.isFinite(sample.t)
      && finiteOrNull(sample.v) != null)
    : [];
  if (valid.length < 2) return valid;

  let start = 0;
  for (let i = 1; i < valid.length; i++) {
    const dt = valid[i].t - valid[i - 1].t;
    if (dt <= 0 || dt > maxGapMs || valid[i].v < valid[i - 1].v) start = i;
  }
  return valid.slice(start);
}

function isExplicitAuthFailure(value) {
  if (!value || typeof value !== 'object') return false;
  const status = Number(value.statusCode ?? value.status);
  if (status === 401 || status === 403) return true;
  const error = value.error && typeof value.error === 'object' ? value.error : {};
  const code = String(value.code ?? error.code ?? '').toLowerCase();
  if (['unauthorized', 'forbidden', 'invalid_session', 'session_expired', 'authentication_required'].includes(code)) return true;
  const message = String(value.message ?? error.message ?? (typeof value.error === 'string' ? value.error : '')).toLowerCase();
  return /\b(unauthori[sz]ed|session expired|invalid session|authentication required)\b/.test(message);
}

module.exports = {
  DEFAULT_REFRESH_SECONDS,
  MIN_SAMPLE_GAP_MS,
  SAMPLE_GAP_MULTIPLIER,
  finiteOrNull,
  sampleGapLimitMs,
  positiveBurn,
  latestContiguousRun,
  isExplicitAuthFailure
};
