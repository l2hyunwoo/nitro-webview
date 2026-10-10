/**
 * Identifier this bridge installs on `window`. Must match the registered
 * handler name on both platforms (iOS `WKUserContentController.add` /
 * Android `addJavascriptInterface`).
 */
export const BRIDGE_NAME: 'ReactNativeWebView' = 'ReactNativeWebView'

/**
 * Android JavascriptInterface name for the raw native bridge. Distinct from
 * `BRIDGE_NAME` so the JS shim can string-coerce arguments before
 * forwarding.
 */
export const ANDROID_NATIVE_BRIDGE_NAME: 'ReactNativeWebViewNative' =
  'ReactNativeWebViewNative'

export type BridgePlatform = 'ios' | 'android'

export interface WebKitMessageHandler {
  postMessage(data: unknown): void
}

export interface AndroidNativeBridge {
  postMessage(data: string): void
}

/**
 * Build the literal JavaScript source string for the injected bridge.
 *
 * The script:
 *   - Defines `window.ReactNativeWebView` (idempotent; preserves any
 *     pre-existing object the page author installed).
 *   - Defines `window.ReactNativeWebView.postMessage(data)` (also
 *     idempotent; never overwrites an existing function).
 *   - String-coerces `data` before routing.
 *   - Routes to the platform-native handler (WebKit messageHandler on iOS,
 *     `ReactNativeWebViewNative` on Android).
 *   - Swallows the call when no native sink is wired (no page-side throw).
 */
export function buildBridgeScript(platform: BridgePlatform): string {
  const routeToNative =
    platform === 'ios'
      ? `
        // routes to window.webkit.messageHandlers.${BRIDGE_NAME}
        var __wk = window.webkit;
        if (__wk && __wk.messageHandlers && __wk.messageHandlers.${BRIDGE_NAME}) {
          __wk.messageHandlers.${BRIDGE_NAME}.postMessage(__payload);
        }`
      : `
        var __native = window.${ANDROID_NATIVE_BRIDGE_NAME};
        if (__native && typeof __native.postMessage === 'function') {
          __native.postMessage(__payload);
        }`

  // IIFE-wrapped so helper locals never leak onto `window`.
  return `;(function () {
  var __bridge = window.${BRIDGE_NAME};
  if (__bridge && typeof __bridge.postMessage === 'function') {
    return;
  }

  if (!__bridge) {
    __bridge = {};
    window.${BRIDGE_NAME} = __bridge;
  }

  __bridge.postMessage = function (data) {
    var __payload = (typeof data === 'string') ? data : String(data);
${routeToNative}
  };
})();`
}

/**
 * Escape a string for safe embedding inside a JavaScript *source* string.
 *
 * `JSON.stringify` handles quotes, backslashes, newlines, and control chars,
 * and produces a valid double-quoted JS string literal for them. BUT it
 * leaves U+2028 (LINE SEPARATOR) and U+2029 (PARAGRAPH SEPARATOR) RAW: they
 * are legal in JSON yet illegal *unescaped* inside a JS string literal on
 * pre-ES2019 engines (older Android System WebView / older iOS JSC will
 * throw a SyntaxError when the injected statement is parsed). We post-escape
 * those two code points so the emitted statement always parses.
 *
 * Returns a quoted JS string literal (includes the surrounding quotes).
 */
