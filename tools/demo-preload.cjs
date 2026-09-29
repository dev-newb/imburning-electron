const { contextBridge, ipcRenderer } = require('electron');
// Demo-only bridge: never reads credentials, history, or settings from disk.
const api = { platform: 'darwin', isPortable: false };
for (const name of ['getCredentials', 'getSettings', 'saveSettings', 'fetchUsageData', 'getUsageHistory', 'getAppVersion', 'checkForUpdate', 'isGraphWindowOpen', 'getLatestUsage', 'getWindowBounds', 'graphGetAlwaysOnTop', 'alertSoundEvent']) {
  api[name] = (...args) => ipcRenderer.invoke('demo', name, ...args);
}
for (const name of ['onRefreshUsage', 'onSessionExpired', 'onAnthropicDegraded', 'onWindowUserSized', 'onGraphSettingsUpdated', 'onGraphWindowClosed', 'onUpdateDownloaded', 'onUsageUpdated']) api[name] = () => {};
for (const name of ['resizeWindow', 'fitLandscapeWidth', 'setMinHeight', 'showNotification', 'sendAlertWebhook', 'minimizeWindow', 'setCompactMode', 'settingsFit', 'settingsRestore', 'applyWindowPreset', 'openGraphWindow', 'closeGraphWindow', 'closeWindow', 'openExternal']) api[name] = () => {};
contextBridge.exposeInMainWorld('electronAPI', api);
