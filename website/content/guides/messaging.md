# Messages and origins

Page messages are strings. Native sender metadata and a message-origin policy let your app decide which messages to trust.

## Receive a message

```tsx
<NitroWebView
  source={{ uri: 'https://app.example.com' }}
  allowedMessageOrigins={['https://app.example.com']}
  onMessage={callback(({ nativeEvent }) => {
    if (nativeEvent.sourceOrigin !== 'https://app.example.com') return
    if (nativeEvent.isMainFrame !== true) return
    console.log(nativeEvent.data)
  })}
/>
```

`sourceOrigin` and `isMainFrame` come from native frame information. `nativeEvent.url` is the **top-level page URL**, not proof of the sender's identity. A JSON payload's claimed origin is also untrusted.

Validate message types, fields, and allowed operations before acting on a message.

## Configure exact origins

- Omit `allowedMessageOrigins` for unrestricted delivery.
- Use `[]` to deny all messages.
- Use exact HTTP(S) origins to filter delivery natively.

A root `/` is accepted. Paths, credentials, wildcards, query strings, fragments, and port zero are invalid. One invalid entry denies the entire list and emits `NitroWebViewConfiguration`.

Allowed child frames can still send. Check `isMainFrame` when only top-level messages should act on your app. Opaque origins report `"null"` and cannot match the HTTP(S) list.

On Android, metadata requires the installed WebView's `WEB_MESSAGE_LISTENER` feature. Without it, unrestricted messages use the legacy bridge without sender fields. A configured policy fails closed with a configuration error.

## Send a message to the page

Call `webview.postMessage('hello from native')` through the hybrid ref. In the web page, register both targets:

```js
function receive(event) {
  console.log(event.data)
}
window.addEventListener('message', receive)   // iOS
document.addEventListener('message', receive) // Android
```

Delivery is fire-and-forget, with no buffering. Install listeners before sending. JavaScript must be enabled.
