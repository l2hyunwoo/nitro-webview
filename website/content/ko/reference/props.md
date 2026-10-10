# Props

`NitroWebView`는 React Native 뷰의 레이아웃 prop과 아래 WebView prop을 받습니다. 모든 이벤트·hybrid ref 콜백을 `callback()`으로 감싸세요.

## 콘텐츠와 설정 {#content-and-settings}

| Prop | Type | 동작 |
| --- | --- | --- |
| `source` | `WebViewSource` | URI 또는 HTML. 필수. |
| `defaultHeaders` | `Record<string, string>` | Source 로드의 기본 헤더. Source 헤더가 대소문자 구분 없이 우선. |
| `userAgent` | `string` | 모든 WebView 요청의 UA 변경. 빈 문자열은 기본값 복원. |
| `javaScriptEnabled` | `boolean` | 기본 true. Android 변경 가능, iOS 초기 설정. |
| `domStorageEnabled` | `boolean` | 기본 true. Android만 적용. iOS는 DOM storage 항상 활성화. |
| `cacheEnabled` | `boolean` | Android 캐시 모드. iOS는 다음 source 로드의 요청 정책. |
| `incognito` | `boolean` | 기본 false. iOS 별도 비영구 store. Android는 true 거부. |
| `sharedCookiesEnabled` | `boolean` | 기본 false. iOS 첫 로드 전 앱 쿠키를 한 번 가져옴. |
| `thirdPartyCookiesEnabled` | `boolean` | Android 뷰별 third-party cookie 정책. iOS 무시. |
| `scrollEnabled` | `boolean` | 기본 true. iOS만 적용. Android no-op. |
| `bounces` | `boolean` | 기본 true. iOS만 적용. Android no-op. |
| `scalesPageToFit` | `boolean` | 기본 false. Android overview·wide viewport. iOS no-op. |
| `allowsBackForwardNavigationGestures` | `boolean` | 기본 false. iOS 히스토리 swipe. Android no-op. |
| `mediaPlaybackRequiresUserAction` | `boolean` | 기본 true. iOS 초기 설정. Android 변경 가능. |
| `allowsInlineMediaPlayback` | `boolean` | iOS 기본 false. HTML playsinline 필요. Android는 기본 inline. |
| `injectedJavaScript` | `string` | 페이지 로드의 document-end 주입. |
| `injectedJavaScriptBeforeContentLoaded` | `string` | Main frame의 시작 주입. 이전 Android WebView는 대체 시점 사용. |
| `allowedMessageOrigins` | `string[]` | 정확한 HTTP(S) origin. 생략 시 모두 허용, []는 모두 차단. |
| `mediaCapturePermissionOrigins` | `string[]` | Android 카메라·마이크 origin. 기본 모두 차단. |
| `geolocationPermissionOrigins` | `string[]` | Android 위치 origin. 기본 모두 차단. |
| `interceptSubframeNavigation` | `boolean` | 기본 false. Android iframe 가로채기 활성화. iOS 무시. |

## 콜백과 ref {#callbacks-and-refs}

`hybridRef`는 `NitroWebViewType`을 받는 콜백입니다. 일반 React `ref`는 host ref입니다. [메서드](./methods.md)는 hybrid ref로 호출합니다.

| Callback | 인자 | 동작 |
| --- | --- | --- |
| `onLoadStart` | `WebViewLoadEvent` | Main document 로드 시작. |
| `onLoad` | `WebViewLoadEvent` | 성공한 로드에만 발생. onLoadEnd보다 먼저 발생. |
| `onLoadProgress` | `WebViewLoadProgressEvent` | nativeEvent.progress의 0~1 추정 진행률. |
| `onLoadEnd` | `WebViewLoadEvent` | 실패를 포함한 로드 종료 이벤트. |
| `onNavigationStateChange` | `WebViewNavigationState` | nativeEvent wrapper 없는 직접 상태. SPA 히스토리 포함. |
| `onMessage` | `WebViewMessageEvent` | 페이지 문자열과 제공 가능한 네이티브 발신 정보. |
| `onError` | `NitroWebViewErrorEvent` | 전송·설정·source·blob 오류 등. Domain 확인. |
| `onHttpError` | `NitroWebViewHttpErrorEvent` | Main frame HTTP 4xx/5xx. 하위 리소스 제외. |
| `onFileDownload` | `FileDownloadEvent` | HTTP 메타데이터 또는 플랫폼별 blob 참조. |
| `onOpenWindow` | `OpenWindowEvent` | 새 창 목적지 알림. 현재 뷰에서 여는 기본 동작 생략. |
| `onRenderProcessGone` | `NitroWebViewRenderProcessGoneEvent` | Android API 26+는 뷰 파괴. iOS는 reload로 복구. |
| `onScroll` | `NitroWebViewScrollEvent` | Throttling 없는 scroll 이벤트. Geometry는 플랫폼별로 다름. |
| `onShouldStartLoadWithRequest` | `ShouldStartLoadRequest` | `boolean` 또는 `Promise<boolean>` 반환. 플랫폼별 대기·적용 범위 확인. |

## 초기 설정 {#initial-settings}

iOS의 `incognito`, `sharedCookiesEnabled`, `javaScriptEnabled`, `mediaPlaybackRequiresUserAction`, `allowsInlineMediaPlayback`은 첫 로드 전에 적용합니다. 변경하려면 React `key`를 바꿔 다시 마운트하세요.

[탐색](../guides/navigation.md) · [메시지](../guides/messaging.md) · [플랫폼별 차이](./platforms.md)에서 제한을 확인하세요.
