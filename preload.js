const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed preloads may only require Electron and a small built-in subset.
// Keep this tiny sanitizer local and validate again in the main process.
function sanitizeFetchOptions(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const sanitized = {};
  if (value.forceExtended === true) sanitized.forceExtended = true;
  if (value.forceProviders === true) sanitized.forceProviders = true;
  if (value.refreshLocalCredentials === true) sanitized.refreshLocalCredentials = true;
  return sanitized;
}

// Allowed domains for openExternal — prevents renderer from opening arbitrary URLs
const ALLOWED_EXTERNAL_DOMAINS = [
  'claude.ai',
  'github.com',
  'paypal.me',
  'buymeacoffee.com'
];

function isAllowedExternalUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    return ALLOWED_EXTERNAL_DOMAINS.some(domain =>
      parsed.hostname === domain || parsed.hostname.endsWith('.' + domain)
    );
  } catch {
    return false;
  }
}

contextBridge.exposeInMainWorld('electronAPI', {
  // Credentials management. The renderer only ever sees login STATE — the
  // whole detect/validate/store login flow runs inside the main process.
  getCredentials: () => ipcRenderer.invoke('get-credentials'),
  anthropicLogin: () => ipcRenderer.invoke('anthropic-login'),
  setOrganization: (orgId) => ipcRenderer.invoke('set-organization', String(orgId || '')),
  deleteCredentials: () => ipcRenderer.invoke('delete-credentials'),

  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  resizeWindow: (height, force, fitPreset, userAction) => ipcRenderer.send('resize-window', height, force, fitPreset, userAction === true),
  fitLandscapeWidth: (width) => ipcRenderer.send('fit-landscape-width', Number(width) || 0),
  setMinHeight: (h) => ipcRenderer.send('set-min-height', h),

  // Window position
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  setWindowPosition: (position) => ipcRenderer.invoke('set-window-position', position),

  // Event listeners
  onRefreshUsage: (callback) => {
    ipcRenderer.on('refresh-usage', () => callback());
  },
  onSessionExpired: (callback) => {
    ipcRenderer.on('session-expired', () => callback());
  },
  onAnthropicDegraded: (callback) => {
    ipcRenderer.on('anthropic-fetch-degraded', (event, degraded) => callback(degraded === true));
  },
  onWindowUserSized: (callback) => {
    ipcRenderer.on('window-user-sized', (event, userSized) => callback(userSized));
  },

  // API
  fetchUsageData: (options = {}) => ipcRenderer.invoke('fetch-usage-data', sanitizeFetchOptions(options)),
  getUsageHistory: () => ipcRenderer.invoke('get-usage-history'),
  exportHistory: (format) => ipcRenderer.invoke('export-history', format),
  openExternal: (url) => {
    if (isAllowedExternalUrl(url)) {
      ipcRenderer.send('open-external', url);
    } else {
      console.warn('openExternal blocked — URL not in allowlist:', url);
    }
  },

  // Platform
  platform: process.platform,
  isPortable: process.platform === 'win32' && !!process.env.PORTABLE_EXECUTABLE_FILE,

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Alert sounds
  pickSoundFile: () => ipcRenderer.invoke('pick-sound-file'),
  readSoundFile: (filePath) => ipcRenderer.invoke('read-sound-file', filePath),

  // Updates
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateDownloaded: (callback) => {
    ipcRenderer.on('update-downloaded', (event, version) => callback(version));
  },
  installUpdate: () => ipcRenderer.send('install-update'),
  runMacUpdate: () => ipcRenderer.send('run-mac-update'),

  // Notifications
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  setCliAdopted: (provider, adopted) => ipcRenderer.invoke('set-cli-adopted', provider, adopted),
  sendAlertWebhook: (event, title, message) => ipcRenderer.send('alert-webhook', { event, title, message }),

  // Compact mode
  setCompactMode: (compact) => ipcRenderer.send('set-compact-mode', compact),

  // Settings window fit (grow to show all settings) / restore prior window
  settingsFit: (height) => ipcRenderer.send('settings-fit', height),
  settingsRestore: (options) => ipcRenderer.send('settings-restore', options || {}),

  // Wide / tall window presets
  applyWindowPreset: (preset) => ipcRenderer.send('apply-window-preset', preset),

  // Detachable graph window
  openGraphWindow: () => ipcRenderer.send('open-graph-window'),
  closeGraphWindow: () => ipcRenderer.send('close-graph-window'),
  isGraphWindowOpen: () => ipcRenderer.invoke('is-graph-window-open'),
  getLatestUsage: () => ipcRenderer.invoke('get-latest-usage'),
  graphSetAlwaysOnTop: (flag) => ipcRenderer.send('graph-set-always-on-top', flag),
  graphGetAlwaysOnTop: () => ipcRenderer.invoke('graph-get-always-on-top'),
  onUsageUpdated: (callback) => { ipcRenderer.on('usage-updated', () => callback()); },
  onGraphSettingsUpdated: (callback) => { ipcRenderer.on('graph-settings-updated', () => callback()); },
  onGraphWindowClosed: (callback) => { ipcRenderer.on('graph-window-closed', () => callback()); },

  // Official OAuth connect flows (OpenAI / Google)
  oauthConnect: (provider) => ipcRenderer.invoke('oauth-connect', provider),
  oauthDisconnect: (provider) => ipcRenderer.invoke('oauth-disconnect', provider)
});
