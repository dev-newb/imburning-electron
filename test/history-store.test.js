'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { JsonlHistoryStore, DAY_MS, scopeDirectoryName } = require('../src/history-store');

async function temporaryStore(t, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'burnwatch-history-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new JsonlHistoryStore({ baseDir: root, ...options });
  await store.init();
  return { root, store };
}

test('append and read preserve nulls and real zero', async (t) => {
  const now = Date.UTC(2026, 6, 20, 12);
  const { store } = await temporaryStore(t, { now: () => now });
  await store.append('org-a', { timestamp: now - 1000, session: 0, codex: null });
  await store.append('org-a', { timestamp: now, session: 5 });
  assert.deepEqual(await store.read('org-a', { refresh: true }), [
    { timestamp: now - 1000, session: 0, codex: null },
    { timestamp: now, session: 5 }
  ]);
});

test('read ignores malformed trailing JSONL records', async (t) => {
  const now = Date.UTC(2026, 6, 20, 12);
  const { root, store } = await temporaryStore(t, { now: () => now });
  const dir = path.join(root, scopeDirectoryName('org-a'));
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, '2026-07-20.jsonl'), `${JSON.stringify({ timestamp: now, weekly: 2 })}\n{"timestamp":`, 'utf8');
  assert.deepEqual(await store.read('org-a', { refresh: true }), [{ timestamp: now, weekly: 2 }]);
});

test('migration is idempotent and capped to newest retained samples', async (t) => {
  const now = Date.UTC(2026, 6, 20, 12);
  const { store } = await temporaryStore(t, { now: () => now, retentionDays: 8, maxSamples: 3 });
  const legacy = [
    { timestamp: now - 9 * DAY_MS, weekly: 1 },
    { timestamp: now - 3000, weekly: 2 },
    { timestamp: now - 2000, weekly: 3 },
    { timestamp: now - 1000, weekly: 4 },
    { timestamp: now, weekly: 5 }
  ];
  await store.migrate('org-a', legacy);
  await store.migrate('org-a', legacy);
  assert.deepEqual(await store.read('org-a', { refresh: true }), legacy.slice(-3));
});

test('retention prune removes expired day files off the append path', async (t) => {
  const now = Date.UTC(2026, 6, 20, 12);
  const { root, store } = await temporaryStore(t, { now: () => now, retentionDays: 8 });
  await store.append('org-a', { timestamp: now - 9 * DAY_MS, weekly: 1 }); // expired day file
  await store.append('org-a', { timestamp: now, weekly: 2 });
  const dir = path.join(root, scopeDirectoryName('org-a'));
  // Appends no longer prune inline — both files still exist
  assert.equal((await fs.readdir(dir)).length, 2);
  await store.pruneExpiredFiles('org-a');
  const remaining = await fs.readdir(dir);
  assert.deepEqual(remaining, ['2026-07-20.jsonl']);
  assert.deepEqual(await store.read('org-a', { refresh: true }), [{ timestamp: now, weekly: 2 }]);
});

test('same-timestamp entries with different content both survive dedupe', async (t) => {
  const now = Date.UTC(2026, 6, 20, 12);
  const { store } = await temporaryStore(t, { now: () => now });
  await store.append('org-a', { timestamp: now, weekly: 1 });
  await store.append('org-a', { timestamp: now, weekly: 2 });
  await store.append('org-a', { timestamp: now, weekly: 1 }); // exact duplicate — collapsed
  assert.deepEqual(await store.read('org-a', { refresh: true }), [
    { timestamp: now, weekly: 1 },
    { timestamp: now, weekly: 2 }
  ]);
});

test('organization scopes remain isolated', async (t) => {
  const now = Date.UTC(2026, 6, 20, 12);
  const { store } = await temporaryStore(t, { now: () => now });
  await store.append('org-a', { timestamp: now, weekly: 1 });
  await store.append('org-b', { timestamp: now, weekly: 2 });
  assert.equal((await store.read('org-a'))[0].weekly, 1);
  assert.equal((await store.read('org-b'))[0].weekly, 2);
});
