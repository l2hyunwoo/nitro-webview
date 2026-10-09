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

`nitro-webview` is a WebView component for React Native using [Nitro Modules][nitro]'s JSI dispatch. Migration requires callback wrappers, hybrid refs, and a review of platform-specific props. It targets two audiences:

- **Experienced RN + Nitro developers** who want a WebView that uses the Nitro view contract: `getHostComponent`, hybrid refs, `callback(...)` event handlers, and Promise method results.
- **Teams evaluating WebView libraries** ("comparison shoppers") who already use `react-native-webview` and want to know what they keep, what changes, and what improves before they switch.

### What you keep coming from `react-native-webview`

- Same conceptual props (`source`, `userAgent`, `injectedJavaScript`, `onLoadStart` / `onLoadEnd`, `onMessage`, `onError`, `onShouldStartLoadWithRequest`, `onFileDownload`).
- Same `window.ReactNativeWebView.postMessage(...)` page-side contract.
- Same `originWhitelist`-style default (`['http://*', 'https://*']`) exposed as `DEFAULT_ORIGIN_WHITELIST`.
- Same `WebViewNavigationType` string union (`'click' | 'formsubmit' | 'backforward' | 'reload' | 'formresubmit' | 'other'`).

### What changes

- Event props must be wrapped in `callback(...)` from `react-native-nitro-modules` so Nitro can dispatch them on the right thread.
- Public `onShouldStartLoadWithRequest` callbacks accept `boolean | Promise<boolean>`. Platform waiting and fallback rules differ; see the [migration guide](MIGRATION.md#navigation-timing-and-public-callbacks).
- Imperative methods (`goBack`, `evaluateJavaScript`, `getCookies`, `setCookie`, `clearCookies`, …) live on the **hybrid ref** captured via the `hybridRef` prop, not on a React `ref`.
- Native package: `io.github.l2hyunwoo.nitro.webview` (Android). MIT-licensed, npm-published as `nitro-webview` (unscoped).

### Why Nitro

Nitro Modules pipes props, methods, and event callbacks through JSI so a load event or a cookie read does not round-trip through `NativeEventEmitter` or the bridge's serialization queue. For a WebView — which is event-heavy (navigation, messages, errors, downloads) — that is the main practical win.

## Quick Start

This branch describes the unreleased `0.2.0` candidate. Its package version remains `0.1.0` until release validation completes.
An npm installation uses the API in that published version, which can differ from this branch.
See the [migration guide](MIGRATION.md) before adopting candidate behavior.

### Support candidate

Native views require React Native's New Architecture. The candidate dependency ranges are:

| Dependency | Candidate peer range | Development pin |
| --- | --- | --- |
| React Native | `~0.85.3` | `0.85.3` |
| React | `19.2.3` | `19.2.3` |
| Nitro Modules | `^0.35.9` | `0.35.9` |
| Nitrogen generator | Development only | `0.35.9` |

The initial boundary combinations are below. Native results are pending and do not yet confirm the ranges.

| Boundary | React Native | React | Nitro Modules | Native builds and device smoke |
| --- | --- | --- | --- | --- |
| Lower | `0.85.3` | `19.2.3` | `0.35.9` | Pending |
| Upper candidate selected 2026-10-10 | `0.85.3` | `19.2.3` | `0.35.10` | Pending |

RN 0.85.3 embeds React renderer 19.2.3 and checks the exact React version at runtime, so this candidate pins React 19.2.3.
RN 0.85.3 requires Android API 24 or later and iOS 15.1 or later.
These requirements come from its `gradle/libs.versions.toml` and `scripts/cocoapods/helpers.rb` files.
Use Node.js 22.13 or later in the Node 22 line for the development checks.
visionOS is declared in the podspec but has no verified support result. macOS and Windows have no implementation.
Record the candidate SHA, package integrity, OS, SDK, System WebView version, and smoke results before confirming support.

### Package and release checks

`yarn prepare` and `yarn prepack` compile TypeScript. They do not run Nitrogen.
Run `yarn check:codegen` to generate bindings and reject changes under `nitrogen/generated`.
Run `yarn test:package` to build declarations, inspect an actual npm tarball, and compile package-root imports in an isolated consumer.
The package check installs the tarball with lifecycle scripts disabled. It does not perform native builds.
CI checks the lower and upper candidate combinations with at most two package jobs.

The example's `link:..` dependency supports local development. Metro also resolves an installed tarball through its normal package entry.
It does not replace `nitro-webview` with a fixed repository source path.
Before release, install the packed tarball in a separate native app and run both platform builds and the normal-root smoke checks.
Match that artifact and all required results to the release SHA. A missing, skipped, or failed required check blocks release.
The existing manual release workflow also repeats codegen and package checks on the version commit before publishing.

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
| `defaultHeaders` | `Record<string, string>` | Headers for main-frame requests initiated by a `source` change. `source.headers` win case-insensitively. Duplicate logical names within either map emit `NitroWebViewSource` (-1) without loading. |
| `userAgent` | `string` | Overrides the platform default UA for every request (main-frame + sub-resource). `undefined` / empty restores the WebKit / Chromium default. |
| `javaScriptEnabled` | `boolean` | Enable JS. Default `true`. Android: mutable. iOS: initial setting; remount to change. False disables bridge and injected scripts. |
| `domStorageEnabled` | `boolean` | Enable `localStorage` / `sessionStorage`. Default `true`. Android: mutable. iOS: always on (no-op). |
| `cacheEnabled` | `boolean` | HTTP cache. Android: `cacheMode` `LOAD_DEFAULT` / `LOAD_NO_CACHE`. iOS: `URLRequest.cachePolicy` on the next `source` load. |
| `incognito` | `boolean` | iOS: a separate non-persistent store per mount; remount to change. Android: true emits an error and blocks source loading. |
| `scrollEnabled` | `boolean` | iOS-only: `scrollView.isScrollEnabled` (mutable). Android: no-op (RNW does not implement it). |
| `bounces` | `boolean` | iOS-only: `scrollView.bounces` (mutable). Android: no-op. |
| `scalesPageToFit` | `boolean` | Android-only: `loadWithOverviewMode` + `useWideViewPort`. iOS: no-op. |
| `mediaPlaybackRequiresUserAction` | `boolean` | Require a gesture before media plays. Default `true`. Android: mutable. iOS: applied on initial mount; remount with a new `key` to change it. |
| `allowsInlineMediaPlayback` | `boolean` | iOS-only: play video inline (`false` by default). Requires HTML `playsinline`. Applied on initial mount; remount with a new `key` to change it. Android: inline by default, with HTML video fullscreen supported. |
| `allowsBackForwardNavigationGestures` | `boolean` | iOS-only: back/forward swipe gestures (mutable). Android: no-op. |
| `thirdPartyCookiesEnabled` | `boolean` | Android-only: `setAcceptThirdPartyCookies` for this WebView (mutable). iOS: no-op. |
| `sharedCookiesEnabled` | `boolean` | iOS: import app cookies once before the first load; remount to change. Cannot combine with incognito. Android: ignored. |
| `injectedJavaScript` | `string` | Fire-and-forget script run at document-END on every page load. |
| `injectedJavaScriptBeforeContentLoaded` | `string` | Script run at document-START, before the page's own scripts. iOS: `WKUserScript(.atDocumentStart)` (hard before-any-script guarantee). Android: `WebViewCompat.addDocumentStartJavaScript` when the WebView supports `DOCUMENT_START_SCRIPT`, else `evaluateJavascript` in `onPageStarted` (early, but not a strict before-first-script guarantee). Main frame only. |
| `onLoadStart` | `(event: WebViewLoadEvent) => void` | Fired when the WebView begins loading content. |
| `onLoad` | `(event: WebViewLoadEvent) => void` | Fired once after a successful main-document load, before `onLoadEnd`. Transport failures and HTTP 4xx/5xx do not fire `onLoad`. |
| `onLoadProgress` | `(event: WebViewLoadProgressEvent) => void` | Navigation state plus `nativeEvent.progress` (0..1), from WebKit estimated progress / Android WebChromeClient. Values may skip; reaching 1 does not imply success. |
| `onLoadEnd` | `(event: WebViewLoadEvent) => void` | Fired once when the main-document load ends, including errors. Terminal payloads have `loading: false`. |
| `onNavigationStateChange` | `(state: WebViewNavigationState) => void` | URL / title / `canGoBack` / `canGoForward` / `loading`. |
| `onMessage` | `(event: WebViewMessageEvent) => void` | Fires when the page calls `window.ReactNativeWebView.postMessage(...)`. |
| `onError` | `(event: NitroWebViewErrorEvent) => void` | Navigation failure (network, SSL). |
| `onFileDownload` | `(event: FileDownloadEvent) => void` | Native intercepts a download and surfaces `{ url, mimeType?, fileName?, contentLength?, userAgent? }`. Storage is the JS layer's responsibility. Also fires for `blob:` downloads, with `url` resolved to a local `file://` (iOS) / `data:` (Android) URL — see [`FileDownload`](#filedownload--filedownloadevent). |
| `onHttpError` | `(event: NitroWebViewHttpErrorEvent) => void` | Main-frame HTTP 4xx/5xx (`{ statusCode, url, description }`). Disjoint from `onError` (transport/SSL). Sub-resource failures are dropped. |
| `onRenderProcessGone` | `(event: NitroWebViewRenderProcessGoneEvent) => void` | Renderer crash / OS reclaim. `nativeEvent.didCrash` is Android-only (API 26+); always `undefined` on iOS. Android: clear the old hybrid ref and remount with a new React `key`. iOS: call `reload()`. |
| `onScroll` | `(event: NitroWebViewScrollEvent) => void` | Scroll stream. NOT throttled or deduped natively. iOS populates all geometry fields; Android populates `contentOffset` only. |
| `onShouldStartLoadWithRequest` | `(event: ShouldStartLoadRequest) => boolean \| Promise<boolean>` | Allow or cancel requests delivered by the platform navigation hook. Returning `false` (or a `Promise` resolving to `false`) cancels silently. See platform timing and coverage below. |
| `interceptSubframeNavigation` | `boolean` | Android opt-in for iframe requests, default `false`. Each callback has a nominal 250 ms wait budget. Repeated waits can cause UI stalls. iOS already delivers iframe requests asynchronously, so this flag has no effect there. |
| `onOpenWindow` | `(event: OpenWindowEvent) => void` | Fired for `window.open` / `target=_blank`. The WebView never spawns a second native web view; `nativeEvent.url` carries the requested URL and JS decides what to do. When the prop is unset, the URL loads in-place in the current WebView. Notify-only — the return value does not gate loading. |

SPA route changes (`history.pushState` / `replaceState` / `popstate`) surface via `onNavigationStateChange` — not `onShouldStartLoadWithRequest`, because a pushState already happened and cannot be vetoed.

On Android, renderer exit destroys the affected WebView before the event fires once.
Calls through its old hybrid ref cannot reuse it: void methods do nothing, and Promise methods reject with `NitroWebViewState`.
Pending JavaScript evaluations also reject. Cookie or cache work already submitted to the platform can still complete.
Show a recovery screen, then change the React `key` when the user retries.
Clear the old ref and capture the new ref through `hybridRef`.
Remounting loses page history and input. Do not automatically resend POST sources.
See the [renderer recovery example](example/src/RendererRecoveryVerificationScreen.tsx) and [device check](example/README.md#android-renderer-recovery).

#### Methods (via `hybridRef`)

The hybrid ref captured by `hybridRef={callback((r) => ref.current = r)}` exposes:

| Method | Return | Notes |
| --- | --- | --- |
| `goBack()` | `void` | Navigate back in history. |
| `goForward()` | `void` | Navigate forward in history. |
| `reload()` | `void` | Reload the current page. |
| `stopLoading()` | `void` | Stop the current load. On iOS, also cancel pending navigation decisions and a source waiting for shared-cookie import. |
| `evaluateJavaScript(code)` | `Promise<string>` | Returns JSON text on both platforms. Use `JSON.parse` once. Undefined/null return `null` as JSON text. Only JSON-compatible results are supported. |
| `injectJavaScript(code)` | `void` | Fire-and-forget execution — no result awaited. Use for side effects only. No-op if no page is loaded. |
| `postMessage(data)` | `void` | Push a string into the page as a DOM `message` event (`event.data === data`). Listen on **both** targets for portability: `window.addEventListener('message', ...)` (iOS) and `document.addEventListener('message', ...)` (Android). Dispatched once, no buffering. `data` is escaped safely (quotes, newlines, `</script>`, unicode). |
| `getCookies(url)` | `Promise<Cookie[]>` | iOS returns the full attribute set. Android `CookieManager` only exposes `name` and `value` on read — other fields are left `undefined`. |
| `setCookie(url, cookie)` | `Promise<void>` | `Cookie = { name, value, domain?, path?, expires?, secure?, httpOnly? }`. `expires` is milliseconds since epoch (`Date.now()`-compatible). |
| `clearCookies()` | `Promise<void>` | Bulk clear via `WKWebsiteDataStore` (iOS) / `CookieManager.removeAllCookies` (Android). The promise resolves only after the platform reports completion. |
| `clearCache()` | `Promise<void>` | Clear the disk + memory resource cache only (NOT cookies/localStorage/history). iOS scopes `removeData` to `{DiskCache, MemoryCache}`; Android calls `clearCache(true)`. |
| `clearHistory()` | `Promise<void>` | Clear back/forward history. Android: `WebView.clearHistory()`. **iOS: no-op** — `WKWebView.backForwardList` is read-only with no public prune API (resolves without clearing; remount with a new React `key` for a pristine stack). |
| `requestFocus()` | `Promise<void>` | Move input focus to the WebView. iOS `becomeFirstResponder()`; Android `requestFocus()`. Resolves regardless of the responder's own return value. |

`evaluateJavaScript` evaluates the supplied code once. It does not wrap the code in `eval` or require CSP `unsafe-eval`.

```ts
const encoded = await ref.current.evaluateJavaScript('({ a: 1 })')
const value = JSON.parse(encoded) // { a: 1 }
```

| JavaScript result | JSON text |
| --- | --- |
| `2`, `true` | `2`, `true` |
| `'hello'` | `"hello"` (including quotes) |
| `{ a: 1 }`, `[1, 'a']` | `{"a":1}`, `[1,"a"]` |
| `null`, `undefined` | `null` |

iOS rejects native evaluation and JSON serialization errors. Android cannot distinguish a page JavaScript exception from a null result.
Object key order and JSON whitespace are not part of the contract.

### Types

The package root exports HTTP error, renderer exit, scroll, and open-window events, including their nested payload types and `WebViewPoint`.
Public `NitroWebViewProps` and `OnShouldStartLoadWithRequest` accept synchronous or async decisions. The React component forwards its standard `ref` and passes `hybridRef` through to the native view. Set `onShouldStartLoadWithRequest` through React props; assigning it directly through `hybridRef` bypasses the component's result bridge and is unsupported.

Rebuild the native app when upgrading to the 0.2 candidate; its navigation callback bindings are incompatible with older native binaries. Public callback signatures remain unchanged.

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
  isTopFrame?: boolean       // both platforms — false for iframe / sub-frame
  hasTargetFrame?: boolean   // iOS only — false for target=_blank
}

type WebViewNavigationType =
  | 'click' | 'formsubmit' | 'backforward'
  | 'reload' | 'formresubmit' | 'other'
```

`isTopFrame` is populated on both platforms (`targetFrame?.isMainFrame` on iOS, `WebResourceRequest.isForMainFrame` on Android). `mainDocumentURL` and `hasTargetFrame` remain iOS-only and are `undefined` on Android; Android always reports `navigationType: 'other'`.

The callback can return a boolean or a `Promise<boolean>`. A thrown error, Promise rejection, or invalid runtime result allows the request on both platforms.

- **Android:** the native callback uses a nominal 250 ms wait budget, starting before callback invocation and Promise subscription. Timeout, interruption, and recoverable callback or subscription failures allow the request. Late results are ignored. Callback execution and OS scheduling can exceed this budget, so 250 ms is not a maximum UI delay.
- **iOS:** there is no library timeout. An unresolved Promise can keep its navigation pending while the view remains active. `stopLoading()`, view removal, and content process termination cancel pending decisions. Each WebKit handler completes once, and late results are ignored. Starting another navigation does not cancel other pending iframe decisions.

This hook only covers requests delivered by the platform. Android does not call it for app-initiated `source` loads or POST requests. Subresources are outside this contract. SPA history changes use `onNavigationStateChange`, and new windows use `onOpenWindow`. Neither this hook nor the origin allowlist helpers provide a complete network security boundary.

#### `OpenWindowEvent`

```ts
interface OpenWindowEvent {
  nativeEvent: { url: string }
}
```

Fired by `onOpenWindow` when the page requests a new window. `url` is the absolute URL the page asked to open (iOS `WKNavigationAction.request.url`; Android the URL observed inside `WebChromeClient.onCreateWindow`).

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
  url: string             // normal download: remote http/https URL.
                          // blob download: a resolved LOCAL reference (see below).
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

**Blob downloads (`blob:`) — deliberately platform-asymmetric.** A `blob:`
URL is not fetchable natively (its bytes live only in the web context), so the
two platforms resolve it differently and `onFileDownload.nativeEvent.url`
carries a **local** reference instead of the `blob:` URL:

- **iOS** streams the blob to a temp file natively via `WKDownloadDelegate`
  (iOS 14.5+) — `url` is a local `file://` URL. No bytes cross the JS bridge.
- **Android** has no `WKDownloadDelegate` equivalent, so it injects a reader
  that resolves the blob in-page (`fetch → FileReader.readAsDataURL`) and
  bridges it back — `url` is a `data:` URL (base64). This is O(fileSize) in
  memory; fine for the common blob (generated CSV/PDF/image, a few MB), but a
  very large blob will strain the bridge.

Either way a consumer already listening to `onFileDownload` receives blob
downloads for free (no extra prop) and can `fetch()`/save `url` uniformly.

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
| `wrapWithOriginWhitelist(handler, patterns?)` | `(OnShouldStartLoadWithRequest, readonly string[]?) => OriginWhitelistGuard` | Uses the same policy as `createOriginWhitelistGuard(patterns, handler)`, including with the shared or copied default patterns. |

`OnShouldStartLoadWithRequest` accepts `boolean | Promise<boolean>`. Both guards return `Promise<boolean>` and propagate handler throws or rejections.
The URL parser removes default ports (`http:80`, `https:443`). Patterns remain literal apart from case and `*` matching.
For example, `https://example.com:443/page` matches `https://example.com`, while the pattern `https://example.com:443` does not.

```ts
import { wrapWithOriginWhitelist } from 'nitro-webview'

const handler = wrapWithOriginWhitelist(
  (event) => new URL(event.url).hostname !== 'example.org',
)
```

The helper checks only URLs delivered to the navigation callback. It does not validate initial `source`, Android POST requests, subresources, or message origins.
This helper is not a network ACL. Android allows navigation if the native decision wait times out or the callback rejects.
Default HTTP(S) patterns still consult the handler, so returning `false` blocks a matching event.

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

## E2E tests

The primary native regression suite runs through the example app's normal
AppRegistry root. `Regression verification` shows each case's PASS/FAIL result and
uploads progress and final results to a local fixture server. It checks real native
callbacks, methods, storage, navigation, and Android renderer recovery.

Install dependencies first. Build and install the example app on a booted target
before running the suite. Run these commands from the repository root:

```sh
yarn install && yarn prepare
(cd example && yarn install)

# iOS: use the UDID of an already booted simulator.
SIM_UDID='<booted-simulator-udid>'
(cd example/ios && bundle install && bundle exec pod install)
xcodebuild -workspace example/ios/example.xcworkspace -scheme example \
  -configuration Debug -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$SIM_UDID" \
  -derivedDataPath example/ios/build CODE_SIGNING_ALLOWED=NO build
xcrun simctl install "$SIM_UDID" \
  example/ios/build/Build/Products/Debug-iphonesimulator/example.app
node example/scripts/run-regression.mjs ios "$SIM_UDID"

# Android: use the serial of an already booted emulator or connected device.
ANDROID_SERIAL='<booted-device-serial>'
(cd example/android && ./gradlew :app:assembleDebug --no-daemon)
adb -s "$ANDROID_SERIAL" install -r \
  example/android/app/build/outputs/apk/debug/app-debug.apk
node example/scripts/run-regression.mjs android "$ANDROID_SERIAL"

# Fixture and runner host tests need no device.
node --test example/scripts/__tests__/*.test.mjs
```

The runner uses `agent-device@0.17.4` to open the app and select `Run regression`.
It starts the fixture on port 8098 and Metro on port 8081. Its Metro process uses
two workers and a 768 MiB Node heap limit. It can reuse Metro from this example
directory, leaving that process running. It refuses an unrelated Metro process.
Android uses explicit-device `adb reverse` for both ports. Cleanup stops only the
runner's own processes and session, leaving the device booted.

The runner polls for up to 240 seconds. Success requires all 21 named Android cases
or all 24 named iOS cases, with `complete: true` and every `ok: true`. Missing,
incomplete, duplicate, or failed cases make the command fail. Android includes an
actual renderer crash, stale-ref checks, and an explicit fresh-view retry.
The history case uses a real native tap because
[Chromium can skip history entries created without user activation](https://chromium.googlesource.com/chromium/src/+/refs/heads/lkgr/docs/history_manipulation_intervention.md).

Each run first removes only prior evidence with its own `<platform>-regression-`
prefix. Evidence is saved in `example/artifacts/`: `<platform>-regression-results.json`,
`<platform>-regression-requests.json`, `<platform>-regression-success.png`, and UI,
fixture, and Metro logs. A successful run fails if it cannot save its device screenshot.
Failures also save a screenshot and native logs when available. Fixture request records include
cookie names and authorization match/count fields, without cookie or authorization
values.

CI invokes this runner on every PR for Android. iOS runs on pushes to main and PRs
with the `e2e-ios` label. `.github/workflows/e2e.yml` builds, installs, runs, and
uploads evidence. `.github/workflows/ci.yml` also runs the fixture and runner host
tests.

The remaining [react-native-harness][harness] tests in
`example/src/__tests__/*.harness.tsx` are mount smoke checks. They do not verify
load, message, or HTTP-error callbacks. Use the AppRegistry regression suite for
that coverage.

## License

MIT.

[nitro]: https://github.com/mrousavy/nitro
[harness]: https://github.com/callstackincubator/react-native-harness


### POST sources

```tsx
<NitroWebView source={{ uri: 'https://example.com/form', method: 'POST', body: 'name=Nitro+WebView' }} />
```

`method` defaults to `GET`. POST sends `body` as UTF-8 (empty when omitted)
and requires an HTTP(S) URI. A GET source cannot specify a body.
Android uses `WebView.postUrl`, whose body must be form-urlencoded; encode the
form yourself. Android POST cannot attach custom headers: any nonempty
`source.headers` or `defaultHeaders` emits `onError` with domain
`NitroWebViewSource`, code `-1`, and skips navigation. iOS POST supports the
usual merged headers, including an explicit `Content-Type` for the body.
Invalid source combinations likewise emit `onError` before a load starts.

For a server-side echo check, run `node example/scripts/post-verification-server.mjs`
and mount `PostVerificationScreen` from the example. Android also needs
`adb reverse tcp:18965 tcp:18965`. The WebView displays the actual HTTP response;
the server logs the received method, body, and content type.

### Camera, microphone, and location

On Android, WebView requests are denied by default. Opt in only origins you trust:

```tsx
<NitroWebView
  source={{ uri: 'https://app.example.com' }}
  mediaCapturePermissionOrigins={['https://app.example.com']}
  geolocationPermissionOrigins={['https://app.example.com']}
/>
```

These Android-only lists match exact HTTP(S) origins (scheme, host, and effective
port), including requesting iframe origins. Wildcards, credentials, query strings,
fragments, and non-root paths are rejected. This policy is separate from navigation
allowlists. Secure-context requirements still apply to browser APIs.

Declare the permissions your app uses in its **app** AndroidManifest.xml:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

The host must implement React Native's `PermissionAwareActivity` (as ReactActivity
does). Missing runtime permissions prompt the user. Approximate location is
accepted. Only camera/microphone resources actually allowed by Android are granted;
unknown resources are never granted. Location grants are not persisted in WebView.
Concurrent requests awaiting OS consent may be denied; retry after the active
request finishes. Avoid requesting app permissions through another module while
this prompt is open because ReactActivity has one permission listener. Removing an
origin blocks subsequent requests and pending grants; it does not stop an existing
media stream. Stop its tracks or unmount the WebView to end capture.

On iOS, WKWebView keeps the system's website permission prompts; the two origin
props have no effect. Add `NSCameraUsageDescription`, `NSMicrophoneUsageDescription`,
and `NSLocationWhenInUseUsageDescription` to the application's Info.plist for the
features used. Camera/microphone web capture requires a supported WKWebView version
(iOS 14.3+) and a secure context. User or system denial still takes precedence.

`example/src/PermissionsVerificationScreen.tsx` exercises real `getUserMedia` and
`getCurrentPosition` calls with visible PASS/FAIL results. Use a device with camera,
microphone, and location available. Android deny mode checks that origin policy
still blocks access after OS permissions have been granted. Location timeout or
unavailable hardware is a FAIL, not a simulated success.

### Session settings and cookie scope

On iOS, `incognito`, `javaScriptEnabled`, and `sharedCookiesEnabled` are initial
settings, applied before the first source loads. Change the React `key` to change
them. A live change emits `NitroWebViewConfiguration` and blocks a new source in
that prop batch. Each incognito mount gets a separate in-memory store. Combining
incognito and shared cookies is an error. Android rejects `incognito=true` and
starts no source request; its CookieManager remains process-wide.

`sharedCookiesEnabled` imports non-expired app cookies once, before the first
request. It does not synchronize later changes. Imported cookies replace matching
name/domain/path entries. JavaScript-disabled iOS views have no message/history
bridge or injected user scripts, and `evaluateJavaScript` rejects.

Cookie APIs require absolute HTTP(S) URLs. On iOS all cookie and cache methods
use the mounted view's selected store. Clearing a private store does not clear
another private store. Persistent iOS views share the default store, and Android
views share CookieManager, so `clearCookies()` affects other views in that store.
Cache clearing removes resource cache only, leaving cookies and DOM storage.

```tsx
<NitroWebView key={`session-${sessionId}`} incognito={privateSession}
  source={{ uri: 'https://example.com' }} />
```
