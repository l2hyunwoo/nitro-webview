# 쿠키와 세션

쿠키 메서드는 마운트된 뷰의 store를 사용합니다. Store의 범위는 플랫폼마다 다릅니다.

## 저장·조회 {#write-and-read}

```ts
await webview.setCookie('https://app.example.com', {
  name: 'session',
  value: 'example-token',
  path: '/',
  secure: true,
  httpOnly: true,
})
const cookies = await webview.getCookies('https://app.example.com')
```

절대 HTTP(S) URL이 필요합니다. `expires`는 Unix epoch 이후 **밀리초**이며 초 단위가 아닙니다. 생략하면 세션 쿠키입니다.

Android 조회 결과에는 이름과 값만 있습니다. Cookie header에서 나머지 속성을 복원할 수 없습니다. iOS는 선택한 store에서 host·path·secure 범위를 필터링합니다.

## Store 범위 {#store-scope}

| 설정 | 범위 |
| --- | --- |
| iOS persistent | 같은 store를 사용하는 뷰가 공유하는 기본 WebKit store |
| iOS `incognito` | 마운트마다 별도로 만든 비영구 store |
| Android | 프로세스 전체의 `CookieManager` |

**`clearCookies()`는 선택한 store의 모든 쿠키를 삭제합니다.** Android의 다른 WebView와 기본 store를 공유하는 iOS 뷰에도 영향을 줍니다. 특정 origin만 로그아웃하는 메서드가 아닙니다.

`clearCache()`는 리소스 캐시만 지우며 쿠키·localStorage·히스토리는 유지합니다.

## iOS 비공개 세션 {#private-sessions-on-ios}

```tsx
<NitroWebView
  key={`private-${sessionId}`}
  incognito
  source={{ uri: 'https://app.example.com' }}
/>
```

iOS의 `incognito`, `sharedCookiesEnabled`는 초기 설정입니다. 변경하려면 다시 마운트하세요. 둘을 함께 켜면 설정 오류입니다. Android는 `incognito={true}`일 때 source를 로드하지 않습니다. 비공개 세션을 흉내 내려고 공유 쿠키를 지우지 않습니다.

## 앱 쿠키 가져오기 {#import-app-cookies}

iOS의 `sharedCookiesEnabled`는 첫 로드 전에 만료되지 않은 `HTTPCookieStorage` 쿠키를 한 번 가져옵니다. 이름·domain·path가 같으면 덮어씁니다. 이후 변경을 **동기화하지 않습니다.** Android는 이 prop을 무시합니다.

별도 쿠키 관리에는 [Nitro Cookies](https://l2hyunwoo.github.io/react-native-nitro-cookies/)를 참고하세요. 선택한 store가 WebView와 같아야 합니다. 별도 모듈에서 이 뷰의 비공개 store를 선택할 수는 없습니다.
