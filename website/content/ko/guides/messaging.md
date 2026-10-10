# 메시지와 origin

페이지 메시지는 문자열입니다. 네이티브 발신 정보와 메시지 origin 정책으로 신뢰할 메시지를 결정합니다.

## 메시지 받기 {#receive-a-message}

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

`sourceOrigin`, `isMainFrame`은 네이티브 frame 정보입니다. `nativeEvent.url`은 **최상위 페이지 URL**이므로 발신자를 인증하는 근거로 쓰면 안 됩니다. JSON payload가 주장하는 origin도 신뢰할 수 없습니다.

메시지를 처리하기 전에 타입, 필드, 허용한 동작을 검증하세요.

## 정확한 origin 지정 {#configure-exact-origins}

- `allowedMessageOrigins` 생략: 모든 메시지 허용.
- `[]` 지정: 모든 메시지 차단.
- 정확한 HTTP(S) origin 배열: 네이티브에서 발신 origin 필터링.

루트 `/`는 허용합니다. 경로·인증 정보·와일드카드·쿼리·fragment·포트 0은 허용하지 않습니다. 잘못된 항목이 하나라도 있으면 전체 목록을 차단하고 `NitroWebViewConfiguration`을 전달합니다.

허용된 하위 frame도 메시지를 보낼 수 있습니다. 최상위 frame만 허용하려면 `isMainFrame`을 확인하세요. Opaque origin은 `"null"`이며 HTTP(S) 목록과 일치하지 않습니다.

Android의 발신 정보는 설치된 WebView의 `WEB_MESSAGE_LISTENER` 지원이 필요합니다. 미지원 환경에서 제한 없는 메시지는 발신 정보 없이 기존 bridge로 전달합니다. 정책을 지정했다면 메시지를 차단하고 설정 오류를 전달합니다.

## 페이지에 메시지 보내기 {#send-a-message-to-the-page}

Hybrid ref의 `webview.postMessage('hello from native')`를 호출합니다. 웹 페이지에서는 두 대상에 리스너를 등록하세요.

```js
function receive(event) {
  console.log(event.data)
}
window.addEventListener('message', receive)   // iOS
document.addEventListener('message', receive) // Android
```

완료를 기다리지 않고 한 번 전달하며 버퍼링하지 않습니다. 보내기 전에 리스너를 등록하세요. JavaScript가 활성화되어 있어야 합니다.
