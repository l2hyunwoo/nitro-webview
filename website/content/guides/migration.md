# Migration

Nitro WebView shares familiar WebView concepts, but migration requires API and behavior changes.

## From react-native-webview

| Existing pattern | Nitro WebView |
| --- | --- |
| `WebView` import | Named `NitroWebView` export |
| Raw event functions | `callback(handler)` wrappers |
| WebView methods on React `ref` | `hybridRef={callback(...)}` |
| `originWhitelist` prop | `createOriginWhitelistGuard` in the navigation callback |
| Synchronous interception assumptions | Public `boolean \| Promise<boolean>` with platform-specific timing |
| Page `ReactNativeWebView.postMessage` | Same string contract |

Only documented props are implemented. There is no automatic equivalent for every react-native-webview prop. Check [props](../reference/props.md) and [platform support](../reference/platforms.md).

## From 0.1 to the 0.2 candidate

- `evaluateJavaScript` returns JSON text. Parse once rather than treating the result as a raw string.
- Source headers override defaults case-insensitively. Duplicate logical header names now fail validation.
- An origin helper combines the allowlist and your handler's decision, including the default patterns.
- Android renderer exit destroys the old view. Clear its ref and remount on retry. Do not replay POST automatically.
- iOS initial-only session and JavaScript settings need a remount when changed. Android does not support `incognito`.
- Review cookie-store scope before using `clearCookies()`.
- Native callback bindings changed. **Rebuild the native binary** with the matching JavaScript package and generated bindings.

The public navigation callback still returns `boolean | Promise<boolean>`. Your app does not call an internal decision resolver.

The candidate targets RN `~0.85.3`, React `19.2.3`, and Nitro `^0.35.9`. The development runtime/generator use 0.35.9. A peer range is a support policy, not proof that every future combination passed native tests.

Before upgrading production, test your authentication, downloads, file inputs, rejected navigations, and renderer recovery on the devices you support.
