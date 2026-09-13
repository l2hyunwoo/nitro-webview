// Run: node example/scripts/post-verification-server.mjs
// Android device: adb reverse tcp:18965 tcp:18965
import { createServer } from 'node:http';
const port = Number(process.env.PORT ?? 18965);
const escapeHtml = value =>
  String(value).replace(
    /[&<>"']/g,
    c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString('utf8');
  const result = {
    method: request.method,
    body,
    url: request.url,
    contentType: request.headers['content-type'] ?? null,
  };
  console.log(JSON.stringify(result));
  response.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(
    `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:20px system-ui;padding:20px;background:#effaf3;color:#12342a}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Server received ${escapeHtml(result.method)}</h1><pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`,
  );
}).listen(port, '0.0.0.0', () =>
  console.log(`POST verification listening on ${port}`),
);
