# Props

`NitroWebView` accepts React Native view layout props and the WebView props below. Wrap all event and hybrid-ref callbacks with `callback()`.

## Content and settings

| Prop | Type | Behavior |
| --- | --- | --- |
| `source` | `WebViewSource` | URI or inline HTML. Required. |
| `defaultHeaders` | `Record<string, string>` | Source-initiated headers; source headers win case-insensitively. |
| `userAgent` | `string` | Overrides the UA for all WebView requests. Empty restores the default. |
| `javaScriptEnabled` | `boolean` | Default true. Android mutable; iOS initial-only. |
| `domStorageEnabled` | `boolean` | Default true. Android only; iOS always enables DOM storage. |
| `cacheEnabled` | `boolean` | Android cache mode; iOS policy on the next source load. |
| `incognito` | `boolean` | Default false. iOS separate ephemeral store; Android rejects true. |
| `sharedCookiesEnabled` | `boolean` | Default false. iOS one-time app-cookie import before the first load. |
| `thirdPartyCookiesEnabled` | `boolean` | Android per-view third-party cookie policy; iOS ignores it. |
| `scrollEnabled` | `boolean` | Default true. iOS only; Android no-op. |
| `bounces` | `boolean` | Default true. iOS only; Android no-op. |
| `scalesPageToFit` | `boolean` | Default false. Android overview and wide viewport; iOS no-op. |
| `allowsBackForwardNavigationGestures` | `boolean` | Default false. iOS history swipes; Android no-op. |
| `mediaPlaybackRequiresUserAction` | `boolean` | Default true. iOS initial-only; Android mutable. |
| `allowsInlineMediaPlayback` | `boolean` | Default false on iOS; needs HTML playsinline. Android already inline. |
| `injectedJavaScript` | `string` | Document-end injection on page loads. |
| `injectedJavaScriptBeforeContentLoaded` | `string` | Main-frame start injection; older Android WebViews have a timing fallback. |
| `allowedMessageOrigins` | `string[]` | Exact HTTP(S) origins. Omitted allows all; [] denies all. |
| `mediaCapturePermissionOrigins` | `string[]` | Android camera/microphone origins. Default denies all. |
| `geolocationPermissionOrigins` | `string[]` | Android location origins. Default denies all. |
| `interceptSubframeNavigation` | `boolean` | Default false. Android iframe interception opt-in; iOS ignores it. |

## Callbacks and refs

`hybridRef` receives `NitroWebViewType`. The normal React `ref` is a host ref. Call [methods](./methods.md) through the hybrid ref.

| Callback | Argument | Behavior |
| --- | --- | --- |
| `onLoadStart` | `WebViewLoadEvent` | Main-document loading begins. |
| `onLoad` | `WebViewLoadEvent` | Successful completion only, before onLoadEnd. |
| `onLoadProgress` | `WebViewLoadProgressEvent` | Estimate in nativeEvent.progress, from 0 to 1. |
| `onLoadEnd` | `WebViewLoadEvent` | Terminal event, including failed loads. |
| `onNavigationStateChange` | `WebViewNavigationState` | Direct state, without a nativeEvent wrapper. Includes SPA history. |
| `onMessage` | `WebViewMessageEvent` | Page string and available native sender information. |
| `onError` | `NitroWebViewErrorEvent` | Transport, configuration, source, or blob errors; inspect domain. |
| `onHttpError` | `NitroWebViewHttpErrorEvent` | Main-frame HTTP 4xx/5xx, not subresources. |
| `onFileDownload` | `FileDownloadEvent` | HTTP metadata or a resolved platform-specific blob reference. |
| `onOpenWindow` | `OpenWindowEvent` | New-window destination; notify-only. Suppresses the in-place fallback. |
| `onRenderProcessGone` | `NitroWebViewRenderProcessGoneEvent` | Android API 26+ destroys this view; iOS supports reload. |
| `onScroll` | `NitroWebViewScrollEvent` | Unthrottled scroll stream. Geometry differs by platform. |
| `onShouldStartLoadWithRequest` | `ShouldStartLoadRequest` | Returns `boolean` or `Promise<boolean>`. Check platform timing and coverage. |

## Initial settings

On iOS, `incognito`, `sharedCookiesEnabled`, `javaScriptEnabled`, `mediaPlaybackRequiresUserAction`, and `allowsInlineMediaPlayback` apply before the first load. Remount with a new React `key` to change them.

Read [navigation](../guides/navigation.md), [messaging](../guides/messaging.md), and [platform differences](./platforms.md) for restrictions.
