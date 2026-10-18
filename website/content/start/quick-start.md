# Your first WebView

Render a page, receive its messages, and capture the native controls.

## Render a page

Give the WebView a size and a `source`. The examples below use plain callbacks, available in version 0.2.2. On version 0.2.1, wrap event and `hybridRef` callbacks with `callback`; that form remains supported.

```tsx
import { NitroWebView } from 'nitro-webview'

export default function Screen() {
  return (
    <NitroWebView
      style={{ flex: 1 }}
      source={{ uri: 'https://example.com' }}
      onLoadEnd={({ nativeEvent }) => {
        console.log('Finished:', nativeEvent.url)
      }}
      onMessage={({ nativeEvent }) => {
        console.log('Page said:', nativeEvent.data)
      }}
    />
  )
}
```

`onLoadEnd` includes failed loads; use `onLoad` for successful completion.

## Send a page message

Inside a loaded page you control:

```js
window.ReactNativeWebView.postMessage('hello from the web')
```

The React Native handler receives the string at `event.nativeEvent.data`. For structured messages, send JSON and validate its parsed shape in your app. Read [messages and origins](../guides/messaging.md) before handling privileged actions.

## Capture the hybrid ref

Imperative WebView methods live on `hybridRef`. The normal React `ref` is a host-component ref.

```tsx
import { useRef } from 'react'
import { Button, View } from 'react-native'
import {
  NitroWebView,
  type NitroWebViewType,
} from 'nitro-webview'

export default function Browser() {
  const webview = useRef<NitroWebViewType | null>(null)
  return (
    <View style={{ flex: 1 }}>
      <Button title="Reload" onPress={() => webview.current?.reload()} />
      <NitroWebView
        style={{ flex: 1 }}
        source={{ uri: 'https://example.com' }}
        hybridRef={(view) => { webview.current = view }}
      />
    </View>
  )
}
```

Keep calls within the mounted view's lifecycle. Clear a retained ref when removing the view or recovering from an Android renderer exit.

## Use inline HTML

```tsx
<NitroWebView
  style={{ flex: 1 }}
  source={{
    html: '<h1>Hello, Nitro</h1>',
    baseUrl: 'https://app.example.com',
  }}
/>
```

`baseUrl` resolves relative URLs. An HTML document is not a fetched HTTPS response; choose your message policy and content trust explicitly.
