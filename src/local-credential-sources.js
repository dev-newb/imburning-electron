'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const DISCOVERY_CACHE_MS = 5 * 60 * 1000;
const WSL_COMMAND_TIMEOUT_MS = 3000;
let cachedHomes = null;
let cachedAt = 0;

function decodeWslListOutput(stdout) {
  if (!stdout) return '';
  const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  if (!buffer.length) return '';
  const zeroBytes = [...buffer.subarray(0, Math.min(buffer.length, 128))]
    .filter((byte) => byte === 0).length;
  const encoding = zeroBytes >= 2 ? 'utf16le' : 'utf8';
  return buffer.toString(encoding).replace(/^\uFEFF/, '').replace(/\0/g, '');
}

function parseWslDistros(stdout) {
  return decodeWslListOutput(stdout)
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter((name) => name && !/[\\/\0]/.test(name));
}

function linuxHomeToUnc(distro, linuxHome) {
  const cleanHome = String(linuxHome || '').trim();
  if (!distro || /[\\/\0]/.test(distro)) return null;
  if (!cleanHome.startsWith('/') || cleanHome.includes('\0')) return null;
  const parts = cleanHome.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..')) return null;
  return `\\\\wsl.localhost\\${distro}\\${parts.join('\\')}`;
}

function discoverWslHomes({ spawnSyncImpl = spawnSync, platform = process.platform } = {}) {
  if (platform !== 'win32') return [];
  const listed = spawnSyncImpl('wsl.exe', ['--list', '--quiet'], {
    encoding: null,
    windowsHide: true,
    timeout: WSL_COMMAND_TIMEOUT_MS
  });
  if (listed.error || listed.status !== 0) return [];

  const homes = [];
  for (const distro of parseWslDistros(listed.stdout)) {
    const result = spawnSyncImpl('wsl.exe', ['-d', distro, '--', 'printenv', 'HOME'], {
      encoding: 'utf8',
      windowsHide: true,
      timeout: WSL_COMMAND_TIMEOUT_MS
    });
    if (result.error || result.status !== 0) continue;
    const home = linuxHomeToUnc(distro, result.stdout);
    if (home) homes.push({ id: `wsl:${distro}`, kind: 'wsl', distro, home });
  }
  return homes;
}

function discoverCredentialHomes({
  force = false,
  homedir,
  now = Date.now(),
  platform = process.platform,
  spawnSyncImpl = spawnSync
} = {}) {
  const localHome = homedir || require('os').homedir();
  const mayUseCache = !force && !homedir && platform === process.platform
    && spawnSyncImpl === spawnSync;
  if (mayUseCache && cachedHomes && now - cachedAt < DISCOVERY_CACHE_MS) {
    return cachedHomes.map((entry) => ({ ...entry }));
  }

  const homes = [
    { id: 'windows', kind: platform === 'win32' ? 'windows' : 'local', home: path.resolve(localHome) },
    ...discoverWslHomes({ spawnSyncImpl, platform })
  ];
  if (mayUseCache) {
    cachedHomes = homes;
    cachedAt = now;
  }
  return homes.map((entry) => ({ ...entry }));
}

function clearCredentialHomeCache() {
  cachedHomes = null;
  cachedAt = 0;
}

module.exports = {
  decodeWslListOutput,
  parseWslDistros,
  linuxHomeToUnc,
  discoverWslHomes,
  discoverCredentialHomes,
  clearCredentialHomeCache
};
