# Events

핸들러를 `callback()`으로 감쌉니다. 대부분 `event.nativeEvent`를 사용하지만 `onNavigationStateChange`는 상태를 직접 받습니다.

## 로드 수명 {#load-lifecycle}

| 결과 | 순서 |
| --- | --- |
| 성공 | `onLoadStart` → `onLoad` → `onLoadEnd` |
| 전송 실패 | `onLoadStart` → `onError` → `onLoadEnd` |
| Main frame HTTP 4xx/5xx | `onLoadStart` → `onHttpError` → `onLoadEnd`. `onLoad` 없음. |

`onLoadProgress`는 0~1 추정값입니다. 중간 값이 생략될 수 있고 1이 성공을 뜻하지 않습니다. 종료 로드 이벤트의 `loading`은 `false`입니다.

## 탐색 상태 {#navigation-state}

`WebViewNavigationState`는 `url`, `title`, `loading`, `canGoBack`, `canGoForward`를 담습니다. SPA 히스토리 변경도 상태에 반영합니다.

`onShouldStartLoadWithRequest`는 `nativeEvent` wrapper 없이 `ShouldStartLoadRequest`를 받습니다. 공개 반환 타입은 `boolean | Promise<boolean>`입니다. [탐색 제어](../guides/navigation.md)를 참고하세요.

## 메시지와 새 창 {#messages-and-windows}

`WebViewMessageEvent`는 문자열 `data`, 최상위 `url`, 선택적인 네이티브 `sourceOrigin`·`isMainFrame`을 담습니다. [발신 정책](../guides/messaging.md)을 확인하세요.

`OpenWindowEvent.nativeEvent.url`은 요청한 목적지입니다. 핸들러를 등록하면 기본 in-place 로드를 생략합니다. Boolean 반환값으로 결정하지 않습니다.

## 오류 domain {#error-domains}

| Domain·이벤트 | 의미 |
| --- | --- |
| `NitroWebViewSource` | 잘못된 source·헤더 조합. Code `-1`. |
| `NitroWebViewConfiguration` | 잘못되거나 지원하지 않는 설정·정책 |
| `NitroWebViewDownload` | Blob 작업 실패. Code `-1`. 페이지 로드는 실패로 바꾸지 않음. |
| `onError`의 플랫폼 domain | 네이티브 탐색·전송 오류. Code와 description 확인. |
| `onHttpError` | Main frame HTTP 상태. `statusCode`, `url`, `description`. |

설정·source 오류는 로드 시작 전에 발생할 수 있습니다. 처리 전에 load-start를 기다리지 마세요. HTTP 오류 응답의 본문은 표시될 수 있습니다. 리다이렉트 중 HTTP 오류가 반복될 수 있으며 중복 제거하지 않습니다.

## Renderer와 스크롤 {#renderer-and-scrolling}

`onRenderProcessGone.nativeEvent.didCrash`는 Android API 26+에서만 제공합니다. iOS는 undefined입니다. [복구](../guides/troubleshooting.md#renderer-recovery)를 참고하세요.

`onScroll`은 throttling하지 않습니다. iOS는 모든 geometry 필드를 제공합니다. Android는 `contentOffset`, 0인 `contentSize`를 제공하며 iOS 전용 필드는 undefined입니다. 비용이 큰 JS 작업은 필요에 따라 제한하세요.

전체 payload 시그니처: [Types](./types.md).
