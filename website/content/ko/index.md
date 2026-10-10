---
layout: page
sidebar: false
title: 웹 콘텐츠에, 네이티브의 제어를.
description: Nitro Modules 기반 React Native WebView. 시작 가이드와 API, 플랫폼별 동작을 확인하세요.
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
