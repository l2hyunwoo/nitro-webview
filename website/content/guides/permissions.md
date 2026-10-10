# Media and permissions

Website access needs both a trusted origin and OS consent. Playback settings do not grant camera or microphone access.

## Android origin policy

Camera/microphone and geolocation requests are **denied by default**. Opt in exact HTTP(S) origins:

```tsx
<NitroWebView
  source={{ uri: 'https://app.example.com' }}
  mediaCapturePermissionOrigins={['https://app.example.com']}
  geolocationPermissionOrigins={['https://app.example.com']}
/>
```

These policies also match requesting iframe origins. Wildcards, credentials, query strings, fragments, and non-root paths are invalid. Secure-context requirements still apply.

Declare only the app permissions your features use:

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

Microphone capture needs both `RECORD_AUDIO` and the normal `MODIFY_AUDIO_SETTINGS` permission. The host must implement React Native's `PermissionAwareActivity`, as `ReactActivity` does. Missing runtime grants prompt the user. Approximate location is accepted.

Do not start another module's app-permission request while this prompt is active. ReactActivity has one permission listener. Concurrent WebView requests may be denied; retry after consent completes.

Removing an origin blocks later requests and pending grants. **It does not stop an existing media stream.** Stop its tracks or unmount the view to end capture.

## iOS website prompts

The Android origin props have no effect on iOS. WKWebView keeps its system website prompts. Add usage descriptions for the features you use:

- `NSCameraUsageDescription`
- `NSMicrophoneUsageDescription`
- `NSLocationWhenInUseUsageDescription`

User/system denial takes precedence. Camera and microphone capture need a secure context and a supported WKWebView.

## Playback

`mediaPlaybackRequiresUserAction` defaults to `true`. On iOS it is initial-only. For inline iOS video, set `allowsInlineMediaPlayback` and add `playsinline` to the HTML video. Remount to change these iOS initial settings.

## Verify real access

Use the playground's **Camera / microphone / location permissions** screen. Check a live allowed track first, then denied-origin behavior. A missing device, timeout, or `NotReadableError` is not proof that origin blocking works.
