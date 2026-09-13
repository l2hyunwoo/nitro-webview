# Nitro WebView native verification — 2026-09-13

Actual simulator/emulator screen recordings for the release feature PRs. These files are evidence only, outside the npm package and main branch.

| Recording | Feature commit | Observation |
|---|---|---|
| [POST, iOS](post-ios.mp4) | 9800f96 | HTTP echo page shows the received POST method/body. |
| [Permissions, Android](permissions-android.mp4) | e4b82d1 | Denied camera origin, then allowed origin with a live video track. |
| [Media, iOS](media-ios.mp4) | 024ba1e | Gesture-gated autoplay rejection, user-started playback, native fullscreen and exit. |

Devices: dedicated iPhone17/iOS26.5 simulator and API35 arm64 Android emulator. iOS media is downscaled/re-encoded with original timing retained. Synthetic color bars are playback input, not fabricated verification. Hardware microphone capture is not claimed on the emulator.
