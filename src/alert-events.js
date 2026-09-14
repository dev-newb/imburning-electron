'use strict';
// Shared with the Tauri backend: one claim ledger and a bounded diagnostic log.
// Only hashes, pool names, numbers and reasons reach disk; no account identifiers.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const COOLDOWN_MS = 10 * 60 * 1000;
const LOG_LIMIT = 1024 * 1024;

async function alertSoundEvent(root, app, request, now = Date.now()) {
  if (!['reset', 'banked', 'wall', 'burn'].includes(request?.kind)
      || !['claim', 'played', 'failed', 'disabled', 'preview'].includes(request?.phase)) return { play: false };
  const events = (Array.isArray(request.events) ? request.events : []).slice(0, 32).filter(e =>
    typeof e?.key === 'string' && e.key.length <= 2048).map(e => ({
    id: crypto.createHash('sha256').update(e.shared === false ? app + ':' + e.key : e.key).digest('hex'),
    pool: String(e.pool || '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 100),
    reason: ['scheduled', 'early', 'credit-increase'].includes(e.reason) ? e.reason : 'unknown',
    ...Object.fromEntries(['from', 'to', 'previousResetAt', 'resetAt', 'observedAt'].map(k =>
      [k, typeof e[k] === 'number' && Number.isFinite(e[k]) ? e[k] : null]))
  }));
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const lock = path.join(root, 'lock');
  let acquired = false;
  for (let n = 0; n < 100; n++) {
    try { fs.mkdirSync(lock); acquired = true; break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // Recover a lock left by a process that died. The critical section is
      // synchronous and normally takes milliseconds, never a network await.
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 60000) fs.rmdirSync(lock); } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  if (!acquired) throw new Error('Sound event ledger is busy');
  try {
    const file = path.join(root, 'claims.json');
    let ledger = {};
    try { ledger = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) {}
    if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) ledger = {};
    for (const [id, claim] of Object.entries(ledger)) {
      if (!Number.isFinite(claim?.at) || now - claim.at >= COOLDOWN_MS || claim.at > now + COOLDOWN_MS) delete ledger[id];
    }
    let play = false;
    for (const event of events) {
      if (request.phase === 'claim') {
        event.decision = ledger[event.id] ? 'duplicate' : 'claimed';
        if (!ledger[event.id]) { ledger[event.id] = { at: now, app }; play = true; }
      } else if (request.phase === 'failed' && ledger[event.id]?.app === app) {
        delete ledger[event.id];
      }
    }
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(ledger), { mode: 0o600 });
    fs.renameSync(tmp, file);
    const log = path.join(root, 'events.jsonl');
    try {
      if (fs.statSync(log).size >= LOG_LIMIT) {
        fs.rmSync(log + '.1', { force: true }); fs.renameSync(log, log + '.1');
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    fs.appendFileSync(log, JSON.stringify({ at: now, app, kind: request.kind, phase: request.phase, events }) + '\n', { mode: 0o600 });
    return { play };
  } finally { fs.rmdirSync(lock); }
}
module.exports = { alertSoundEvent };
