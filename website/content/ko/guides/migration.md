# 마이그레이션

익숙한 WebView 개념을 사용하지만 API와 동작을 확인하고 변경해야 합니다.

## react-native-webview에서 전환 {#from-react-native-webview}

| 기존 패턴 | Nitro WebView |
| --- | --- |
| `WebView` import | Named export인 `NitroWebView` |
| 일반 이벤트 함수 | `callback(handler)`로 감싸기 |
| React `ref`의 WebView 메서드 | `hybridRef={callback(...)}` |
| `originWhitelist` prop | 탐색 콜백에 `createOriginWhitelistGuard` 적용 |
| 동기 가로채기 가정 | 공개 `boolean \| Promise<boolean>`과 플랫폼별 대기 동작 |
| 페이지의 `ReactNativeWebView.postMessage` | 같은 문자열 계약 |

문서에 있는 prop만 구현합니다. react-native-webview의 모든 prop에 대응하는 기능이 있는 것은 아닙니다. [Props](../reference/props.md)와 [플랫폼 지원](../reference/platforms.md)을 확인하세요.

## 0.1에서 0.2 후보 버전으로 전환 {#from-0-1-to-the-0-2-candidate}

- `evaluateJavaScript`는 JSON 텍스트를 반환합니다. 일반 문자열로 가정하지 말고 한 번 파싱하세요.
- Source 헤더가 기본 헤더보다 우선하며 이름의 대소문자를 구분하지 않습니다. 중복 논리 이름은 검증 오류입니다.
- Origin 유틸리티는 기본 패턴을 포함해 allowlist와 사용자 핸들러의 결정을 함께 적용합니다.
- Android renderer 종료 시 기존 뷰를 파괴합니다. Ref를 비우고 재시도할 때 다시 마운트하세요. POST를 자동 재전송하지 마세요.
- iOS 세션·JavaScript 초기 설정을 바꾸려면 다시 마운트해야 합니다. Android는 `incognito`를 지원하지 않습니다.
- `clearCookies()` 전에 cookie store의 범위를 확인하세요.
- 네이티브 콜백 바인딩이 변경되었습니다. JavaScript 패키지·생성 바인딩과 맞는 **네이티브 바이너리를 다시 빌드하세요.**

공개 탐색 콜백은 여전히 `boolean | Promise<boolean>`을 반환합니다. 앱에서 내부 decision resolver를 호출하지 않습니다.

후보 버전의 대상은 RN `~0.85.3`, React `19.2.3`, Nitro `^0.35.9`입니다. 개발 런타임·생성기는 0.35.9입니다. Peer 범위는 지원 정책이며 이후 모든 조합의 네이티브 검증을 뜻하지 않습니다.

프로덕션을 업그레이드하기 전에 지원 기기에서 인증·다운로드·파일 입력·탐색 거부·renderer 복구를 검증하세요.
