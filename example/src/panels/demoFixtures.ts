import type { WebViewSource } from 'nitro-webview'

export const BRIDGE_PAYLOAD =
  'Native "quotes", \'apostrophe\', \\ backslash\n안녕 🌍 </script>\u2028\u2029'
export const BLOB_TEXT =
  'Nitro download fixture\nQuotes: "hello"\nUnicode: 안녕 🌍\n'

export const BRIDGE_SOURCE: WebViewSource = {
  html: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bridge round trip</title>
<style>body{font:16px -apple-system,sans-serif;padding:20px;color:#18181b}button{min-height:44px;padding:10px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>
<script>window.earlyInjectionObserved = window.nitroEarly === 'installed';</script></head><body>
<h2>Web ↔ Native</h2><button onclick="window.ReactNativeWebView.postMessage('hello from the page')">Send from web</button>
<pre id="received">Waiting for native message…</pre><p id="injection">Waiting for injection…</p>
<script>
function echo(event) {
  document.getElementById('received').textContent = event.data;
  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'echo', data: event.data }));
}
window.addEventListener('message', echo);
document.addEventListener('message', echo);
</script></body></html>`,
}

export const BRIDGE_INJECTION = `
document.getElementById('injection').textContent = 'Document start observed: ' + window.earlyInjectionObserved;
window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready', early: window.earlyInjectionObserved }));
true;`

export const DOWNLOAD_SOURCE: WebViewSource = {
  html: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Local blob download</title>
<style>body{font:16px -apple-system,sans-serif;padding:20px;color:#18181b}button{min-height:44px;padding:10px}</style></head><body>
<h2>Download known bytes</h2><p>This local Blob needs no server. Native reports a file URL on iOS or a data URL on Android.</p>
<button onclick="download()">Download text Blob</button><p id="result"></p>
<script>
function download() {
  var blob = new Blob([${JSON.stringify(
    BLOB_TEXT
  )}], { type: 'text/plain;charset=utf-8' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'nitro-blob.txt';
  document.body.appendChild(a); a.click(); a.remove();
  // shortcut: the tiny fixture URL lives until page disposal so native readers never race revocation.
  document.getElementById('result').textContent = 'Download requested; inspect the native result below.';
}
</script></body></html>`,
}

export const SETTINGS_SOURCE: WebViewSource = {
  html: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Settings fixture</title>
<style>body{font:16px -apple-system,sans-serif;padding:20px;color:#18181b}button,input,a{min-height:44px;padding:10px;margin:4px 0;display:block}#space{height:900px;background:linear-gradient(#fff,#e4e4e7)}</style></head><body>
<h2>Settings fixture</h2><p id="js">JavaScript has not run.</p><p id="storage">Storage untested.</p>
<button onclick="storageProbe()">Write / read DOM storage</button>
<a href="https://nitro-demo.invalid/popup" target="_blank">Request popup</a><a href="#second">Add history entry</a><a href="#third">Add another history entry</a>
<input id="focus" placeholder="Tap here, then request native focus"><p id="focus-result">No input focus observed.</p>
<div id="space">Scroll down to test scrolling.</div><p id="second">Second anchor</p><p id="third">Third anchor</p>
<script>
document.getElementById('js').textContent = 'JavaScript ran.';
function storageProbe() {
  try { localStorage.setItem('nitro-demo', 'present'); document.getElementById('storage').textContent = 'localStorage read: ' + localStorage.getItem('nitro-demo'); }
  catch (e) { document.getElementById('storage').textContent = 'localStorage error: ' + String(e); }
}
storageProbe();
document.getElementById('focus').addEventListener('focus', function() { document.getElementById('focus-result').textContent = 'Input focus observed.'; });
</script></body></html>`,
  baseUrl: 'https://nitro-demo.invalid/',
}
