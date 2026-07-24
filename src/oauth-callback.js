'use strict';

const http = require('http');

const PAGE_STYLE = 'font-family:sans-serif;background:#1e1e2e;color:#e0e0e0;display:flex;align-items:center;justify-content:center;height:100vh';

function page(title, message) {
  return `<html><meta charset="utf-8"><body style="${PAGE_STYLE}"><div style="text-align:center"><h2>${title}</h2><p>${message}</p></div></body></html>`;
}

function startOAuthCallbackServer({ port, pathName, state, timeoutMs = 5 * 60 * 1000, logger = () => {} }) {
  return new Promise((resolveListen, rejectListen) => {
    let settled = false;
    let listening = false;
    const servers = [];
    let resolveResult;
    let rejectResult;
    const resultPromise = new Promise((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    // A bind failure happens before the caller can receive resultPromise.
    // Mark it handled here while preserving rejection for normal awaiters.
    resultPromise.catch(() => {});
    const closeAll = () => {
      for (const server of servers) {
        try { server.close(); } catch {}
      }
    };
    const respond = (res, status, title, message) => {
      if (res.writableEnded) return;
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(page(title, message));
    };
    const finishFailure = (res, status, title, message, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      respond(res, status, title, message);
      setTimeout(closeAll, 100);
      rejectResult(error);
    };

    const handler = (req, res) => {
      let url;
      try {
        url = new URL(req.url, 'http://127.0.0.1');
      } catch {
        respond(res, 400, 'Burnwatch connection failed', 'The callback URL was invalid. Return to Burnwatch and try again.');
        return;
      }
      if (url.pathname !== pathName) {
        respond(res, 404, 'Not found', 'This is not a Burnwatch OAuth callback.');
        return;
      }
      if (settled) {
        respond(res, 409, 'Burnwatch connection already handled', 'Return to Burnwatch to continue.');
        return;
      }

      const gotState = url.searchParams.get('state');
      if (!gotState || gotState !== state) {
        // A stray or hostile localhost request must not consume the real flow.
        respond(res, 400, 'Burnwatch connection rejected', 'The security state did not match. Return to Burnwatch and try again.');
        return;
      }

      const providerError = url.searchParams.get('error');
      if (providerError) {
        finishFailure(
          res,
          400,
          'Burnwatch was not connected',
          'The provider declined or cancelled the login. You can close this tab.',
          new Error(`Login refused: ${providerError}`)
        );
        return;
      }

      const code = url.searchParams.get('code');
      if (!code) {
        finishFailure(
          res,
          400,
          'Burnwatch was not connected',
          'No authorization code was returned. You can close this tab and try again.',
          new Error('Invalid OAuth callback: missing authorization code')
        );
        return;
      }

      settled = true;
      clearTimeout(timer);
      let completed = false;
      resolveResult({
        code,
        complete({ ok, message } = {}) {
          if (completed) return;
          completed = true;
          if (ok) {
            respond(res, 200, 'Burnwatch connected ✓', 'You can close this tab and return to the widget.');
          } else {
            respond(res, 500, 'Burnwatch was not connected', message || 'The token exchange failed. Return to Burnwatch and try again.');
          }
          setTimeout(closeAll, 100);
        }
      });
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      closeAll();
      rejectResult(new Error('Login timed out (5 minutes)'));
    }, timeoutMs);

    const v4 = http.createServer(handler);
    servers.push(v4);
    v4.on('error', (error) => {
      if (listening) {
        logger('[OAuth] Callback server error:', error.message);
        return;
      }
      settled = true;
      clearTimeout(timer);
      closeAll();
      rejectResult(error);
      rejectListen(new Error(`Callback port busy: ${error.message}`));
    });
    v4.listen(port, '127.0.0.1', () => {
      listening = true;
      const boundPort = v4.address().port;
      const v6 = http.createServer(handler);
      servers.push(v6);
      v6.on('error', (error) => logger('[OAuth] ::1 twin bind skipped:', error.message));
      try { v6.listen(boundPort, '::1'); } catch (error) { logger('[OAuth] ::1 twin bind failed:', error.message); }
      resolveListen({ port: boundPort, resultPromise, close: closeAll });
    });
  });
}

module.exports = { startOAuthCallbackServer };
