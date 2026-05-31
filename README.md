# nitro-webview

A React Native WebView built on [Nitro Modules][nitro] — pure Swift / Kotlin native sides, JSI-direct prop and event dispatch, no bridge round-trips.

The public surface mirrors `react-native-webview` where the contract is platform-portable, and diverges intentionally where Nitro lets us do better (e.g. `Promise<boolean>` callbacks instead of the lock-identifier round-trip).

## Install

```sh
yarn add nitro-webview react-native-nitro-modules
cd ios && pod install
```

`react-native-nitro-modules` is a peer dependency.

## Quick start

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

Every event prop must be wrapped in `callback(...)` so Nitro can dispatch it on the right thread.

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `source` | `WebViewSource` | `{ uri }` or `{ html, baseUrl? }`. Drives navigation. |
| `defaultHeaders` | `Record<string, string>` | Global headers for every main-frame navigation. Per-request `source.headers` win on key conflict. |
| `userAgent` | `string` | Overrides the platform default UA. `undefined` / empty restores it. |
| `injectedJavaScript` | `string` | Fire-and-forget script run on every page load. |
| `onLoadStart` / `onLoadEnd` | `(event) => void` | Load lifecycle events. |
| `onNavigationStateChange` | `(state) => void` | URL / title / canGoBack / canGoForward / loading. |
| `onMessage` | `(event) => void` | Fires when the page calls `window.ReactNativeWebView.postMessage(...)`. |
| `onError` | `(event) => void` | Navigation failure (network, SSL). |
| `onFileDownload` | `(event) => void` | Native intercepts a download and surfaces `{ url, mimeType?, fileName?, contentLength?, userAgent? }`. Storage is the JS layer's responsibility. |
| `onShouldStartLoadWithRequest` | `(event) => boolean` | Allow/block each navigation before it starts. Returning `false` cancels silently. |

### `UriSource.headers`

Per-request HTTP headers attached only to the main-frame navigation a `source` change triggers. Redirects, sub-frames, and sub-resource requests do not re-apply them.

### `ShouldStartLoadRequest`

```ts
interface ShouldStartLoadRequest {
  url: string
  navigationType: 'click' | 'formsubmit' | 'backforward' | 'reload' | 'formresubmit' | 'other'
  mainDocumentURL?: string   // iOS only
  isTopFrame?: boolean       // iOS only
  hasTargetFrame?: boolean   // iOS only
}
```

The JS callback may be `async` — the bridge transparently awaits any returned thenable before applying the decision. Combine with `wrapWithOriginWhitelist` from the same package to short-circuit trusted origins without crossing the bridge:

```ts
import { wrapWithOriginWhitelist, DEFAULT_ORIGIN_WHITELIST } from 'nitro-webview'

const handler = wrapWithOriginWhitelist(
  (event) => !event.url.startsWith('https://example.org/'),
  DEFAULT_ORIGIN_WHITELIST, // ['http://*', 'https://*']
)
```

## Methods

The hybrid ref returned by `hybridRef={callback((r) => ref.current = r)}` exposes:

| Method | Return | Notes |
| --- | --- | --- |
| `goBack()` / `goForward()` / `reload()` / `stopLoading()` | `void` | Navigation primitives. |
| `evaluateJavaScript(code)` | `Promise<string>` | Result is the serialized string evaluation. |
| `getCookies(url)` | `Promise<Cookie[]>` | iOS returns the full attribute set. Android `CookieManager` only exposes `name` and `value` on read — other fields are left `undefined`. |
| `setCookie(url, cookie)` | `Promise<void>` | `Cookie = { name, value, domain?, path?, expires?, secure?, httpOnly? }`. `expires` is milliseconds since epoch. |
| `clearCookies()` | `Promise<void>` | Bulk clear via `WKWebsiteDataStore` (iOS) / `CookieManager.removeAllCookies` (Android). |

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

## Known platform limitations

These are inherent to the underlying WebKit / Chromium contracts, not bugs in this library:

- `onShouldStartLoadWithRequest` on Android fires only for **user-initiated** navigations (`<a href>` taps, form submits, history actions). Programmatic loads — `view.loadUrl(...)` triggered by changing the `source` prop from JS — bypass `WebViewClient.shouldOverrideUrlLoading` and do not invoke the hook. iOS `WKNavigationDelegate.decidePolicyFor` fires for both programmatic and user-initiated navigations.
- `defaultHeaders` and `UriSource.headers` only apply to the **main-frame navigation** a `source` update triggers. Redirects, sub-frames, and sub-resource requests do not re-apply them.
- `onFileDownload` never auto-saves. On both platforms the library surfaces the URL + metadata and leaves storage to the JS layer (use `@dr.pogodin/react-native-fs`, `react-native-blob-util`, etc.). Blob URLs are out of scope.
- Android `getCookies(url)` returns cookies with only `name` and `value` populated (the platform `CookieManager.getCookie(url)` API does not expose the rest). iOS preserves the full attribute set.

## Example app

The `example/` directory contains a bare React Native demo that exercises every feature:

```sh
cd example
yarn install
cd ios && pod install
cd ..
yarn start --reset-cache
# In another shell:
yarn ios     # or: yarn android
```

The demo panels exercise headers, cookies, file upload, file download, user-agent overrides, and navigation interception — each with the platform-specific quirks documented above.

## Development

```sh
yarn typecheck
yarn lint
yarn test
yarn nitrogen          # regenerate codegen after touching src/specs/*.nitro.ts
swift test             # iOS native unit tests
cd example/android && ./gradlew :nitro-webview:testDebugUnitTest
```

### Style guardrails

The repo ships two layers of automated style enforcement so [`CLAUDE.md`](CLAUDE.md)'s rules cannot drift silently:

1. A **PostToolUse hook** (`.claude/settings.json`) lints every Edit/Write tool call against `scripts/claude-md-guardrails.sh`. Claude Code sessions get the same gate by default.
2. A **git pre-commit hook** at `scripts/git-hooks/pre-commit` runs the same script against every staged file. Activate once per clone:

   ```sh
   git config core.hooksPath scripts/git-hooks
   ```

Both layers share the same rule set, so adding a rule means editing `scripts/claude-md-guardrails.sh` and nothing else.

[nitro]: https://github.com/mrousavy/nitro
