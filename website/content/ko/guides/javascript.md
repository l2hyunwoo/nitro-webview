# JavaScript 실행

결과가 필요하면 evaluation, 부수 효과만 필요하면 injection, 페이지마다 실행하려면 script prop을 사용합니다.

## 결과 읽기 {#evaluate-and-read-a-result}

```ts
const json = await webview.evaluateJavaScript('({ title: document.title })')
const result = JSON.parse(json)
console.log(result.title)
```

`evaluateJavaScript`는 두 플랫폼 모두 **JSON 텍스트**를 반환합니다. 한 번 파싱하세요. Undefined와 null은 문자열 `"null"`이 됩니다. JSON으로 표현 가능한 값을 반환해야 합니다.

| 페이지 결과 | 반환 텍스트 |
| --- | --- |
| `2` | `2` |
| `'hello'` | `"hello"` |
| `({ a: 1 })` | `{"a":1}` |
| `undefined`, `null` | `null` |

iOS는 실행·직렬화 오류를 reject합니다. Android는 페이지 예외와 null 결과를 구별할 수 없습니다. JSON 공백과 객체 키 순서는 보장하지 않습니다.

## 부수 효과 실행 {#run-a-side-effect}

```ts
webview.injectJavaScript("document.body.dataset.theme = 'dark'")
```

반환값은 `void`입니다. 결과·오류·완료를 알려주지 않으므로 작업 성공을 확인하는 용도로 쓰지 마세요.

## 탐색마다 실행 {#run-on-every-navigation}

`injectedJavaScript`는 document end에 실행합니다. `injectedJavaScriptBeforeContentLoaded`는 플랫폼이 지원할 때 main frame의 document start에 실행합니다.

```tsx
<NitroWebView
  source={{ uri: 'https://app.example.com' }}
  injectedJavaScriptBeforeContentLoaded="window.APP_PLATFORM = 'native';"
/>
```

iOS는 document-start `WKUserScript`를 사용합니다. Android는 `DOCUMENT_START_SCRIPT`를 지원하면 사용합니다. 이전 WebView는 `onPageStarted`로 대체하며 **첫 inline script보다 먼저 실행된다는 보장이 없습니다.**

Script prop 변경은 다음 탐색에 적용합니다. 현재 페이지에서 다시 실행하지 않습니다.

## JavaScript 비활성화 {#disable-javascript}

`javaScriptEnabled={false}`는 페이지 JavaScript와 메시지·주입·히스토리 bridge를 비활성화합니다. iOS에서는 초기 설정이므로 React `key`를 바꿔 다시 마운트해야 합니다. iOS에서 JavaScript가 꺼져 있으면 evaluation은 reject합니다.
