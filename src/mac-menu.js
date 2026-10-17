'use strict';

// Keep the legacy Electron identity for storage/Keychain compatibility; native
// menu labels and the About panel have their own public display name.
function installMacMenu({ app, Menu, platform = process.platform }) {
  if (platform !== 'darwin') return;
  const name = "I'm Burning";
  app.setAboutPanelOptions({ applicationName: name });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: name, submenu: [
      { role: 'about', label: `About ${name}` },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: `Hide ${name}` },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit', label: `Quit ${name}` }
    ] },
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ]));
}

module.exports = { installMacMenu };
