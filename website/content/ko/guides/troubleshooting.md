# 문제 해결

네이티브 바이너리, 콜백 wrapper, 마운트된 뷰의 수명부터 확인하세요.

## 네이티브 뷰·바인딩을 찾지 못함 {#native-view-or-bindings-are-missing}

두 패키지와 iOS pods를 설치하고 네이티브 앱을 다시 빌드하세요. New Architecture 활성화 여부도 확인합니다. Expo Go에서는 이 뷰를 사용할 수 없습니다. 런타임과 생성 바인딩의 버전을 맞추세요.

## 렌더링 중 이벤트 콜백 오류 {#an-event-callback-fails-at-render-time}

`nitro-webview` 또는 `react-native-nitro-modules`의 `callback`으로 감싸세요. `hybridRef`와 탐색 콜백도 포함합니다.

## 취소하려던 탐색이 로드됨 {#a-navigation-unexpectedly-loads}

[탐색 적용 범위](./navigation.md)를 확인하세요. Android source 로드와 POST는 가로채기 훅을 거치지 않습니다. Android의 시간 초과·거부는 허용으로 처리합니다. SPA 변경도 이 훅에서 취소할 수 없습니다.

## 메시지가 사라짐 {#messages-disappear}

`allowedMessageOrigins`, JavaScript 설정, 발신 frame, Android의 `WEB_MESSAGE_LISTENER` 지원을 확인하세요. 잘못된 origin 정책은 차단합니다. 페이지 URL은 발신자 식별 정보가 아닙니다.

## iOS 설정이 바뀌지 않음 {#settings-do-not-change-on-ios}

`incognito`, `sharedCookiesEnabled`, `javaScriptEnabled`, `mediaPlaybackRequiresUserAction`, `allowsInlineMediaPlayback`은 다시 마운트해야 합니다. React `key`를 바꾸세요.

## 카메라는 되지만 마이크는 실패함 {#camera-works-but-the-microphone-fails}

Android 앱 manifest에 `RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`를 선언하세요. 런타임 승인과 secure context도 확인합니다. `NotReadableError`의 원인은 네이티브 로그에서 확인하세요. 차단 origin 테스트만으로 캡처 성공을 검증할 수는 없습니다.

## Renderer 종료에서 복구 {#renderer-recovery}

Android API 26+에서는 `onRenderProcessGone` 전에 해당 뷰를 파괴합니다. 이전 hybrid ref를 비우세요. 사용자가 재시도하면 React `key`를 바꾸도록 구현합니다. 이전 ref의 void 메서드는 동작하지 않고 Promise 메서드는 `NitroWebViewState`로 reject합니다.

iOS는 `reload()`로 복구할 수 있으며 `didCrash`는 제공하지 않습니다. 다시 마운트하면 히스토리·페이지 입력을 잃습니다. 앱에서 판단하지 않고 POST를 자동 재전송하지 마세요.

## 재현 가능한 버그 제보 {#report-a-reproducible-bug}

라이브러리·Nitro·RN 버전, OS·Android WebView 버전, 최소 `source`, 이벤트 domain·code와 재현 순서를 포함하세요. Source·헤더·쿠키·로그에서 토큰과 개인정보를 제거하세요.