export function encodeJsStringLiteral(value: string): string {
  return JSON.stringify(value)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

/**
 * Build the one-shot JS statement that delivers a native→web message as a
 * DOM `message` event, matching react-native-webview's drop-in contract.
 *
 *   - iOS     → dispatch on `window`   (RNCWebViewImpl.m:1113)
 *   - Android → dispatch on `document` (RNCWebViewManagerImpl.kt:335)
 *
 * `event.data` is `message` verbatim. The statement is self-contained and
 * fire-and-forget; the caller evaluates it with no completion handler.
 */
export function buildPostMessageScript(
  platform: BridgePlatform,
  message: string
): string {
  const target = platform === 'ios' ? 'window' : 'document'
  const data = encodeJsStringLiteral(message)
  return `${target}.dispatchEvent(new MessageEvent('message',{data:${data}}));`
}

/** Internal Android blob-download protocol. Only a pending native request can claim an envelope. */
export const BLOB_ENVELOPE_KEY: '__nitro_blob__' = '__nitro_blob__'
export const MAX_BLOB_DOWNLOAD_BYTES = 8 * 1024 * 1024
export const MAX_BLOB_DATA_URL_CHARS =
  4 * Math.ceil(MAX_BLOB_DOWNLOAD_BYTES / 3) + 512
export const MAX_BLOB_ENVELOPE_CHARS = MAX_BLOB_DATA_URL_CHARS + 8192
export const BLOB_DOWNLOAD_TIMEOUT_MS = 30_000

export interface BlobDownloadRequest {
  requestId: string
  url: string
  fileName: string
}

export interface BlobDownloadPayload extends BlobDownloadRequest {
  dataUrl: string
  mimeType: string
  size: number
}

export type BlobDownloadResult =
  | BlobDownloadPayload
  | (BlobDownloadRequest & { error: string })

/** Unmatched envelopes, including replayed IDs, remain ordinary onMessage data. */
export function parseBlobEnvelope(
  raw: string,
  pending: BlobDownloadRequest | undefined
): BlobDownloadResult | null {
  if (!pending || typeof raw !== 'string') return null
  const prefix = `{"${BLOB_ENVELOPE_KEY}":{"requestId":${JSON.stringify(pending.requestId)},`
  if (!raw.startsWith(prefix)) return null
  const invalid = (): BlobDownloadResult => ({ ...pending, error: 'invalid' })
  if (raw.length > MAX_BLOB_ENVELOPE_CHARS) return invalid()
  try {
    const b = JSON.parse(raw)?.[BLOB_ENVELOPE_KEY]
    if (!b || b.requestId !== pending.requestId || b.url !== pending.url)
      return invalid()
    if (
      Object.values(b).some(
        (value) => value !== null && typeof value === 'object'
      )
    )
      return invalid()
    if (Object.prototype.hasOwnProperty.call(b, 'error')) {
      return typeof b.error === 'string' &&
        [
          'fetch',
          'read',
          'abort',
          'timeout',
          'too-large',
          'invalid',
          'busy',
        ].includes(b.error)
        ? { ...pending, error: b.error }
        : invalid()
    }
    if (
      typeof b.dataUrl !== 'string' ||
      b.dataUrl.length > MAX_BLOB_DATA_URL_CHARS ||
      typeof b.mimeType !== 'string' ||
      b.mimeType.length > 256 ||
      !Number.isSafeInteger(b.size) ||
      b.size < 0 ||
      b.size > MAX_BLOB_DOWNLOAD_BYTES
    )
      return invalid()
    const comma = b.dataUrl.indexOf(',')
    const header = b.dataUrl.slice(0, comma)
    if (
      comma < 0 ||
      comma > 512 ||
      !header.startsWith('data:') ||
      !header.endsWith(';base64') ||
      /[\r\n]/.test(header)
    )
      return invalid()
    const base64 = b.dataUrl.slice(comma + 1)
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
    if (
      base64.length !== 4 * Math.ceil(b.size / 3) ||
      /[^A-Za-z0-9+/]/.test(base64.slice(0, base64.length - padding))
    )
      return invalid()
    if ((base64.length / 4) * 3 - padding !== b.size) return invalid()
    return {
      ...pending,
      dataUrl: b.dataUrl,
      mimeType: b.mimeType,
      size: b.size,
    }
  } catch {
    return invalid()
  }
}

/** Read at most 8 MiB, with one reader per view and exactly one terminal response. */
export function buildBlobReaderScript(request: BlobDownloadRequest): string {
  return `;(function () {
  var id = ${encodeJsStringLiteral(request.requestId)}, url = ${encodeJsStringLiteral(request.url)}, done = false, reader = null, timer = null;
  var controller = null;
  function finish(error, silent) {
    if (done) { return; }
    done = true;
    if (timer !== null) { window.clearTimeout(timer); }
    if (window.__nitroBlobReader && window.__nitroBlobReader.requestId === id) {
      delete window.__nitroBlobReader;
    }
    if (error) {
      if (controller) { controller.abort(); }
      if (reader && reader.readyState === 1) { reader.abort(); }
    }
    if (!silent) {
      var payload = { requestId: id, url: url };
      if (error) { payload.error = error; }
      else {
        payload.dataUrl = reader.result;
        payload.mimeType = reader.__nitroMimeType;
        payload.size = reader.__nitroSize;
      }
      var envelope = { __nitro_blob__: payload };
      var bridge = window.ReactNativeWebView;
      if (bridge && typeof bridge.postMessage === 'function') {
        bridge.postMessage(JSON.stringify(envelope));
      }
    }
  }
  if (window.__nitroBlobReader) { finish('busy'); return; }
  window.__nitroBlobReader = { requestId: id, cancel: function () { finish('abort', true); } };
  timer = window.setTimeout(function () { finish('timeout'); }, ${BLOB_DOWNLOAD_TIMEOUT_MS});
  try {
    if (typeof AbortController === 'function') { controller = new AbortController(); }
    fetch(url, controller ? { signal: controller.signal } : {}).then(function (response) {
      if (done) { return; }
      if (!response.ok) { throw new Error('fetch'); }
      return response.blob();
    }).then(function (blob) {
      if (done) { return; }
      if (!blob || !Number.isSafeInteger(blob.size) || blob.size < 0) { finish('invalid'); return; }
      if (blob.size > ${MAX_BLOB_DOWNLOAD_BYTES}) { finish('too-large'); return; }
      try {
        reader = new FileReader();
        reader.__nitroSize = blob.size;
        reader.__nitroMimeType = blob.type || '';
        reader.onload = function () {
          if (typeof reader.result !== 'string' || reader.result.length > ${MAX_BLOB_DATA_URL_CHARS}) {
            finish('invalid'); return;
          }
          finish(null);
        };
        reader.onerror = function () { finish('read'); };
        reader.onabort = function () { finish('abort'); };
        reader.readAsDataURL(blob);
      } catch (error) { finish('read'); }
    })['catch'](function () { finish('fetch'); });
  } catch (error) { finish('fetch'); }
})();`
}

/**
 * Sandbox shape for evaluating the iOS bridge script.
 */
export interface IosBridgeSandbox {
  webkit?: {
    messageHandlers?: {
      [BRIDGE_NAME]?: WebKitMessageHandler
    }
  }
  [BRIDGE_NAME]?: {
    postMessage?: (data: unknown) => void
    [key: string]: unknown
  }
}

/**
 * Sandbox shape for evaluating the Android bridge script.
 */
export interface AndroidBridgeSandbox {
  [ANDROID_NATIVE_BRIDGE_NAME]?: AndroidNativeBridge
  [BRIDGE_NAME]?: {
    postMessage?: (data: unknown) => void
    [key: string]: unknown
  }
}

/**
 * Evaluate the bridge script for `platform` against `sandbox`. `window` is
 * aliased to `sandbox` inside the script so the install mutates the
 * sandbox rather than the host's globals.
 */
export function evaluateBridgeScript<
  S extends IosBridgeSandbox | AndroidBridgeSandbox,
>(platform: BridgePlatform, sandbox: S): void {
  const source = buildBridgeScript(platform)
  // eslint-disable-next-line no-new-func
  const evaluate = new Function('window', source) as (window: S) => void
  evaluate(sandbox)
}

/**
 * WKScriptMessageHandler name for the SPA history shim on iOS — DELIBERATELY
 * separate from {@linkcode BRIDGE_NAME}. iOS registers a second
 * `WKScriptMessageHandler` under this name so a history event can NEVER be
 * mistaken for a user `onMessage`. Mirrors react-native-webview's
 * `ReactNativeHistoryShim`.
 */
export const HISTORY_SHIM_NAME: 'ReactNativeHistoryShim' =
  'ReactNativeHistoryShim'

/**
 * Android `@JavascriptInterface` name for the SPA history shim — the Android
 * analogue of {@linkcode HISTORY_SHIM_NAME}, distinct from
 * {@linkcode ANDROID_NATIVE_BRIDGE_NAME} so the history sink is a separate
 * channel from the page `postMessage` bridge.
 */
export const ANDROID_HISTORY_SHIM_NAME: 'ReactNativeHistoryShimNative' =
  'ReactNativeHistoryShimNative'

/**
 * Navigation-type discriminator the history shim reports. A subset of
 * `WebViewNavigationType`: `pushState`/`replaceState` map to `'other'`,
 * `popstate` maps to `'backforward'`.
 */
export type HistoryNavType = 'other' | 'backforward'

/**
 * Build the literal JavaScript source string for the injected SPA
 * history-API shim.
 *
 * The script hooks `history.pushState`, `history.replaceState`, and the
 * `popstate` event, and on each posts the mapped nav-type to the DEDICATED
 * history sink (never the `ReactNativeWebView` message bridge). The URL is
 * intentionally NOT sent — native reads `webView.url` live at receipt (it is
 * already up to date because `pushState` mutates the URL synchronously before
 * we notify). A `setTimeout(0)` defers the post so the URL is settled first.
 *
 * Guarded idempotent (`window.__nitroHistoryShimInstalled`) — matching the
 * bridge script's idempotency guarantee — so re-injection on every page load
 * (Android `onPageStarted` / iframe re-inject) never double-wraps
 * `pushState`, which would otherwise fire N notifications per call.
 */
export function buildHistoryShimScript(platform: BridgePlatform): string {
  const post =
    platform === 'ios'
      ? `
        var __wk = window.webkit;
        if (__wk && __wk.messageHandlers && __wk.messageHandlers.${HISTORY_SHIM_NAME}) {
          __wk.messageHandlers.${HISTORY_SHIM_NAME}.postMessage(__type);
        }`
      : `
        var __n = window.${ANDROID_HISTORY_SHIM_NAME};
        if (__n && typeof __n.postMessage === 'function') {
          __n.postMessage(__type);
        }`

  // IIFE-wrapped so helper locals never leak onto `window`.
  return `;(function (history) {
  if (window.__nitroHistoryShimInstalled) { return; }
  window.__nitroHistoryShimInstalled = true;
  function notify(__type) {
    // window.setTimeout(0): let the URL settle before native reads
    // webView.url. Referenced via window (aliased in the sandbox) so the
    // shim is evaluable the same way the bridge script is.
    window.setTimeout(function () {${post}
    }, 0);
  }
  function shim(f) {
    return function () {
      notify('other');
      return f.apply(history, arguments);
    };
  }
  history.pushState = shim(history.pushState);
  history.replaceState = shim(history.replaceState);
  window.addEventListener('popstate', function () { notify('backforward'); });
})(window.history);`
}

/** Sink the history shim posts nav-type strings to. */
export interface HistorySink {
  postMessage(type: string): void
}

/**
 * Structural subset of the DOM `History` interface the shim reassigns.
 * Declared locally so the sandbox types do not require the DOM lib.
 */
export interface ShimmableHistory {
  pushState(data: unknown, unused: string, url?: string | null): void
  replaceState(data: unknown, unused: string, url?: string | null): void
}

/** Sandbox shape for evaluating the iOS history shim. */
export interface IosHistorySandbox {
  webkit?: {
    messageHandlers?: {
      [HISTORY_SHIM_NAME]?: HistorySink
    }
  }
  history: ShimmableHistory
  addEventListener(type: string, cb: () => void): void
  __nitroHistoryShimInstalled?: boolean
  setTimeout(cb: () => void, ms: number): void
}

/** Sandbox shape for evaluating the Android history shim. */
export interface AndroidHistorySandbox {
  [ANDROID_HISTORY_SHIM_NAME]?: HistorySink
  history: ShimmableHistory
  addEventListener(type: string, cb: () => void): void
  __nitroHistoryShimInstalled?: boolean
  setTimeout(cb: () => void, ms: number): void
}

/**
 * Evaluate the history shim for `platform` against `sandbox`. `window` is
 * aliased to `sandbox` inside the script so the install mutates the sandbox
 * rather than the host's globals (matching {@linkcode evaluateBridgeScript}).
 */
export function evaluateHistoryShim<
  S extends IosHistorySandbox | AndroidHistorySandbox,
>(platform: BridgePlatform, sandbox: S): void {
  const source = buildHistoryShimScript(platform)
  // eslint-disable-next-line no-new-func
  const evaluate = new Function('window', source) as (window: S) => void
  evaluate(sandbox)
}
