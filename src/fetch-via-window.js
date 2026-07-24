/**
 * fetch-via-window.js
 *
 * Fetches JSON from a URL using a hidden BrowserWindow.
 *
 * Why this exists:
 * Claude.ai uses Cloudflare protection and detects Electron's default
 * request headers, blocking standard Node.js fetch/http requests.
 * By loading the URL in a hidden BrowserWindow with a spoofed Chrome
 * User-Agent, we ride on the browser session cookies and bypass
 * Cloudflare's bot detection. This is the simplest reliable approach
 * after the previous cookie-database-reading strategy proved too
 * fragile and OS-specific.
 */
const { BrowserWindow } = require('electron');

/**
 * Known error signatures returned when Claude.ai blocks or changes behaviour.
 * If the extracted body matches one of these patterns we throw a specific error
 * so callers can react (e.g. prompt re-login).
 */
const BLOCKED_SIGNATURES = [
  { pattern: 'Just a moment', error: 'CloudflareBlocked' },
  { pattern: 'Enable JavaScript and cookies to continue', error: 'CloudflareChallenge' },
  { pattern: '<html', error: 'UnexpectedHTML' },
];

/**
 * Parse and validate response body text
 * @param {string} bodyText - Raw body text from the page * @returns {Object} Parsed JSON data
 * @throws {Error} If blocked signatures detected or JSON parsing fails
 */
function parseResponseBody(bodyText) {
  // Detect known block/failure signatures before attempting JSON parse.
  // This provides explicit errors when Claude.ai modifies their API or CSP.
  for (const sig of BLOCKED_SIGNATURES) {
    if (bodyText.includes(sig.pattern)) {
      throw new Error(`${sig.error}: ${bodyText.substring(0, 200)}`);
    }
  }

  try {
    return JSON.parse(bodyText);
  } catch (parseErr) {
    throw new Error('InvalidJSON: ' + bodyText.substring(0, 200));
  }
}

/**
 * Fetch a single URL using a dedicated BrowserWindow (legacy single-call approach)
 * @param {string} url - URL to fetch
 * @param {Object} options - Options object
 * @param {number} options.timeoutMs - Request timeout in milliseconds (default: 30000)
 * @returns {Promise<Object>} Parsed JSON response
 */
function fetchViaWindow(url, { timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    });

    const timeout = setTimeout(() => {
      win.close();
      reject(new Error('Request timeout'));
    }, timeoutMs);

    win.webContents.on('did-finish-load', async () => {
      try {
        const bodyText = await win.webContents.executeJavaScript(
          'document.body.innerText || document.body.textContent'
        );
        clearTimeout(timeout);
        win.close();

        const data = parseResponseBody(bodyText);
        resolve(data);
      } catch (err) {
        clearTimeout(timeout);
        win.close();
        reject(err);
      }
    });

    win.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      clearTimeout(timeout);
      win.close();
      reject(new Error(`LoadFailed: ${errorCode} ${errorDescription}`));
    });

    win.loadURL(url);
  });
}

module.exports = { fetchViaWindow, parseResponseBody };
