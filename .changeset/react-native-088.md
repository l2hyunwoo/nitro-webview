---
"nitro-webview": minor
---

Upgrade the supported baseline to React Native 0.88 and Nitro Modules 0.37.1.

This release changes the peer requirements to React Native `~0.88.0`, React `^19.3.0`, and `react-native-nitro-modules` `^0.37.1`. Upgrade these dependencies together before adopting this release.

Regenerate the native bindings with Nitrogen 0.37.1, adapt the public ref types to React Native 0.88, and allow Android apps that use AGP 9 built-in Kotlin to build the library.
