# Events

Wrap event handlers with `callback()`. Most payloads use `event.nativeEvent`; `onNavigationStateChange` receives the state directly.

## Load lifecycle

| Outcome | Sequence |
| --- | --- |
| Success | `onLoadStart` → `onLoad` → `onLoadEnd` |
| Transport failure | `onLoadStart` → `onError` → `onLoadEnd` |
| Main-frame HTTP 4xx/5xx | `onLoadStart` → `onHttpError` → `onLoadEnd`; no `onLoad` |

`onLoadProgress` is an estimate from 0 to 1. Updates can skip values, and reaching 1 does not prove success. Terminal load events have `loading: false`.

## Navigation state

`WebViewNavigationState` contains `url`, `title`, `loading`, `canGoBack`, and `canGoForward`. Navigation changes include SPA history updates.

`onShouldStartLoadWithRequest` receives `ShouldStartLoadRequest`, not a `nativeEvent` wrapper. Its public return type is `boolean | Promise<boolean>`. See [navigation](../guides/navigation.md).

## Messages and windows

`WebViewMessageEvent` contains string `data`, top-level `url`, and optional native `sourceOrigin`/`isMainFrame`. See [sender policy](../guides/messaging.md).

`OpenWindowEvent.nativeEvent.url` is the requested destination. Installing a handler suppresses the default in-place load; returning a boolean does not decide it.

## Error domains

| Domain/event | Meaning |
| --- | --- |
| `NitroWebViewSource` | Invalid source/header combination; code `-1` |
| `NitroWebViewConfiguration` | Invalid or unsupported setting/policy |
| `NitroWebViewDownload` | Blob operation failure; code `-1`; does not fail the page load |
| Platform domain in `onError` | Native navigation/transport error; inspect code and description |
| `onHttpError` | Main-frame HTTP status with `statusCode`, `url`, and `description` |

Configuration/source errors can happen before loading. Do not require a load-start event before handling them. HTTP response bodies can still display. HTTP errors may repeat across redirects; they are not deduplicated.

## Renderer and scrolling

`onRenderProcessGone.nativeEvent.didCrash` is Android-only on API 26+. iOS leaves it undefined. See [recovery](../guides/troubleshooting.md#renderer-recovery).

`onScroll` is not throttled. iOS provides all geometry fields. Android provides `contentOffset`, a zero `contentSize`, and undefined iOS-only fields. Throttle expensive JS work when needed.

Full payload signatures: [types](./types.md).
