# nitro-webview

<table>
  <tr>
    <td align="center"><b>iOS</b></td>
    <td align="center"><b>Android</b></td>
  </tr>
  <tr>
    <td><video src="https://github.com/user-attachments/assets/4ae45afd-b595-4efd-8e44-25c1d03434a8" width="360" autoplay loop muted playsinline /></td>
    <td><video src="https://github.com/user-attachments/assets/9431b353-24a1-41f5-9aee-1fea0520e13d" width="360" autoplay loop muted playsinline /></td>
  </tr>
</table>

A React Native WebView built on [Nitro Modules][nitro] — pure Swift / Kotlin native sides, JSI-direct prop and event dispatch, no bridge round-trips.

## Introduction

`nitro-webview` is a drop-in WebView component for React Native that replaces the legacy bridge with [Nitro Modules][nitro]'s JSI-direct dispatch. It targets two audiences:

- **Experienced RN + Nitro developers** who want a WebView that participates in the Nitro view contract — `getHostComponent`, hybrid refs, `callback(...)` event handlers, `Promise<T>` method results — without paying for JSON serialization or thread-hops on every prop update or event.
- **Teams evaluating WebView libraries** ("comparison shoppers") who already use `react-native-webview` and want to know what they keep, what changes, and what improves before they switch.

### What you keep coming from `react-native-webview`

- Same conceptual props (`source`, `userAgent`, `injectedJavaScript`, `onLoadStart` / `onLoadEnd`, `onMessage`, `onError`, `onShouldStartLoadWithRequest`, `onFileDownload`).
- Same `window.ReactNativeWebView.postMessage(...)` page-side contract.
- Same `originWhitelist`-style default (`['http://*', 'https://*']`) exposed as `DEFAULT_ORIGIN_WHITELIST`.
- Same `WebViewNavigationType` string union (`'click' | 'formsubmit' | 'backforward' | 'reload' | 'formresubmit' | 'other'`) so existing call-sites compile unchanged.

### What changes

- Event props must be wrapped in `callback(...)` from `react-native-nitro-modules` so Nitro can dispatch them on the right thread.
- `onShouldStartLoadWithRequest` returns `Promise<boolean>` directly — no `lockIdentifier` round-trip. `async` callbacks are awaited transparently.
- Imperative methods (`goBack`, `evaluateJavaScript`, `getCookies`, `setCookie`, `clearCookies`, …) live on the **hybrid ref** captured via the `hybridRef` prop, not on a React `ref`.
- Native packages: `io.github.l2hyunwoo.nitrowebview` (Android) / `NitroWebView` Swift module (iOS). MIT-licensed, npm-published as `nitro-webview` (unscoped).

### Why Nitro

Nitro Modules pipes props, methods, and event callbacks through JSI so a load event or a cookie read does not round-trip through `NativeEventEmitter` or the bridge's serialization queue. For a WebView — which is event-heavy (navigation, messages, errors, downloads) — that is the main practical win.

## Quick Start

### 1. Install

```sh
yarn add nitro-webview react-native-nitro-modules
cd ios && pod install
```

`react-native-nitro-modules` is a peer dependency — install it explicitly so your dependency graph stays deterministic.

### 2. Render a WebView

```tsx
import { NitroWebView, callback } from 'nitro-webview'

export default function Screen() {
  return (
    <NitroWebView
      style={{ flex: 1 }}
      source={{ uri: 'https://example.com' }}
      onLoadEnd={callback(() => console.log('loaded'))}
    />
  )
}
```

Every event prop must be wrapped in `callback(...)` so Nitro can dispatch it on the right thread. Passing a raw function will throw at render time.

### 3. Call imperative methods

```tsx
import { useRef } from 'react'
import { NitroWebView, callback, type NitroWebViewType } from 'nitro-webview'

export default function Screen() {
  const ref = useRef<NitroWebViewType | null>(null)

  return (
    <>
      <NitroWebView
        style={{ flex: 1 }}
        source={{ uri: 'https://example.com' }}
        hybridRef={callback((r) => {
          ref.current = r
        })}
      />
      <Button title="reload" onPress={() => ref.current?.reload()} />
    </>
  )
}
```

