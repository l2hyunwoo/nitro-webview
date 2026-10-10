import http from 'node:http';
import { pathToFileURL } from 'node:url';

export function createRegressionServer() {
  const requests = [];
  let results = null;
  let interaction = null;
  const server = http.createServer(async (req, res) => {
    const receivedAt = performance.now();
    const url = new URL(req.url, 'http://localhost');
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    const json = value => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'cache-control': 'no-store',
      });
      res.end(JSON.stringify(value));
    };
    if (url.pathname === '/health') return json({ ok: true });
    if (url.pathname === '/requests') return json(requests);
    if (url.pathname === '/interaction') {
      if (req.method === 'POST') {
        try {
          const value = JSON.parse(body);
          if (
            value !== null &&
            (typeof value !== 'object' ||
              typeof value.id !== 'string' ||
              !value.id ||
              value.label !== 'Navigate')
          )
            throw new Error('Unsupported interaction');
          interaction = value;
        } catch {
          res.writeHead(400);
          return res.end('Invalid interaction');
        }
      }
      return json(interaction);
    }
    if (url.pathname === '/results') {
      if (req.method === 'POST') {
        try {
          results = JSON.parse(body);
        } catch {
          res.writeHead(400);
          return res.end('Invalid JSON');
        }
      }
      return json(results);
    }
    if (url.pathname === '/reset') {
      requests.length = 0;
      results = null;
      interaction = null;
      return json({ ok: true });
    }
    const cookieNames = (req.headers.cookie ?? '')
      .split(';')
      .map(part => part.trim().split('=')[0])
      .filter(Boolean);
    const authorizationCount = req.rawHeaders.filter(
      (_, i) =>
        i % 2 === 0 && req.rawHeaders[i].toLowerCase() === 'authorization',
    ).length;
    // Store only fixture markers and cookie names, never credential values.
    requests.push({
      receivedAt,
      path: url.pathname,
      query: url.search,
      method: req.method,
      body,
      cookieNames,
      authorizationMatches: req.headers.authorization === 'fixture-request',
      authorizationCount,
    });
    if (url.pathname === '/seed') {
      res.setHeader(
        'set-cookie',
        'shared-import=fixture; Path=/; SameSite=Lax',
      );
      return json({ ok: true });
    }
    if (url.pathname === '/redirect') {
      res.writeHead(302, {
        location: `/target${url.search}`,
        'cache-control': 'no-store',
      });
      return res.end();
    }
    if (url.pathname.endsWith('-marker')) return json({ ok: true });
    // A slow response must not count toward the navigation decision budget.
    if (url.pathname === '/target')
      await new Promise(resolve => setTimeout(resolve, 300));
    if (url.pathname === '/404') {
      res.writeHead(404, {
        'content-type': 'text/html',
        'cache-control': 'no-store',
      });
      return res.end(
        '<!doctype html><title>missing</title><p>HTTP 404 fixture</p>',
      );
    }
    const metadata = {
      path: url.pathname,
      method: req.method,
      body,
      cookieNames,
      authorizationMatches: req.headers.authorization === 'fixture-request',
      authorizationCount,
    };
    const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>regression fixture</title></head>
<body><p id="marker">JavaScript did not run</p><a id="nav" href="/target${url.search}">Navigate</a>
<script>
function post(value) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(value); }
document.getElementById('marker').textContent = 'JavaScript ran';
if (${url.pathname === '/js-disabled'}) fetch('/inline-marker${url.search}');
window.addEventListener('message', function(event) { post('echo:' + event.data); });
document.addEventListener('message', function(event) { post('echo:' + event.data); });
post('ready:' + JSON.stringify(${JSON.stringify(metadata)}));
</script></body></html>`;
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(page);
  });
  return server;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.REGRESSION_PORT ?? 8098);
  createRegressionServer().listen(port, '0.0.0.0', () =>
    console.log(`regression fixture: ${port}`),
  );
}
