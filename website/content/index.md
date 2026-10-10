---
layout: page
sidebar: false
title: Web content. Native control.
description: A React Native WebView built on Nitro Modules. Read the guides, explore the API, and understand platform differences.
---

<HomePage>

```tsx
import { NitroWebView, callback } from 'nitro-webview'

const html = `
<h1>Hello, Nitro</h1>
<script>
  window.ReactNativeWebView.postMessage('hello from the web')
</script>
`

export default function Screen() {
  return (
    <NitroWebView
      style={{ flex: 1 }}
      source={{ html, baseUrl: 'https://app.example.com' }}
      onMessage={callback(({ nativeEvent }) => {
        console.log(nativeEvent.data)
      })}
    />
  )
}
```

</HomePage>
