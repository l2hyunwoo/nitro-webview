# 플랫폼 지원

Android와 iOS 네이티브 뷰를 지원합니다. Web·macOS·Windows·visionOS·tvOS 구현은 없습니다.

## 개발 기준 {#development-baseline}

0.2.0은 New Architecture의 React Native 0.85.3 / React 19.2.3을 사용합니다. 개발 런타임·생성기는 Nitro 0.35.9로 고정합니다. 0.2.0의 peer 범위는 RN `~0.85.3`, React `19.2.3`, Nitro `^0.35.9`입니다.

RN 0.85.3의 최소 앱 배포 버전은 Android API 24, iOS 15.1입니다. API 최소 버전은 기기 검증 결과가 아닙니다. Peer 범위 안의 이후 버전도 별도 검증이 필요합니다.

## 동작 차이 {#behavior-differences}

| 기능 | iOS | Android |
| --- | --- | --- |
| 비공개 세션 | 마운트별 비영구 store | `incognito=true` 설정 거부 |
| 공유 쿠키 | 선택적으로 앱 쿠키를 한 번 가져옴 | 프로세스 전체 CookieManager |
| 탐색 대기 | 비동기, 라이브러리 시간 제한 없음 | 250ms 대기 예산, 실패 시 허용 |
| Source·POST 가로채기 | 플랫폼 탐색 정책 | Source·POST는 override 훅 우회 |
| Iframe 가로채기 | 별도 활성화 없이 전달 | `interceptSubframeNavigation`으로 활성화 |
| 초기 스크립트 | Document-start user script | 지원 기능에 따라 다름. 이전 WebView는 대체 시점 사용. |
| 메시지 발신 정보 | WebKit frame security origin | `WEB_MESSAGE_LISTENER` 필요 |
| Blob 결과 | 임시 파일 URL | Data URL. 8MiB·reader 1개·30초. |
| 히스토리 삭제 | No-op. 초기화하려면 다시 마운트. | 현재 페이지 외 항목 삭제 |
| Scroll 비활성화·bounces | 지원 | No-op |
| Overview scaling | No-op | `scalesPageToFit` |
| 미디어 origin prop | 무시. 시스템 웹사이트 프롬프트 사용. | 정확한 origin allowlist. 기본 차단. |
| Renderer 복구 | 기존 뷰 reload | API 26+: 기존 뷰 파괴, 다시 마운트 |
| 쿠키 속성 조회 | 선택 store의 속성 | 이름·값만 조회 |

## iOS 초기 설정 {#initial-only-ios-props}

`incognito`, `sharedCookiesEnabled`, `javaScriptEnabled`, `mediaPlaybackRequiresUserAction`, `allowsInlineMediaPlayback`을 바꾸려면 다시 마운트하세요.

## Android WebView 기능 {#android-webview-features}

설치된 System WebView 버전은 Android API 수준과 별개입니다. 지원 기기에서 `WEB_MESSAGE_LISTENER`, `DOCUMENT_START_SCRIPT`의 동작을 확인하세요. 미지원 환경에 메시지 정책을 지정하면 차단합니다. 초기 주입에는 대체 시점이 있습니다.

실제 기기 검증에는 저장소의 playground를 사용하세요. 호스트·단위 테스트만으로 브라우저 동작이나 하드웨어 접근을 검증할 수는 없습니다.
