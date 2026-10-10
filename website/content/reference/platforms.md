# Platform support

Nitro WebView supports Android and iOS native views. There is no web, macOS, Windows, visionOS, or tvOS implementation.

## Development baseline

Version 0.2.0 uses React Native 0.85.3 / React 19.2.3 with the New Architecture. Its runtime and generator are pinned to Nitro 0.35.9 for development. The 0.2.0 peer ranges are RN `~0.85.3`, React `19.2.3`, and Nitro `^0.35.9`.

RN 0.85.3 sets the app deployment minimums to Android API 24 and iOS 15.1. An API minimum is not a device-validation result. Future versions inside a peer range still need validation.

## Behavior differences

| Feature | iOS | Android |
| --- | --- | --- |
| Private session | Isolated ephemeral store per mount | `incognito=true` rejects configuration |
| Shared cookies | Optional one-time app-cookie import | Process-wide CookieManager |
| Navigation wait | Asynchronous, no library timeout | Nominal 250 ms wait, allow fallback |
| Source/POST interception | Platform navigation policy | Source/POST bypass override hook |
| Iframe interception | Delivered without opt-in | `interceptSubframeNavigation` opt-in |
| Early script | Document-start user script | Feature-dependent; older WebViews use an early fallback |
| Message sender metadata | WebKit frame security origin | Requires `WEB_MESSAGE_LISTENER` |
| Blob result | Temporary file URL | Data URL, 8 MiB / one reader / 30 seconds |
| Clear history | No-op; remount to reset | Clears entries except current page |
| Scroll disabling / bounces | Supported | No-op |
| Overview scaling | No-op | `scalesPageToFit` |
| Media-origin props | Ignored; system website prompts | Exact-origin allowlists, default deny |
| Renderer recovery | Reload the existing view | API 26+: old view destroyed; remount |
| Read cookie attributes | Selected store attributes | Name/value only |

## Initial-only iOS props

Remount to change `incognito`, `sharedCookiesEnabled`, `javaScriptEnabled`, `mediaPlaybackRequiresUserAction`, or `allowsInlineMediaPlayback`.

## Android WebView features

The installed System WebView version matters separately from Android API level. Check `WEB_MESSAGE_LISTENER` and `DOCUMENT_START_SCRIPT` behavior on your supported devices. Unsupported configured message policy fails closed; early injection has a timing fallback.

Use the repository playground for real device checks. Host/unit tests alone do not prove browser behavior or hardware access.
