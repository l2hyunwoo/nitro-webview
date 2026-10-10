# 미디어와 권한

웹사이트 접근에는 신뢰할 origin과 OS 동의가 모두 필요합니다. 재생 설정은 카메라·마이크 접근 권한을 부여하지 않습니다.

## Android origin 정책 {#android-origin-policy}

카메라·마이크·위치 요청은 **기본 차단**입니다. 정확한 HTTP(S) origin을 지정하세요.

```tsx
<NitroWebView
  source={{ uri: 'https://app.example.com' }}
  mediaCapturePermissionOrigins={['https://app.example.com']}
  geolocationPermissionOrigins={['https://app.example.com']}
/>
```

요청한 iframe의 origin에도 적용합니다. 와일드카드·인증 정보·쿼리·fragment·루트 외 경로는 허용하지 않습니다. 브라우저의 secure context 요구도 충족해야 합니다.

사용하는 기능의 앱 권한만 선언하세요.

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

마이크 캡처에는 `RECORD_AUDIO`와 일반 권한인 `MODIFY_AUDIO_SETTINGS`가 모두 필요합니다. 호스트는 `ReactActivity`처럼 React Native의 `PermissionAwareActivity`를 구현해야 합니다. 런타임 권한이 없으면 사용자에게 요청합니다. 대략적인 위치도 허용합니다.

이 프롬프트가 열린 동안 다른 모듈에서 앱 권한을 요청하지 마세요. ReactActivity의 권한 리스너는 하나입니다. 동시에 들어온 WebView 요청은 거부될 수 있으므로 동의가 끝난 뒤 다시 요청하세요.

Origin을 제거하면 이후 요청과 대기 중인 승인을 차단합니다. **이미 실행 중인 스트림은 중단하지 않습니다.** Track을 중단하거나 뷰를 제거해야 캡처가 끝납니다.

## iOS 웹사이트 프롬프트 {#ios-website-prompts}

Android origin prop은 iOS에 적용되지 않습니다. WKWebView의 시스템 웹사이트 프롬프트를 사용합니다. 필요한 기능의 사용 설명을 추가하세요.

- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSLocationWhenInUseUsageDescription`

사용자·시스템 거부가 우선합니다. 카메라·마이크 캡처에는 secure context와 지원되는 WKWebView가 필요합니다.

## 재생 {#playback}

`mediaPlaybackRequiresUserAction`의 기본값은 `true`이며 iOS에서는 초기 설정입니다. iOS inline video에는 `allowsInlineMediaPlayback`과 HTML의 `playsinline`을 함께 사용하세요. iOS 초기 설정을 바꾸려면 다시 마운트해야 합니다.

## 실제 접근 검증 {#verify-real-access}

Playground의 **Camera / microphone / location permissions** 화면을 사용하세요. 허용한 origin에서 live track을 확인한 뒤 차단 동작을 검증합니다. 장치 부재·시간 초과·`NotReadableError`만으로 origin 차단이 동작한다고 판단하지 마세요.
