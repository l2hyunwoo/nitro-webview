# 유틸리티

Package root는 컴포넌트와 함께 helper를 내보냅니다. 일반 앱에서는 주로 `NitroWebView`, `callback`, 탐색 helper를 사용합니다.

## 콜백과 탐색 {#callbacks-and-navigation}

| Export | 용도 |
| --- | --- |
| `callback` | `react-native-nitro-modules`에서 다시 내보낸 Nitro 콜백 wrapper |
| `DEFAULT_ORIGIN_WHITELIST` | 고정 HTTP/HTTPS 패턴 `['http://*', 'https://*']` |
| `originMatches(url, patterns)` | 절대 URL의 origin을 대소문자 구분 없는 `*` 패턴으로 비교 |
| `createOriginWhitelistGuard(patterns, handler?)` | Origin이 일치할 때 선택적인 핸들러 결정도 적용 |
| `wrapWithOriginWhitelist(handler, patterns?)` | 같은 origin 정책으로 핸들러 감싸기 |

패턴은 `*`를 지원하며 정규식이 아닙니다. 빈 배열은 모두 차단합니다. 잘못된 URL은 일치하지 않습니다. URL parser가 기본 포트를 정규화합니다. 메시지·미디어의 **정확한 origin** 배열과는 다른 규칙입니다.

## Source 변환 {#source-conversion}

`isHtmlSource`, `isUriSource`, `normalizeHtmlSource`, `sourceToCommand`는 source를 정규화하거나 `NativeViewCommand`를 만듭니다. Command variant는 `LoadUrlCommand`, `LoadHtmlCommand`입니다.

직접 네이티브 뷰를 로드하거나 네이티브 source·헤더 검증을 우회하는 helper가 아닙니다.

## 이벤트 dispatcher {#event-dispatchers}

`createLoadStartDispatcher`, `createLoadDispatcher`, `createLoadEndDispatcher`는 네이티브 payload를 변환하고 `navigationId`로 중복을 제거합니다. Load-end payload에는 `LoadEndOutcome`이 있습니다. 일반 앱에서는 컴포넌트의 이벤트 prop을 사용하세요.

## Bridge script {#bridge-scripts}

`BRIDGE_NAME`, `ANDROID_NATIVE_BRIDGE_NAME`은 페이지·네이티브 endpoint 이름입니다. `buildBridgeScript`, `buildPostMessageScript`, `encodeJsStringLiteral`은 script 생성·문자열 escape를 담당합니다. `evaluateBridgeScript`는 주로 호스트 테스트에서 전달한 sandbox에 script를 실행합니다.

Bridge 생성 helper는 네이티브 listener를 등록하거나 발신자 신원을 증명하지 않습니다. 페이지 JSON만 믿고 권한이 필요한 동작을 제공하지 마세요.

`BlobDownloadRequest`, `BlobDownloadResult`, sandbox 계약은 공개 타입입니다. 컴포넌트가 자체 blob reader를 관리하며 이 타입이 별도 다운로드 메서드를 제공하지는 않습니다.

Package root의 전체 타입 발췌는 [Types](./types.md)를 참고하세요. `src/index.ts`에서 내보내지 않은 내부 선언은 공개 진입점이 아닙니다.
