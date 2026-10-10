# 첫 WebView

페이지를 렌더링하고 메시지를 받은 뒤 네이티브 메서드를 호출합니다.

## 페이지 렌더링 {#render-a-page}

WebView의 크기와 `source`를 지정합니다. 이벤트와 `hybridRef`의 콜백은 모두 `callback`으로 감쌉니다.

```tsx
import { NitroWebView, callback } from 'nitro-webview'

export default function Screen() {
  return (
    <NitroWebView
      style={{ flex: 1 }}
      source={{ uri: 'https://example.com' }}
      onLoadEnd={callback(({ nativeEvent }) => {
        console.log('Finished:', nativeEvent.url)
      })}
      onMessage={callback(({ nativeEvent }) => {
        console.log('Page said:', nativeEvent.data)
      })}
    />
  )
}
```

일반 함수를 그대로 전달하면 Nitro 콜백 계약을 만족하지 않습니다. `onLoadEnd`는 실패한 로드에도 발생합니다. 성공 여부는 `onLoad`로 확인하세요.

## 페이지에서 메시지 보내기 {#send-a-page-message}

로드한 웹 페이지 안에서 실행합니다.

```js
window.ReactNativeWebView.postMessage('hello from the web')
```

React Native 핸들러는 `event.nativeEvent.data`에서 문자열을 받습니다. 구조화된 메시지는 JSON으로 보내고 파싱 결과의 형태를 검증하세요. 권한이 필요한 동작을 연결하기 전에 [메시지와 origin](../guides/messaging.md)을 확인하세요.

## Hybrid ref 받기 {#capture-the-hybrid-ref}

WebView의 명령형 메서드는 `hybridRef`에 있습니다. 일반 React `ref`는 host component의 ref입니다.

```tsx
import { useRef } from 'react'
import { Button, View } from 'react-native'
import {
  NitroWebView, callback,
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
        hybridRef={callback((view) => { webview.current = view })}
      />
    </View>
  )
}
```

마운트된 뷰의 수명 안에서 메서드를 호출하세요. 뷰를 제거하거나 Android renderer 종료에서 복구할 때 보관한 ref를 비웁니다.

## HTML 직접 렌더링 {#use-inline-html}

```tsx
<NitroWebView
  style={{ flex: 1 }}
  source={{
    html: '<h1>Hello, Nitro</h1>',
    baseUrl: 'https://app.example.com',
  }}
/>
```

`baseUrl`은 상대 URL을 해석하는 기준입니다. HTML 문자열은 HTTPS 응답을 가져온 것과 다릅니다. 콘텐츠의 신뢰 범위와 메시지 정책을 따로 정하세요.
