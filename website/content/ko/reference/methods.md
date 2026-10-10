# Methods

`hybridRef={callback(...)}`으로 받은 `NitroWebViewType`에서 호출합니다.

| Method | Return | 동작 |
| --- | --- | --- |
| `goBack()` | `void` | 히스토리 뒤로 이동. |
| `goForward()` | `void` | 히스토리 앞으로 이동. |
| `reload()` | `void` | 현재 페이지 새로고침. |
| `stopLoading()` | `void` | 로드 중단. iOS는 대기 중인 탐색 결정도 취소. |
| `evaluateJavaScript(code: string)` | `Promise<string>` | JSON 텍스트. 한 번 파싱. iOS 실행·직렬화 오류는 reject. Android 페이지 예외는 null과 구별 불가. |
| `injectJavaScript(code: string)` | `void` | 부수 효과 실행. 결과·완료 신호 없음. |
| `postMessage(data: string)` | `void` | 페이지 메시지 1회 전달. iOS window, Android document. |
| `getCookies(url: string)` | `Promise<Cookie[]>` | 절대 HTTP(S) URL. iOS 선택 store. Android 이름·값만 조회. |
| `setCookie(url: string, cookie: Cookie)` | `Promise<void>` | 선택 store에 저장. 만료는 밀리초. |
| `clearCookies()` | `Promise<void>` | Store 전체 쿠키 삭제. 같은 store의 다른 origin·뷰에도 영향. |
| `clearCache()` | `Promise<void>` | 리소스 캐시만 삭제. 쿠키·DOM storage·히스토리 유지. |
| `clearHistory()` | `Promise<void>` | Android 현재 페이지 외 히스토리 삭제. iOS no-op. |
| `requestFocus()` | `Promise<void>` | 네이티브 focus 요청. Promise 완료가 DOM input focus를 증명하지 않음. |

## 수명과 오류 {#lifecycle-and-failures}

Android renderer 종료 뒤 이전 ref의 void 호출은 동작하지 않고 Promise 호출은 `NitroWebViewState`로 reject합니다. 재시도할 때 뷰를 다시 마운트하고 새 ref를 받으세요. 이미 플랫폼에 제출한 쿠키·캐시 작업은 완료될 수 있습니다.

iOS에서 뷰를 제거한 뒤 store 메서드는 reject하며 기본 store로 대체하지 않습니다.

[JavaScript](../guides/javascript.md) · [쿠키와 세션](../guides/cookies.md) · [문제 해결](../guides/troubleshooting.md)
