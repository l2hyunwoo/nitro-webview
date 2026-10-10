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

These changes are unreleased. The package version remains `0.1.0` until the release checks pass.
Use the README from your installed package version when comparing published behavior.

### Dependencies and native architecture

The candidate narrows previously unrestricted peers to React Native `~0.85.3`, React `19.2.3`, and Nitro Modules `^0.35.9`.
Consumers outside these ranges receive a peer dependency conflict. This policy follows the validation baseline; it does not establish that other React Native versions are incompatible.
Native views require the New Architecture. Nitro Modules / Nitrogen development pins remain `0.35.9`.
See the [support policy and verification limits](../start/installation.md#requirements).

### JavaScript evaluation returns JSON

`evaluateJavaScript()` still returns `Promise<string>`. Its successful result is now a JSON string on both platforms.
Use `JSON.parse()` once when you need the value:

```ts
const title = JSON.parse(await ref.evaluateJavaScript('document.title'))
```

A JavaScript string result includes JSON quotes. Objects and arrays use JSON syntax.
`null` and `undefined` return the string `'null'`.
Do not compare iOS results with the previous `String(describing:)` output or expect an empty string for a missing value.
Do not apply another `JSON.stringify()` to the returned string unless you need to encode that string itself.

The contract covers JSON-compatible values. Object key order and whitespace are not significant.
Native evaluation errors can reject the Promise. Android can report `'null'` for cases where it cannot distinguish an exception from a null result.

### Origin helpers apply both decisions

`wrapWithOriginWhitelist(handler, patterns)` now checks the origin and the handler result for every allowed event.
The default pattern constant and a copied array use the same policy.
A handler that returns `false` can now block a matching URL with the default patterns.
A handler that returns `true` cannot allow a URL outside those patterns.
Exceptions and Promise rejections reach the native navigation fallback.

These helpers check delivered navigation events. They do not filter all network requests, Android initial sources or POST requests, or message origins.
`onMessage.nativeEvent.url` identifies the top-level page. It does not authenticate the frame that sent a message.

### Renderer recovery requires an Android remount

On Android API 26 or later, renderer exit cleans up and destroys the affected WebView before emitting `onRenderProcessGone` once.
Clear the active hybrid ref and show a recovery screen. Change the React `key` after the user chooses to retry.
Capture the new ref through `hybridRef`.
Old void methods do nothing. Old Promise methods reject with `NitroWebViewState`, including pending JavaScript evaluations.
Cookie or cache work already submitted to the platform can still complete.

A remount loses page history and input. Never automatically replay POST sources after a renderer exit.
Choose retry data and timing in the app. On iOS, `reload()` remains the content-process recovery method.

### iOS sessions and initial settings

On iOS, `incognito`, `javaScriptEnabled`, and `sharedCookiesEnabled` apply when the component mounts.
Change the React `key` to change them. A later change emits `NitroWebViewConfiguration` and blocks a source update in the same props batch.
Combining `incognito=true` with `sharedCookiesEnabled=true` is a configuration error.

Each private iOS instance uses a separate nonpersistent store. Its cookie and cache methods use that store.
`sharedCookiesEnabled` imports app cookies once before the first load. It does not continuously synchronize both stores.
Disabling JavaScript also disables the library's bridge, history shim, and script injection.

Android does not support `incognito=true`. It reports `NitroWebViewConfiguration` and does not start the source load.
Use `false` or omit the prop for a normal session. Android cookies remain process-wide.
Clearing a shared cookie store affects other WebViews using that store.
Cookie URL methods require valid HTTP(S) URLs.

### Navigation timing and public callbacks

Public navigation callbacks accept `boolean | Promise<boolean>`. Continue to wrap component callbacks in `callback(...)`.
Rebuild the native app: the component now forwards settled results through an internal decision resolver.
Set navigation callbacks through React props. Direct assignment through the hybrid ref bypasses this bridge and is rejected by the public types.
Android waits against a nominal 250 ms budget. Timeout, rejection, and interruption retain the allow fallback.
The budget does not preempt a slow callback or guarantee a strict maximum delay.
Subframe interception remains opt-in and can add waiting time on iframe-heavy pages.

iOS has no library timeout for a pending decision. It waits until the Promise settles while the view remains active.
Thrown or rejected callbacks retain the allow fallback on both platforms.
Unmount, content-process termination, and `stopLoading()` cancel pending decisions.
Late results do not replay or cancel an already completed navigation.
Android's platform hook does not cover app-initiated `loadUrl` calls or POST requests.

### Headers, history, and component refs

Header merging now ignores key casing. Source headers override default headers.
Duplicate keys with different casing inside one input map are invalid.
Android POST still rejects nonempty custom headers.

`clearHistory()` remains a successful no-op on iOS. Remount with a new `key` when you need a fresh history stack.
Imperative methods use `hybridRef`, not a React `ref`.
`NitroWebViewType` and inferred hybrid refs now expose read-only methods and Nitro lifecycle APIs. They no longer expose view props.
Move prop reads into app state and prop assignments into React props. Method calls and standard React refs remain unchanged.
This component requires changes when migrating from `react-native-webview`; unsupported props do not gain equivalents in this release.


### Blob downloads and advanced bridge helpers

Android now reads one blob per WebView, up to 8 MiB, with a 30-second timeout.
Blob failures use `onError` with domain `NitroWebViewDownload` and code `-1`.
These errors do not mark page loads as failed. Navigation and source replacement cancel Android readers.
View disposal cancels active downloads on both platforms and removes partial iOS files.
Consumers own successful iOS temporary files and their UUID directories. Move or delete them after use.

Advanced `parseBlobEnvelope(raw, pending)` callers must supply the second argument explicitly.
It accepts `{ requestId, url, fileName }`, or `undefined` when no native request is pending.
It returns a validated success payload, a result containing `error`, or `null` for an unmatched message.
`BlobDownloadRequest` and `BlobDownloadResult` describe this protocol.
Uncorrelated legacy envelopes no longer produce downloads. Native creates and owns request IDs.
