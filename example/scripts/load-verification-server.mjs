// Run: node example/scripts/load-verification-server.mjs
// Android device: adb reverse tcp:18966 tcp:18966; use http://127.0.0.1:18966.
import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 18966);
createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('Cache-Control', 'no-store');
  if (path === '/slow.js') {
    response.setHeader('Content-Type', 'text/javascript');
    setTimeout(() => response.end('document.body.dataset.ready = "yes"'), 2400);
    return;
  }
  if (path === '/slow.svg') {
    response.setHeader('Content-Type', 'image/svg+xml');
    setTimeout(
      () =>
        response.end(
          '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="80"><rect width="300" height="80" fill="#21a179"/><text x="20" y="48" fill="white" font-size="22">Native load finished</text></svg>',
        ),
      3200,
    );
    return;
  }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  if (path === '/404') {
    response.writeHead(404);
    response.end(
      '<html><title>HTTP 404</title><body style="font:24px sans-serif;padding:24px">HTTP 404: onHttpError, then onLoadEnd. No onLoad.</body></html>',
    );
    return;
  }
  response.write(
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Delayed native load</title></head><body style="font:20px sans-serif;padding:16px"><h3>Loading native resources…</h3>',
  );
  setTimeout(
    () =>
      response.end(
        '<script src="/slow.js"></script><img src="/slow.svg"></body></html>',
      ),
    1000,
  );
}).listen(port, '0.0.0.0', () =>
  console.log(`Load verification server: http://127.0.0.1:${port}`),
);
