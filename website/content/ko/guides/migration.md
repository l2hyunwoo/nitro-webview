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

아직 출시되지 않은 변경사항입니다. 릴리스 검증이 끝날 때까지 패키지 버전은 `0.1.0`입니다.
출시된 버전의 동작은 설치한 패키지의 README와 비교하세요.

### 의존성과 네이티브 아키텍처 {#dependencies-and-native-architecture}

후보 버전은 제한이 없던 peer 범위를 React Native `~0.85.3`, React `19.2.3`, Nitro Modules `^0.35.9`로 좁힙니다.
범위 밖의 소비자는 peer 의존성 충돌을 받습니다. 검증 기준에 따른 정책이며 다른 React Native 버전이 호환되지 않는다는 뜻은 아닙니다.
네이티브 뷰에는 New Architecture가 필요합니다. 개발용 Nitro Modules와 Nitrogen은 `0.35.9`로 고정합니다.
[설치 요구사항](../start/installation.md#requirements)을 확인하세요.

### JavaScript 평가 결과는 JSON 텍스트 {#javascript-evaluation-returns-json}

`evaluateJavaScript()`는 여전히 `Promise<string>`을 반환하며, 두 플랫폼의 성공 결과는 JSON 문자열입니다.
값이 필요하면 `JSON.parse()`를 한 번 적용하세요.

```ts
const title = JSON.parse(await ref.evaluateJavaScript('document.title'))
```

문자열 결과에는 JSON 따옴표가 포함됩니다. 객체와 배열은 JSON 구문을 사용하며 `null`과 `undefined`는 문자열 `'null'`입니다.
이전 iOS의 `String(describing:)` 출력이나, 값이 없을 때 빈 문자열을 기대하지 마세요.
반환 문자열 자체를 인코딩할 목적이 아니라면 `JSON.stringify()`를 추가로 적용하지 마세요.
계약은 JSON으로 표현할 수 있는 값에 한정하며 객체 키 순서와 공백은 보장하지 않습니다.
네이티브 평가 오류는 Promise를 거부할 수 있습니다. Android는 예외와 null 결과를 구분하지 못하면 `'null'`을 반환할 수 있습니다.

### Origin 유틸리티의 두 조건 적용 {#origin-helpers-apply-both-decisions}

`wrapWithOriginWhitelist(handler, patterns)`는 origin이 일치하는 이벤트에도 핸들러 결과를 적용합니다.
기본 패턴 상수와 복사한 배열은 같은 정책을 사용합니다. 핸들러의 `false`는 기본 패턴과 일치하는 URL도 차단하며, `true`도 패턴 밖의 URL을 허용하지 않습니다.
예외와 Promise 거부는 네이티브 탐색의 fallback으로 전달됩니다.
이 유틸리티는 전달받은 탐색 이벤트만 검사합니다. 모든 네트워크 요청, Android 초기 source·POST 요청, 메시지 origin을 필터링하지 않습니다.
`onMessage.nativeEvent.url`은 최상위 페이지를 나타내며 메시지를 보낸 프레임의 신원을 증명하지 않습니다.

### Android renderer 복구에는 재마운트 필요 {#renderer-recovery-requires-an-android-remount}

Android API 26 이상에서 renderer가 종료되면 해당 WebView를 정리·파괴한 뒤 `onRenderProcessGone`을 한 번 발생시킵니다.
활성 hybrid ref를 비우고 복구 화면을 표시하세요. 사용자가 재시도를 선택하면 React `key`를 바꾸고 `hybridRef`로 새 ref를 받으세요.
이전 ref의 void 메서드는 아무 동작도 하지 않습니다. Promise 메서드와 대기 중인 JavaScript 평가는 `NitroWebViewState`로 거부됩니다.
이미 플랫폼에 제출된 cookie·cache 작업은 완료될 수 있습니다.
재마운트하면 페이지 이력과 입력이 사라집니다. POST source를 자동 재전송하지 마세요. 앱에서 재시도 데이터와 시점을 정하세요.
iOS에서는 `reload()`로 content process를 복구합니다.

### iOS 세션과 초기 설정 {#ios-sessions-and-initial-settings}

iOS의 `incognito`, `javaScriptEnabled`, `sharedCookiesEnabled`는 마운트 시 적용됩니다. 변경하려면 React `key`를 바꾸세요.
이후 변경은 `NitroWebViewConfiguration`을 발생시키고 같은 props 배치의 source 갱신을 차단합니다.
`incognito=true`와 `sharedCookiesEnabled=true`를 함께 사용하면 설정 오류입니다.
비공개 iOS 인스턴스마다 별도 비영구 store를 사용하며 cookie·cache 메서드도 해당 store에 적용됩니다.
`sharedCookiesEnabled`는 첫 로드 전에 앱 cookie를 한 번 가져오며 이후 계속 동기화하지 않습니다.
JavaScript를 끄면 라이브러리 bridge, history shim, script injection도 꺼집니다.
Android는 `incognito=true`에 `NitroWebViewConfiguration`을 보고하고 source를 로드하지 않습니다. 일반 세션에는 `false`를 쓰거나 prop을 생략하세요.
Android cookie는 프로세스 전체에서 공유합니다. 공유 cookie store를 지우면 같은 store를 쓰는 다른 WebView에도 영향을 줍니다.
Cookie URL 메서드에는 유효한 HTTP(S) URL이 필요합니다.

### 탐색 대기와 공개 콜백 {#navigation-timing-and-public-callbacks}

공개 탐색 콜백은 `boolean | Promise<boolean>`을 받습니다. 컴포넌트 콜백은 계속 `callback(...)`으로 감싸세요.
컴포넌트가 내부 decision resolver로 결과를 전달하므로 네이티브 앱을 다시 빌드해야 합니다.
콜백은 React props로 설정하세요. Hybrid ref에 직접 대입하면 bridge를 우회하므로 공개 타입에서 허용하지 않습니다.
Android의 명목상 대기 예산은 250 ms이며 시간 초과·거부·중단 시 허용하는 fallback을 유지합니다.
이 예산은 느린 콜백을 중단하지 않으며 최대 지연을 보장하지 않습니다. Subframe 가로채기는 opt-in이며 iframe이 많으면 대기 시간이 늘어날 수 있습니다.
iOS에는 라이브러리 timeout이 없으며 뷰가 활성인 동안 Promise가 끝날 때까지 기다립니다.
콜백의 throw나 거부는 두 플랫폼 모두 허용하는 fallback을 유지합니다.
Unmount, content process 종료, `stopLoading()`은 대기 중인 결정을 취소합니다. 늦은 결과로 이미 끝난 탐색을 재실행하거나 취소하지 않습니다.
Android 플랫폼 hook은 앱의 `loadUrl` 호출과 POST 요청을 다루지 않습니다.

### 헤더·이력·컴포넌트 ref {#headers-history-and-component-refs}

헤더 병합은 이름의 대소문자를 구분하지 않으며 source 헤더가 기본 헤더보다 우선합니다.
한 입력 map 안에 대소문자만 다른 중복 키가 있으면 오류입니다. Android POST는 비어 있지 않은 사용자 헤더를 계속 거부합니다.
`clearHistory()`는 iOS에서 성공하지만 이력을 지우지 않습니다. 새 이력이 필요하면 새 `key`로 마운트하세요.
명령형 메서드는 React `ref` 대신 `hybridRef`를 사용합니다.
`NitroWebViewType`과 추론된 hybrid ref는 읽기 전용 메서드와 Nitro 수명주기 API를 제공하며 뷰 props는 제공하지 않습니다.
Prop 읽기는 앱 상태로, 대입은 React props로 옮기세요. 메서드 호출과 표준 React ref는 그대로 사용할 수 있습니다.
`react-native-webview`에서 전환할 때는 변경이 필요합니다. 지원하지 않는 prop의 대응 기능이 이 릴리스에 추가되지는 않습니다.

### Blob 다운로드와 고급 bridge 유틸리티 {#blob-downloads-and-advanced-bridge-helpers}

Android는 WebView당 blob 하나를 읽으며 최대 8 MiB, timeout 30초를 적용합니다.
Blob 실패는 domain `NitroWebViewDownload`, code `-1`인 `onError`로 전달하며 페이지 로드 실패로 처리하지 않습니다.
탐색과 source 교체는 Android reader를 취소합니다. 뷰 해제는 두 플랫폼의 활성 다운로드를 취소하고 iOS 미완성 파일을 삭제합니다.
성공한 iOS 임시 파일과 UUID 디렉터리는 소비자가 이동하거나 삭제해야 합니다.
고급 `parseBlobEnvelope(raw, pending)` 호출자는 두 번째 인수를 명시해야 합니다.
대기 중인 네이티브 요청이 있으면 `{ requestId, url, fileName }`을, 없으면 `undefined`를 전달하세요.
검증된 성공 payload, `error`를 포함한 결과, 또는 일치하지 않는 메시지에 대해 `null`을 반환합니다.
`BlobDownloadRequest`와 `BlobDownloadResult`가 프로토콜을 정의합니다.
연결되지 않은 이전 envelope는 더 이상 다운로드를 생성하지 않습니다. Request ID는 네이티브에서 생성하고 소유합니다.
