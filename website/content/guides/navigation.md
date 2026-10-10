# Navigation

Use `source` for app-initiated loads. Use the navigation callback for requests delivered by the platform's interception hook.

## Allow or cancel a request

```tsx
import {
  NitroWebView, callback, createOriginWhitelistGuard,
} from 'nitro-webview'

export default function Browser() {
  return (
    <NitroWebView
      style={{ flex: 1 }}
      source={{ uri: 'https://app.example.com' }}
      onShouldStartLoadWithRequest={callback(
        createOriginWhitelistGuard(['https://app.example.com'])
      )}
    />
  )
}
```

The public handler accepts `ShouldStartLoadRequest` and returns `boolean | Promise<boolean>`. `false` cancels silently. Blocked requests do not emit `onError`.

### Timing

| Platform | Behavior |
| --- | --- |
| Android | Nominal 250 ms monotonic wait budget. Timeout, rejection, interruption, and recoverable callback failures allow the request. Late results are ignored. |
| iOS | No library timeout. An unresolved Promise can keep navigation pending. `stopLoading()`, view removal, or content-process termination cancel pending decisions. |

Android cannot preempt callback execution or OS scheduling. **250 ms is not a maximum UI delay.** Keep the callback fast and resolve every Promise.

### Coverage

Android app-initiated `source` loads and POST requests do not enter this hook. Subresources are outside its contract. Android iframe interception is opt-in with `interceptSubframeNavigation`; iOS delivers iframe requests without this flag.

Navigation helpers are not a complete network security boundary. Configure message and media-origin policies separately.

## New windows

`target="_blank"` and `window.open()` surface through `onOpenWindow`. No second native WebView is created.

Without a handler, the destination loads in the current view. With a handler, the fallback is suppressed. Update `source` to load in place, or validate the URL before opening it elsewhere. The callback's return value has no effect.

## History and SPA routes

Call `goBack()` or `goForward()` through the hybrid ref. Read `canGoBack` and `canGoForward` from `onNavigationStateChange`.

SPA `pushState`, `replaceState`, and `popstate` changes update navigation state. They do not enter the interception callback and cannot be vetoed there.

## POST and headers

```tsx
<NitroWebView source={{
  uri: 'https://app.example.com/submit',
  method: 'POST',
  body: 'name=Nitro&source=app',
}} />
```

POST requires HTTP(S). A GET source cannot have a body. Android POST cannot use nonempty `source.headers` or `defaultHeaders`.

For supported source loads, source headers override defaults case-insensitively. Duplicate logical names within either map fail with `NitroWebViewSource`. These headers are not reapplied to redirects, links, iframes, or subresources.
