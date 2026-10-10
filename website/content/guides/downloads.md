# Downloads and uploads

`onFileDownload` reports a download. Handling bytes and persistent storage remains your app's responsibility.

## HTTP(S) downloads

```tsx
<NitroWebView
  source={{ uri: 'https://app.example.com' }}
  onFileDownload={callback(({ nativeEvent }) => {
    console.log(nativeEvent.url, nativeEvent.fileName)
  })}
/>
```

HTTP(S) events contain the remote URL and available metadata. They do not mean a file was saved. A separate download client must handle authentication, headers, redirects, and storage.

## Blob downloads

| Platform | Successful `nativeEvent.url` |
| --- | --- |
| iOS | A temporary `file://` URL from a native WebKit download |
| Android | A `data:` URL containing bytes read in the page |

Android permits **one reader per view**, up to **8 MiB**, with a **30-second** timeout. Source replacement or navigation cancels it. Both platforms cancel active downloads on disposal.

iOS successful files remain available after disposal, but the OS can purge temporary storage. Move the file to persistent storage, or delete the file **and its parent UUID directory** after use.

Blob failures use `onError` with domain `NitroWebViewDownload`, code `-1`. They do not turn a successful page load into a failed load.

## File inputs

The native chooser handles HTML `<input type="file">`. JavaScript must be enabled. Choose and cancel real selections when testing your form.

For iOS camera/photo usage, add the usage strings your app needs:

```xml
<key>NSCameraUsageDescription</key>
<string>Take a photo to attach to your form.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Choose a photo to attach to your form.</string>
<key>NSMicrophoneUsageDescription</key>
<string>Record audio with your video.</string>
```

On Android, the library provides a FileProvider at `${applicationId}.nitrowebview.fileprovider`. Declare permissions appropriate to the picker/capture features and target Android version. Camera capture requires `CAMERA`; media-library access may require `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO`, or legacy storage permission on older devices. See [permissions](./permissions.md).
