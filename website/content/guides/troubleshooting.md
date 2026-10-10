# Troubleshooting

Start with the native binary, the callback wrapper, and the mounted view's lifecycle.

## Native view or bindings are missing

Install both packages, install iOS pods, and rebuild the native app. Confirm the New Architecture is enabled. Expo Go cannot load this view. Keep the runtime and generated bindings aligned.

## An event callback fails at render time

Wrap it with `callback` from `nitro-webview` or `react-native-nitro-modules`. This includes `hybridRef` and navigation callbacks.

## A navigation unexpectedly loads

Check the [navigation coverage](./navigation.md). Android source loads and POST requests bypass the interception hook. Android timeout/rejection uses an allow fallback. SPA changes cannot be vetoed there.

## Messages disappear

Check `allowedMessageOrigins`, JavaScript settings, the sender's frame, and Android `WEB_MESSAGE_LISTENER` support. Invalid origin policy fails closed. A page URL is not sender identity.

## Settings do not change on iOS

`incognito`, `sharedCookiesEnabled`, `javaScriptEnabled`, `mediaPlaybackRequiresUserAction`, and `allowsInlineMediaPlayback` require remounting. Change the React `key`.

## Camera works but the microphone fails

Declare `RECORD_AUDIO` and `MODIFY_AUDIO_SETTINGS` in the Android app manifest. Check the runtime grant and secure context. Inspect native logs for `NotReadableError`; a denied-origin test alone cannot prove successful capture.

## Recover from renderer exit {#renderer-recovery}

On Android API 26+, the affected view is destroyed before `onRenderProcessGone` fires. Clear the old hybrid ref. Offer a retry that changes the React `key`. Old void methods do nothing; old Promise methods reject with `NitroWebViewState`.

On iOS, call `reload()` to recover. `didCrash` is unavailable. Remounting loses history and page input. Never automatically resend a POST without an app-level decision.

## Report a reproducible bug

Include library/Nitro/RN versions, OS and Android WebView version, a minimal `source`, the event domain/code, and steps. Remove tokens and personal data from sources, headers, cookies, and logs.
