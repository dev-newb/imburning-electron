'use strict';

// Cache only the current access token's identity; never reuse another login's email.
function createGoogleEmailLookup(fetchJson = fetch) {
  let cachedToken, cachedEmail;
  return async function googleAccountEmail(accessToken) {
    if (!accessToken) return null;
    if (accessToken === cachedToken && cachedEmail) return cachedEmail;
    cachedToken = accessToken;
    cachedEmail = null;
    try {
      const response = await fetchJson('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) return null;
      const body = await response.json();
      const email = typeof body.email === 'string' ? body.email.trim() : '';
      if (!email) return null;
      if (cachedToken === accessToken) cachedEmail = email;
      return email;
    } catch { return null; }
  };
}

module.exports = { createGoogleEmailLookup };
