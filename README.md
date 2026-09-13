# Nitro WebView native verification — 2026-09-13

Actual simulator/emulator screen recordings for the release feature PRs. These files are evidence only, outside the npm package and main branch.

| Recording | Feature commit | Observation |
|---|---|---|
| [POST, iOS](post-ios.mp4) | 9800f96 | HTTP echo page shows the received POST method/body. |
| [Permissions, Android](permissions-android.mp4) | e4b82d1 | Denied camera origin, then allowed origin with a live video track. |
| [Media, iOS](media-ios.mp4) | 024ba1e | Gesture-gated autoplay rejection, user-started playback, native fullscreen and exit. |

Devices: dedicated iPhone17/iOS26.5 simulator and API35 arm64 Android emulator. iOS media is downscaled/re-encoded with original timing retained. Synthetic color bars are playback input, not fabricated verification. Hardware microphone capture is not claimed on the emulator.

| Additional recording | Feature commit | Observation |
|---|---|---|
| [Media, Android](media-android.mp4) | 024ba1e | Fullscreen/Back restores page and bars; gesture-gated playback. |
| [Dialogs, iOS](dialogs-ios.mp4) | 4fda396 | Edited prompt string, sequential alert/confirm Cancel, unmount dismisses prompt. |
| [Load, Android](load-android.mp4) | ff066ba | HTTP404 twice: zero LOAD; success progress and LOAD→END; unsafe-port ERROR→END. |
| [Load, iOS](load-ios.mp4) | c32a4a9 native /8914553 demo | Success/404 and connection refusal -1004; failures have zero LOAD. |

All recordings preserve original timing. Media/dialog/load iOS and media Android are downscaled for size. No audio-track verification is claimed. Native iOS load files did not change between c32a4a9 and8914553. Each PR is based on main independently; this branch is an evidence archive and is not intended to merge.
