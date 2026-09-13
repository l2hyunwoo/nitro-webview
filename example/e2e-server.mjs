// Tiny stdlib-only HTTP server for the WebView E2E harness. No deps (node:http).
// Serves controlled pages the harness tests drive:
//   /          200 HTML page that postMessages 'loaded' and echoes back injected messages
//   /notfound  404 route (drives onHttpError)
//   /health    200 readiness probe for the CI start-up poll
import http from 'node:http'

const PORT = Number(process.env.E2E_PORT || 8099)

const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>e2e</title></head>
<body><h1 id="ready">ready</h1>
<script>
  function post(msg){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg); }
  // native -> web postMessage(data) surfaces as a DOM 'message' event. Listen on
  // both targets for portability (window on iOS, document on Android), echo it back.
  window.addEventListener('message', function(e){ post('echo:' + e.data); });
  document.addEventListener('message', function(e){ post('echo:' + e.data); });
  post('loaded');
</script></body></html>`

const server = http.createServer((req, res) => {
  const url = req.url || '/'
  if (url === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('ok')
    return
  }
  if (url === '/notfound') {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
    return
  }
  if (url === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(PAGE)
    return
  }
  res.writeHead(404, { 'content-type': 'text/plain' })
  res.end('not found')
})

// Bind 0.0.0.0 so the Android emulator can reach it via 10.0.2.2 while the iOS
// simulator and the CI health poll use 127.0.0.1.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`e2e-server on http://0.0.0.0:${PORT}`)
})
