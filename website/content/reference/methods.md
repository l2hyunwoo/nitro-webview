# Methods

Call these methods on the `NitroWebViewType` received through `hybridRef={callback(...)}`.

| Method | Return | Behavior |
| --- | --- | --- |
| `goBack()` | `void` | Go back in history. |
| `goForward()` | `void` | Go forward in history. |
| `reload()` | `void` | Reload the current page. |
| `stopLoading()` | `void` | Stop loading; iOS also cancels pending navigation decisions and a source waiting for shared-cookie import. |
| `evaluateJavaScript(code: string)` | `Promise<string>` | JSON text. Parse once. iOS rejects evaluation/serialization errors; Android page exceptions can look like null. |
| `injectJavaScript(code: string)` | `void` | Side effect only. No result or completion signal. |
| `postMessage(data: string)` | `void` | Dispatch a page message once. iOS window; Android document. |
| `getCookies(url: string)` | `Promise<Cookie[]>` | Absolute HTTP(S) URL. iOS selected store; Android name/value only. |
| `setCookie(url: string, cookie: Cookie)` | `Promise<void>` | Write to the selected store. Expiry in milliseconds. |
| `clearCookies()` | `Promise<void>` | Remove every cookie in the store, including other origins/views sharing it. |
| `clearCache()` | `Promise<void>` | Resource cache only. Preserves cookies, DOM storage, and history. |
| `clearHistory()` | `Promise<void>` | Android clears past/forward entries except the current page. iOS no-op. |
| `requestFocus()` | `Promise<void>` | Request native focus. Resolution is not proof of DOM input focus. |

## Lifecycle and failures

After Android renderer exit, old void calls do nothing and old Promise calls reject with `NitroWebViewState`. Remount on retry and capture a new ref. Cookie/cache work already submitted to the platform can still complete.

After iOS unmount, store methods reject rather than falling back to a default store.

Read [JavaScript](../guides/javascript.md), [cookies and sessions](../guides/cookies.md), and [troubleshooting](../guides/troubleshooting.md).
