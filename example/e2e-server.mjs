// Tiny stdlib-only HTTP server for the WebView E2E harness. No deps (node:http).
// Serves controlled pages the harness tests drive:
//   /          200 HTML page that postMessages 'loaded' and echoes back injected messages
//   /notfound  404 route (drives onHttpError)
//   /long      tall page for programmatic native scroll assertions
//   /download  UTF-8 attachment for the download panel
//   /slow      8s delayed page for stopLoading
//   /cache     cacheable page for the settings panel
//   /health    200 readiness probe for the CI start-up poll
import { Buffer } from 'node:buffer'
import http from 'node:http'
import { pathToFileURL } from 'node:url'

export const DOWNLOAD_TEXT = 'Nitro WebView download: 한글 😀\n'

const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>e2e</title></head>
<body><h1 id="ready">ready</h1>
<script>
  function post(msg){ if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(msg); }
  // native -> web postMessage(data) surfaces as a DOM 'message' event. Listen on
  // both targets for portability (window on iOS, document on Android), echo it back.
  window.addEventListener('message', function(e){ post('echo:' + e.data); });
  document.addEventListener('message', function(e){ post('echo:' + e.data); });
  post('loaded');
</script></body></html>`

export function createE2EServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://localhost').pathname
    if (url === '/download') {
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': 'attachment; filename="nitro-e2e.txt"',
        'content-length': Buffer.byteLength(DOWNLOAD_TEXT),
      })
      res.end(DOWNLOAD_TEXT)
      return
    }
    if (url === '/slow') {
      const timer = setTimeout(() => {
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        })
        res.end(PAGE)
      }, 8000)
      res.on('close', () => clearTimeout(timer))
      return
    }
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
    if (url === '/' || url === '/long' || url === '/cache') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': url === '/cache' ? 'public, max-age=3600' : 'no-store',
      })
      res.end(
        url === '/long'
          ? PAGE.replace('<body>', '<body style="margin:0;min-height:4000px">')
          : PAGE
      )
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not found')
  })
}

// Bind 0.0.0.0 so the Android emulator can reach it via 10.0.2.2 while the iOS
// simulator and the CI health poll use 127.0.0.1.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.E2E_PORT || 8099)
  const server = createE2EServer()
  server.on('request', req => console.log(`${req.method} ${req.url}`))
  server.listen(port, '0.0.0.0', () => {
    console.log(`e2e-server on http://0.0.0.0:${port}`)
  })
}
