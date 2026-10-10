# 탐색 제어

앱이 시작하는 로드는 `source`로 지정합니다. 플랫폼의 탐색 가로채기 훅에 전달된 요청은 콜백으로 허용하거나 취소합니다.

## 요청 허용·취소 {#allow-or-cancel-a-request}

```tsx
import {
  NitroWebView, callback, createOriginWhitelistGuard,
} from 'nitro-webview'

export default function Browser() {
  return (
    <NitroWebView
      style={{ flex: 1 }}
      source={{ uri: 'https://app.example.com' }}
      onShouldStartLoadWithRequest={callback(
        createOriginWhitelistGuard(['https://app.example.com'])
      )}
    />
  )
}
```

공개 핸들러는 `ShouldStartLoadRequest`를 받아 `boolean | Promise<boolean>`을 반환합니다. `false`는 오류 이벤트 없이 요청을 취소합니다.

### 응답 시간 {#timing}

| 플랫폼 | 동작 |
| --- | --- |
| Android | 단조 시간 기준 250ms 대기 예산을 사용합니다. 시간 초과·거부·인터럽트·복구 가능한 콜백 실패 시 허용합니다. 늦은 응답은 무시합니다. |
| iOS | 라이브러리의 시간 제한이 없습니다. 미완료 Promise는 탐색을 계속 대기시킬 수 있습니다. `stopLoading()`, 뷰 제거, 콘텐츠 프로세스 종료 시 대기 결정을 취소합니다. |

Android는 콜백 실행이나 OS 스케줄링을 강제로 중단하지 못합니다. **250ms는 UI 지연의 상한이 아닙니다.** 콜백을 짧게 유지하고 모든 Promise를 완료하세요.

### 적용 범위 {#coverage}

Android의 앱 주도 `source` 로드와 POST 요청에는 이 훅이 호출되지 않습니다. 하위 리소스 요청도 적용 대상이 아닙니다. Android iframe은 `interceptSubframeNavigation`으로 활성화하며, iOS는 이 설정 없이도 iframe 요청을 전달합니다.

탐색 유틸리티는 전체 네트워크 보안 경계가 아닙니다. 메시지·미디어 origin 정책을 별도로 설정하세요.

## 새 창 {#new-windows}

`target="_blank"`와 `window.open()`은 `onOpenWindow`로 전달됩니다. 두 번째 네이티브 WebView는 만들지 않습니다.

핸들러가 없으면 현재 뷰에서 목적지를 로드합니다. 핸들러가 있으면 이 기본 동작을 생략합니다. 현재 뷰에서 열려면 `source`를 바꾸세요. 외부에서 열 때는 URL을 검증하세요. 콜백의 반환값은 사용하지 않습니다.

## 히스토리와 SPA {#history-and-spa-routes}

Hybrid ref의 `goBack()`, `goForward()`를 호출합니다. `onNavigationStateChange`의 `canGoBack`, `canGoForward`로 이동 가능 여부를 확인합니다.

SPA의 `pushState`, `replaceState`, `popstate`는 탐색 상태에 반영됩니다. 가로채기 콜백에는 전달되지 않으며 이 콜백으로 취소할 수 없습니다.

## POST와 헤더 {#post-and-headers}

```tsx
<NitroWebView source={{
  uri: 'https://app.example.com/submit',
  method: 'POST',
  body: 'name=Nitro&source=app',
}} />
```

POST는 HTTP(S) URL이 필요합니다. GET에 body를 지정할 수 없습니다. Android POST는 비어 있지 않은 `source.headers`, `defaultHeaders`를 허용하지 않습니다.

헤더를 지원하는 source 로드에서는 source 헤더가 기본 헤더보다 우선하며 이름의 대소문자를 구분하지 않습니다. 한 map 안의 중복 논리 이름은 `NitroWebViewSource` 오류입니다. 리다이렉트·링크·iframe·하위 리소스에 헤더를 다시 적용하지 않습니다.
