# Cookies and sessions

Cookie methods operate on the mounted view's store. Store scope differs between platforms.

## Write and read

```ts
await webview.setCookie('https://app.example.com', {
  name: 'session',
  value: 'example-token',
  path: '/',
  secure: true,
  httpOnly: true,
})
const cookies = await webview.getCookies('https://app.example.com')
```

URLs must be absolute HTTP(S) URLs. `expires` is milliseconds since the Unix epoch, not seconds. Omit it for a session cookie.

Android reads return names and values only; cookie attributes cannot be recovered from its cookie header. iOS filters its selected store by host, path, and secure scope.

## Store scope

| Configuration | Scope |
| --- | --- |
| iOS persistent | Default WebKit store, shared with other views using that store |
| iOS `incognito` | Separate non-persistent store for each mount |
| Android | Process-wide `CookieManager` |

**`clearCookies()` deletes every cookie in the selected store.** On Android it affects other WebViews. Persistent iOS views sharing the default store are also affected. It is not a single-origin logout operation.

`clearCache()` removes resource cache, not cookies, localStorage, or history.

## Private sessions on iOS

```tsx
<NitroWebView
  key={`private-${sessionId}`}
  incognito
  source={{ uri: 'https://app.example.com' }}
/>
```

`incognito` and `sharedCookiesEnabled` are initial-only on iOS. Remount to change them. Combining them emits a configuration error. Android rejects `incognito={true}` and starts no source load; it does not clear shared cookies to imitate privacy.

## Import app cookies

On iOS, `sharedCookiesEnabled` imports non-expired `HTTPCookieStorage` cookies once before the first load. It overwrites entries with matching name/domain/path. It does **not** synchronize later changes. Android ignores this prop.

For standalone cookie management, see [Nitro Cookies](https://l2hyunwoo.github.io/react-native-nitro-cookies/). Its selected store must match the WebView store. A separate module cannot select this view's private store.