### 4. Configure platform setup

iOS and Android both need a small amount of host-app configuration for file upload and download to work — see [Platform setup](#platform-setup) below.

## API Reference

### `NitroWebView` component

The exported React component. Backed by `getHostComponent<NitroWebViewProps, NitroWebViewMethods>('NitroWebView', () => NitroWebViewConfig)`.

#### Props

| Prop | Type | Notes |
| --- | --- | --- |
| `source` | `WebViewSource` | `{ uri, headers? }` or `{ html, baseUrl? }`. Drives navigation. Required. |
| `defaultHeaders` | `Record<string, string>` | Global HTTP headers attached to every main-frame navigation request. Per-request `source.headers` win on key conflict. |
| `userAgent` | `string` | Overrides the platform default UA for every request (main-frame + sub-resource). `undefined` / empty restores the WebKit / Chromium default. |
| `javaScriptEnabled` | `boolean` | Enable JS. Default `true`. Android: mutable. iOS: **no-op** - Nitro delivers props after `WKWebView` init, so this is never applied. |
| `domStorageEnabled` | `boolean` | Enable `localStorage` / `sessionStorage`. Default `true`. Android: mutable. iOS: always on (no-op). |
| `cacheEnabled` | `boolean` | HTTP cache. Android: `cacheMode` `LOAD_DEFAULT` / `LOAD_NO_CACHE`. iOS: `URLRequest.cachePolicy` on the next `source` load. |
| `incognito` | `boolean` | Non-persistent store. iOS: **no-op** - Nitro delivers props after `WKWebView` init, so `nonPersistent()` is never applied. Android: no first-class mode; cookies stay process-global. |
| `scrollEnabled` | `boolean` | iOS-only: `scrollView.isScrollEnabled` (mutable). Android: no-op (RNW does not implement it). |
| `bounces` | `boolean` | iOS-only: `scrollView.bounces` (mutable). Android: no-op. |
| `scalesPageToFit` | `boolean` | Android-only: `loadWithOverviewMode` + `useWideViewPort`. iOS: no-op. |
| `mediaPlaybackRequiresUserAction` | `boolean` | Require a gesture before media plays. Default `true`. Android: mutable. iOS: **no-op** - Nitro delivers props after `WKWebView` init, so this is never applied. |
| `allowsInlineMediaPlayback` | `boolean` | iOS-only: **no-op** - `allowsInlineMediaPlayback` is only read at `WKWebView` init, which Nitro's prop delivery always misses. Android: no-op (inline by default). |
| `allowsBackForwardNavigationGestures` | `boolean` | iOS-only: back/forward swipe gestures (mutable). Android: no-op. |
| `thirdPartyCookiesEnabled` | `boolean` | Android-only: `setAcceptThirdPartyCookies` for this WebView (mutable). iOS: no-op. |
| `sharedCookiesEnabled` | `boolean` | iOS-only: **no-op** - Nitro delivers props after `WKWebView` init, so sharing `HTTPCookieStorage` is never applied. Android: no-op (one process-wide store). |
| `injectedJavaScript` | `string` | Fire-and-forget script run at document-END on every page load. |
| `injectedJavaScriptBeforeContentLoaded` | `string` | Script run at document-START, before the page's own scripts. iOS: `WKUserScript(.atDocumentStart)` (hard before-any-script guarantee). Android: `WebViewCompat.addDocumentStartJavaScript` when the WebView supports `DOCUMENT_START_SCRIPT`, else `evaluateJavascript` in `onPageStarted` (early, but not a strict before-first-script guarantee). Main frame only. |
| `onLoadStart` | `(event: WebViewLoadEvent) => void` | Fired when the WebView begins loading content. |
| `onLoadEnd` | `(event: WebViewLoadEvent) => void` | Fired when the WebView finishes loading content. |
| `onNavigationStateChange` | `(state: WebViewNavigationState) => void` | URL / title / `canGoBack` / `canGoForward` / `loading`. |
| `onMessage` | `(event: WebViewMessageEvent) => void` | Fires when the page calls `window.ReactNativeWebView.postMessage(...)`. |
| `onError` | `(event: NitroWebViewErrorEvent) => void` | Navigation failure (network, SSL). |
| `onFileDownload` | `(event: FileDownloadEvent) => void` | Native intercepts a download and surfaces `{ url, mimeType?, fileName?, contentLength?, userAgent? }`. Storage is the JS layer's responsibility. |
| `onHttpError` | `(event: NitroWebViewHttpErrorEvent) => void` | Main-frame HTTP 4xx/5xx (`{ statusCode, url, description }`). Disjoint from `onError` (transport/SSL). Sub-resource failures are dropped. |
| `onRenderProcessGone` | `(event: NitroWebViewRenderProcessGoneEvent) => void` | Renderer crash / OS reclaim. `nativeEvent.didCrash` is Android-only (API 26+); always `undefined` on iOS. Recover by calling `reload()`. |
| `onScroll` | `(event: NitroWebViewScrollEvent) => void` | Scroll stream. NOT throttled or deduped natively. iOS populates all geometry fields; Android populates `contentOffset` only. |
| `onShouldStartLoadWithRequest` | `(event: ShouldStartLoadRequest) => boolean \| Promise<boolean>` | Allow/block each navigation before it starts. Returning `false` (or a `Promise` resolving to `false`) cancels silently. |

#### Methods (via `hybridRef`)

The hybrid ref captured by `hybridRef={callback((r) => ref.current = r)}` exposes:

| Method | Return | Notes |
| --- | --- | --- |
| `goBack()` | `void` | Navigate back in history. |
| `goForward()` | `void` | Navigate forward in history. |
| `reload()` | `void` | Reload the current page. |
| `stopLoading()` | `void` | Stop the current load. |
| `evaluateJavaScript(code)` | `Promise<string>` | Result is the serialized string evaluation. iOS uses `String(describing:)`; Android uses the JSON-encoded `ValueCallback<String>` result. Undefined/nil surfaces as `''`. |
| `injectJavaScript(code)` | `void` | Fire-and-forget execution — no result awaited. Use for side effects only. No-op if no page is loaded. |
| `postMessage(data)` | `void` | Push a string into the page as a DOM `message` event (`event.data === data`). Listen on **both** targets for portability: `window.addEventListener('message', ...)` (iOS) and `document.addEventListener('message', ...)` (Android). Dispatched once, no buffering. `data` is escaped safely (quotes, newlines, `</script>`, unicode). |
| `getCookies(url)` | `Promise<Cookie[]>` | iOS returns the full attribute set. Android `CookieManager` only exposes `name` and `value` on read — other fields are left `undefined`. |
| `setCookie(url, cookie)` | `Promise<void>` | `Cookie = { name, value, domain?, path?, expires?, secure?, httpOnly? }`. `expires` is milliseconds since epoch (`Date.now()`-compatible). |
| `clearCookies()` | `Promise<void>` | Bulk clear via `WKWebsiteDataStore` (iOS) / `CookieManager.removeAllCookies` (Android). The promise resolves only after the platform reports completion. |

### Types

#### `WebViewSource`

```ts
type WebViewSource = UriSource | HtmlSource

interface UriSource {
  uri: string
  headers?: Record<string, string>
}

interface HtmlSource {
  html: string
  baseUrl?: string
}
```

`UriSource.headers` are per-request HTTP headers attached only to the main-frame navigation a `source` change triggers. Redirects, sub-frames, and sub-resource requests do not re-apply them.

#### `ShouldStartLoadRequest`

```ts
interface ShouldStartLoadRequest {
  url: string
  navigationType: WebViewNavigationType
  mainDocumentURL?: string   // iOS only
  isTopFrame?: boolean       // iOS only
  hasTargetFrame?: boolean   // iOS only — false for target=_blank
}

type WebViewNavigationType =
  | 'click' | 'formsubmit' | 'backforward'
  | 'reload' | 'formresubmit' | 'other'
```

Android leaves the three optional fields `undefined` because `WebViewClient.shouldOverrideUrlLoading` does not expose them, and always reports `navigationType: 'other'`.

The JS callback may be `async` — the bridge transparently awaits any returned thenable before applying the decision.

#### `WebViewNavigationState` & `WebViewLoadEvent`

```ts
interface WebViewNavigationState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
}

interface WebViewLoadEvent {
  nativeEvent: WebViewNavigationState
}
```

#### `WebViewMessageEvent`

```ts
interface WebViewMessageNativeEvent {
  data: string  // literal string from window.ReactNativeWebView.postMessage(...)
  url: string
}

interface WebViewMessageEvent {
  nativeEvent: WebViewMessageNativeEvent
}
```

#### `NitroWebViewErrorEvent`

```ts
interface NitroWebViewErrorNativeEvent {
  code: number         // NSError.code (iOS) / WebResourceError.getErrorCode() (Android)
  description: string  // localizedDescription (iOS) / getDescription().toString() (Android)
  url: string          // empty string when neither delegate nor error provided one
  domain: string       // NSError.domain (iOS) / stable string mirror (Android)
}

interface NitroWebViewErrorEvent {
  nativeEvent: NitroWebViewErrorNativeEvent
}

type WebViewErrorEvent = NitroWebViewErrorEvent  // alias
```

#### `Cookie`

```ts
interface Cookie {
  name: string
  value: string
  domain?: string        // platform-derived from url when omitted
  path?: string          // defaults to '/'
  expires?: number       // ms since Unix epoch; omit for a session cookie
  secure?: boolean       // restrict to HTTPS
  httpOnly?: boolean     // hide from document.cookie
}
```

#### `FileDownload` & `FileDownloadEvent`

```ts
interface FileDownload {
  url: string             // always http/https — blob: URLs are out of scope
  mimeType?: string
  fileName?: string       // iOS: URLResponse.suggestedFilename
                          // Android: DownloadUtils.guessFileName (Content-Disposition)
  contentLength?: number  // -1 or absent when the platform did not supply a length
  userAgent?: string      // typically absent on iOS
}

interface FileDownloadEvent {
  nativeEvent: FileDownload
}
```

### Origin whitelist helpers

Pure-TS helpers for building allowlist-style policies on top of `onShouldStartLoadWithRequest`. They do **not** depend on React Native or Nitro at runtime, so they can be unit-tested in isolation.

```ts
import {
  DEFAULT_ORIGIN_WHITELIST,
  createOriginWhitelistGuard,
  originMatches,
  wrapWithOriginWhitelist,
} from 'nitro-webview'
import type {
  OnShouldStartLoadWithRequest,
  OriginWhitelistGuard,
} from 'nitro-webview'
```

| Export | Signature | Notes |
| --- | --- | --- |
| `DEFAULT_ORIGIN_WHITELIST` | `readonly ['http://*', 'https://*']` | Frozen. Mirrors `react-native-webview`'s documented default. |
| `originMatches(url, patterns)` | `(string, readonly string[]) => boolean` | Returns `true` iff the **origin** (`scheme://host[:port]`) of `url` matches one of the glob `patterns`. `*` is the only wildcard. Case-insensitive on scheme + host. Empty pattern list returns `false`. Unparseable URL returns `false`. |
| `createOriginWhitelistGuard(patterns?, inner?)` | `(readonly string[], OnShouldStartLoadWithRequest?) => OriginWhitelistGuard` | Builds a guard that rejects non-matching origins immediately and delegates matching ones to `inner` (or allows them when `inner` is absent). |
| `wrapWithOriginWhitelist(handler, patterns?)` | `(OnShouldStartLoadWithRequest, readonly string[]?) => OnShouldStartLoadWithRequest` | Fast-path wrapper: when `patterns === DEFAULT_ORIGIN_WHITELIST` (by reference), the returned guard short-circuits `true` and `handler` is never invoked. Otherwise delegates straight to `handler(event)`. |

```ts
import { wrapWithOriginWhitelist, DEFAULT_ORIGIN_WHITELIST } from 'nitro-webview'

const handler = wrapWithOriginWhitelist(
  (event) => !event.url.startsWith('https://example.org/'),
  DEFAULT_ORIGIN_WHITELIST,
)
```

### Source helpers

```ts
import {
  isHtmlSource,
  isUriSource,
  normalizeHtmlSource,
  sourceToCommand,
} from 'nitro-webview'
```

| Export | Signature | Notes |
| --- | --- | --- |
| `isUriSource(source)` | `(WebViewSource) => source is UriSource` | Structural narrowing on a non-empty `uri` string. |
| `isHtmlSource(source)` | `(WebViewSource) => source is HtmlSource` | Structural narrowing on a string `html` field. |
| `normalizeHtmlSource(source)` | `(WebViewSource) => LoadHtmlCommand \| null` | Returns a `loadHtml` native command, or `null` when `source` is not an `HtmlSource`. |
| `sourceToCommand(source)` | `(WebViewSource) => NativeViewCommand` | Maps the `source` prop to the native view command (`loadUrl` or `loadHtml`). Throws `TypeError` on malformed input. |

### Event dispatchers

Lower-level builders used by `NitroWebView` internally. Exported for advanced consumers building custom event pipelines (e.g. for tests or mocks).

| Export | Signature |
| --- | --- |
| `createLoadStartDispatcher(onLoadStart?)` | `(OnLoadStart \| undefined) => LoadStartDispatcher` |
| `createLoadDispatcher(onLoad?)` | `(OnLoad \| undefined) => LoadDispatcher` |
| `createLoadEndDispatcher(onLoadEnd?)` | `(OnLoadEnd \| undefined) => LoadEndDispatcher` |

Each dispatcher dedupes by `navigationId` so duplicate native fires never reach JS.

### Bridge script

The injected `window.ReactNativeWebView.postMessage(...)` shim is built in pure TS so it can be unit-tested and shared across platforms.

```ts
import {
  ANDROID_NATIVE_BRIDGE_NAME,
  BRIDGE_NAME,
  buildBridgeScript,
  evaluateBridgeScript,
} from 'nitro-webview'
```

| Export | Notes |
| --- | --- |
| `BRIDGE_NAME` | `'ReactNativeWebView'`. Public identifier installed on `window`. |
| `ANDROID_NATIVE_BRIDGE_NAME` | `'ReactNativeWebViewNative'`. Internal Android `JavascriptInterface` name. |
| `buildBridgeScript(platform)` | Returns the literal JavaScript source string for the injected bridge. Idempotent — never overwrites a page-defined `postMessage`. |
| `evaluateBridgeScript(platform, sandbox)` | Evaluates the script against an in-memory `sandbox` (used for tests). |

### `callback` re-export

```ts
import { callback } from 'nitro-webview'
```

Re-exported verbatim from `react-native-nitro-modules`. Every event prop (`onLoadStart`, `onLoadEnd`, `onMessage`, `onError`, `onShouldStartLoadWithRequest`, `onFileDownload`, `hybridRef`) must pass through this wrapper.

## Platform setup

### iOS file upload setup

The system file picker on iOS reads from the camera, the photo library, and (for video capture) the microphone. iOS crashes the app the first time the picker accesses one of these subsystems without an explanatory string. Add all three usage descriptions to your app's `Info.plist` even if your web content only triggers one of them — iOS may surface the unified picker:

```xml
<key>NSCameraUsageDescription</key>
<string>This app uses the camera to let you upload photos and videos from web pages.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>This app needs photo library access to let you upload images from web pages.</string>
<key>NSMicrophoneUsageDescription</key>
<string>This app uses the microphone to record audio when you upload a video from a web page.</string>
```

The strings are shown verbatim in the iOS permission prompt — rewrite them in your app's voice and supported locales.

### Android file upload setup

The library ships its own FileProvider declaration with authority `${applicationId}.nitrowebview.fileprovider`. The consuming app must still declare the media permissions in its `AndroidManifest.xml` for the file chooser to surface photos / videos / camera capture:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
```

The library also pulls `org.mozilla.components:support-utils` for its Content-Disposition–aware `DownloadUtils.guessFileName` — the consuming app must expose Mozilla's Maven repository in its `android/build.gradle`:

```groovy
allprojects {
  repositories {
    maven { url "https://maven.mozilla.org/maven2" }
  }
}
```

## License

MIT.

[nitro]: https://github.com/mrousavy/nitro
