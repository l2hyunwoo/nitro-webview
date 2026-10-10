# JavaScript

Choose evaluation when you need a value, injection for side effects, or a script prop for each page load.

## Evaluate and read a result

```ts
const json = await webview.evaluateJavaScript('({ title: document.title })')
const result = JSON.parse(json)
console.log(result.title)
```

`evaluateJavaScript` returns **JSON text** on both platforms. Parse it once. Undefined and null produce the string `"null"`. Use JSON-compatible results.

| Page result | Returned text |
| --- | --- |
| `2` | `2` |
| `'hello'` | `"hello"` |
| `({ a: 1 })` | `{"a":1}` |
| `undefined`, `null` | `null` |

iOS rejects evaluation and serialization errors. Android cannot distinguish a page exception from a null result. JSON whitespace and object key order are not contractual.

## Run a side effect

```ts
webview.injectJavaScript("document.body.dataset.theme = 'dark'")
```

This method returns `void`. It does not report the result, errors, or completion. Do not use it to confirm an operation succeeded.

## Run on every navigation

`injectedJavaScript` runs at document end. `injectedJavaScriptBeforeContentLoaded` runs in the main frame at document start when the platform supports it.

```tsx
<NitroWebView
  source={{ uri: 'https://app.example.com' }}
  injectedJavaScriptBeforeContentLoaded="window.APP_PLATFORM = 'native';"
/>
```

iOS uses a document-start `WKUserScript`. Android uses `DOCUMENT_START_SCRIPT` when available. Older Android WebViews fall back to `onPageStarted`, which **does not guarantee** execution before the first inline script.

Changing the script prop applies to the next navigation. It does not rerun it in the current page.

## Disable JavaScript

`javaScriptEnabled={false}` disables page JavaScript and the message/injection/history bridge. On iOS this is an initial setting: remount with a new React `key` to change it. Evaluation rejects when JavaScript is disabled on iOS.
