# 다운로드와 업로드

`onFileDownload`는 다운로드를 알립니다. 바이트 처리와 영구 저장은 앱의 책임입니다.

## HTTP(S) 다운로드 {#http-s-downloads}

```tsx
<NitroWebView
  source={{ uri: 'https://app.example.com' }}
  onFileDownload={callback(({ nativeEvent }) => {
    console.log(nativeEvent.url, nativeEvent.fileName)
  })}
/>
```

HTTP(S) 이벤트는 원격 URL과 확인 가능한 메타데이터를 담습니다. 파일 저장이 끝났다는 뜻은 아닙니다. 별도 다운로드 클라이언트에서 인증·헤더·리다이렉트·저장을 처리하세요.

## Blob 다운로드 {#blob-downloads}

| 플랫폼 | 성공 시 `nativeEvent.url` |
| --- | --- |
| iOS | WebKit 네이티브 다운로드의 임시 `file://` URL |
| Android | 페이지에서 읽은 바이트를 담은 `data:` URL |

Android는 뷰당 reader **1개**, 최대 **8MiB**, 제한 시간 **30초**를 적용합니다. Source 교체·탐색 시 취소합니다. 두 플랫폼 모두 뷰 정리 시 진행 중인 다운로드를 취소합니다.

iOS에서 성공한 파일은 뷰 정리 뒤에도 남지만 OS가 임시 저장소를 비울 수 있습니다. 영구 저장소로 이동하거나 사용 후 파일과 **상위 UUID 디렉터리**를 함께 삭제하세요.

Blob 실패는 `onError`의 domain `NitroWebViewDownload`, code `-1`로 전달합니다. 페이지 로드 성공 여부를 바꾸지 않습니다.

## 파일 입력 {#file-inputs}

HTML `<input type="file">`은 네이티브 chooser로 처리합니다. JavaScript가 필요합니다. 폼을 검증할 때 실제 선택과 취소를 모두 확인하세요.

iOS에서 사용하는 카메라·사진 기능의 설명을 추가합니다.

```xml
<key>NSCameraUsageDescription</key>
<string>폼에 첨부할 사진을 촬영합니다.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>폼에 첨부할 사진을 선택합니다.</string>
<key>NSMicrophoneUsageDescription</key>
<string>동영상과 함께 오디오를 녹음합니다.</string>
```

Android에서는 라이브러리가 `${applicationId}.nitrowebview.fileprovider` FileProvider를 제공합니다. 선택·촬영 기능과 대상 Android 버전에 맞는 권한을 선언하세요. 촬영에는 `CAMERA`가 필요합니다. 미디어 라이브러리 접근은 `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` 또는 이전 OS의 저장소 권한이 필요할 수 있습니다. [권한 가이드](./permissions.md)를 참고하세요.
