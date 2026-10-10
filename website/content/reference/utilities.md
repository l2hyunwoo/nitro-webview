# Utilities

The package root exports helpers alongside the component. Most apps only need `NitroWebView`, `callback`, and the navigation helpers.

## Callbacks and navigation

| Export | Purpose |
| --- | --- |
| `callback` | Nitro callback wrapper, re-exported from `react-native-nitro-modules` |
| `DEFAULT_ORIGIN_WHITELIST` | Frozen HTTP/HTTPS patterns: `['http://*', 'https://*']` |
| `originMatches(url, patterns)` | Match an absolute URL's origin with case-insensitive `*` patterns |
| `createOriginWhitelistGuard(patterns, handler?)` | Allow only a matching origin, then apply the optional handler |
| `wrapWithOriginWhitelist(handler, patterns?)` | Wrap a handler with the same origin policy |

The helper accepts `*`, not regular expressions. An empty pattern list blocks all. Invalid URLs do not match. Default ports normalize through the URL parser. These patterns differ from the **exact-origin** message/media lists.

## Source conversion

`isHtmlSource`, `isUriSource`, `normalizeHtmlSource`, and `sourceToCommand` normalize sources or produce `NativeViewCommand` values. The command variants are `LoadUrlCommand` and `LoadHtmlCommand`.

These helpers do not load a native view themselves or bypass native source/header validation.

## Event dispatchers

`createLoadStartDispatcher`, `createLoadDispatcher`, and `createLoadEndDispatcher` adapt native payloads and deduplicate by `navigationId`. Load-end payloads include `LoadEndOutcome`. These are low-level helpers; normal consumers use component event props.

## Bridge scripts

`BRIDGE_NAME` and `ANDROID_NATIVE_BRIDGE_NAME` name the page/native bridge endpoints. `buildBridgeScript`, `buildPostMessageScript`, and `encodeJsStringLiteral` construct or escape scripts. `evaluateBridgeScript` evaluates a script against a supplied sandbox, primarily for host tests.

Bridge construction helpers do not register a native WebView listener or prove sender identity. Never expose a privileged action based only on page JSON.

`BlobDownloadRequest` / `BlobDownloadResult` and the sandbox contracts are exported types. The component manages its own blob reader; these types are not a standalone download method.

See [types](./types.md) for all package-root type excerpts. Internal declarations that are not exported from `src/index.ts` are not public entry points.
