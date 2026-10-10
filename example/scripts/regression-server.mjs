import http from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const fixtureText = 'Nitro native regression bytes: 한글 😀\n';
const tapLabels = new Set([
  'Navigate',
  'Download HTTP',
  'Download blob',
  'Open blank',
  'Open script',
  'Upload fixture',
  'Capture fixture',
  'Fullscreen',
  'Location',
  'Camera permission',
  'Microphone permission',
]);
const nativeActions = new Set([
  'background-resume',
  'chooser-cancel',
  'chooser-upload',
  'capture-cancel',
  'fullscreen-exit',
  'permission-allow',
  'permission-deny',
]);

export function validateRegressionInteraction(value) {
  if (value === null) return null;
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.id.length > 160 ||
    Object.keys(value).some(key => !['id', 'action', 'label'].includes(key))
  )
    throw new Error('Unsupported regression interaction');
  const action = value.action ?? 'tap';
  if (
    action === 'tap'
      ? !tapLabels.has(value.label)
      : !nativeActions.has(action) || value.label !== undefined
  )
    throw new Error('Unsupported regression interaction');
  return value;
}

export function createRegressionServer() {
  const requests = [];
  let results = null;
  let interaction = null;
  let interactionResult = null;
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
          interaction = validateRegressionInteraction(JSON.parse(body));
        } catch {
          res.writeHead(400);
          return res.end('Invalid interaction');
        }
      }
      return json(interaction);
    }
    if (url.pathname === '/interaction-result') {
      if (req.method === 'POST') {
        try {
          const value = JSON.parse(body);
          if (
            !value ||
            typeof value.id !== 'string' ||
            !value.id ||
            typeof value.ok !== 'boolean' ||
            typeof value.detail !== 'string' ||
            value.detail.length > 2000
          )
            throw new Error('Invalid result');
          interactionResult = value;
        } catch {
          res.writeHead(400);
          return res.end('Invalid interaction result');
        }
      }
      return json(interactionResult);
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
      interactionResult = null;
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
    if (url.pathname === '/attachment') {
      res.writeHead(200, {
        'content-type': 'application/octet-stream',
        'content-disposition': 'attachment; filename="nitro-regression.txt"',
        'content-length': Buffer.byteLength(fixtureText),
        'cache-control': 'no-store',
      });
      return res.end(fixtureText);
    }
    if (url.pathname === '/fixture.mp4') {
      const bytes = readFileSync(
        new URL('./fixtures/regression.mp4', import.meta.url),
      );
      const headers = {
        'content-type': 'video/mp4',
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
      };
      if (req.headers.range) {
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
        const start = range ? Number(range[1]) : NaN;
        const end = range?.[2]
          ? Math.min(Number(range[2]), bytes.length - 1)
          : bytes.length - 1;
        if (
          !Number.isSafeInteger(start) ||
          start < 0 ||
          start > end ||
          start >= bytes.length
        ) {
          res.writeHead(416, {
            ...headers,
            'content-range': `bytes */${bytes.length}`,
          });
          return res.end();
        }
        res.writeHead(206, {
          ...headers,
          'content-range': `bytes ${start}-${end}/${bytes.length}`,
          'content-length': end - start + 1,
        });
        return res.end(bytes.subarray(start, end + 1));
      }
      res.writeHead(200, { ...headers, 'content-length': bytes.length });
      return res.end(bytes);
    }
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
    const featureMarkup =
      {
        '/download-fixture': `<a href="/attachment${url.search}">Download HTTP</a><button onclick="downloadBlob()">Download blob</button>`,
        '/window-fixture': `<a href="/popup-blank${url.search}" target="_blank">Open blank</a><button onclick="window.open('/popup-script${url.search}','_blank')">Open script</button>`,
        '/upload-fixture': `<label>Upload fixture<input id="upload" type="file" accept="text/plain"></label><label>Capture fixture<input id="capture" type="file" accept="image/*" capture="environment"></label>`,
        '/fullscreen-fixture': `<video id="video" playsinline preload="auto" src="/fixture.mp4${url.search}"></video><button onclick="fullscreen()">Fullscreen</button>`,
        '/permission-fixture': `<button onclick="navigator.geolocation.getCurrentPosition(function(p){post('location:allowed:'+p.coords.latitude)},function(e){post('location:denied:'+e.code)},{enableHighAccuracy:true,timeout:15000,maximumAge:0})">Location</button><button onclick="media('camera')">Camera permission</button><button onclick="media('microphone')">Microphone permission</button>`,
        '/frames': `<iframe src="/frame-same${url.search}"></iframe><iframe src="http://localhost:8098/frame-cross${url.search}"></iframe><iframe src="/frame-opaque${url.search}" sandbox="allow-scripts"></iframe>`,
      }[url.pathname] ?? '';
    const page = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>regression fixture</title><style>body{font:16px system-ui;margin:4px}button,a,label{display:inline-block;margin:5px}video{width:120px;height:65px}iframe{width:60px;height:30px}input{max-width:160px}</style></head>
<body>${featureMarkup}<p id="marker">JavaScript did not run</p><a id="nav" href="/target${url.search}">Navigate</a>
<script>
function post(value) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(value); }
window.fixtureText = ${JSON.stringify(fixtureText)};
window.blobSize = 0;
function media(kind) {
  navigator.mediaDevices.getUserMedia({video:kind==='camera',audio:kind==='microphone'}).then(function(stream){
    post('media:'+kind+':allowed:'+stream.getTracks().map(function(track){return track.kind+':'+track.readyState}).join(','));
    stream.getTracks().forEach(function(track){track.stop()});
  }).catch(function(error){post('media:'+kind+':denied:'+error.name)});
}
function downloadBlob() {
  var bytes = window.blobSize ? new Uint8Array(window.blobSize) : window.fixtureText;
  var link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));
  link.download = 'nitro-blob.txt';
  document.body.appendChild(link);link.click();link.remove();
}
function fullscreen() {
  var video=document.getElementById('video');
  try {
    if(document.fullscreenEnabled && typeof video.requestFullscreen === 'function') {
      video.requestFullscreen().catch(function(e){post('fullscreen:error:'+e.name)});
    } else if(typeof video.webkitEnterFullscreen === 'function') {
      video.webkitEnterFullscreen();
    } else { post('fullscreen:error:unsupported'); }
  } catch(e) { post('fullscreen:error:'+e.name); }
}
var video=document.getElementById('video');
if(video){
  video.addEventListener('loadedmetadata',function(){post('video:ready')});
  video.addEventListener('webkitbeginfullscreen',function(){post('fullscreen:entered')});
  video.addEventListener('webkitendfullscreen',function(){post('fullscreen:exited')});
  document.addEventListener('fullscreenchange',function(){post(document.fullscreenElement?'fullscreen:entered':'fullscreen:exited')});
}
['upload','capture'].forEach(function(id){
  var input=document.getElementById(id);if(!input)return;
  input.addEventListener('cancel',function(){post(id+':cancel')});
  input.addEventListener('change',function(){
    if(!input.files.length){post(id+':empty');return;}
    var file=input.files[0],reader=new FileReader();
    reader.onload=function(){post('upload:'+JSON.stringify({name:file.name,size:file.size,text:reader.result}))};
    reader.onerror=function(){post('upload:error')};reader.readAsText(file);
  });
});
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
