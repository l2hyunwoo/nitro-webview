# Installation

Install the library and its Nitro runtime, then rebuild your native app.

::: info Version 0.2.0
These pages describe `0.2.0`. Match them to your installed package version and review [migration](../guides/migration.md) before upgrading.
:::

## Requirements

The development baseline uses React Native **0.85.3**, React **19.2.3**, and Nitro Modules **0.35.9**, with the New Architecture enabled. The 0.2.0 peer ranges are RN `~0.85.3`, React `19.2.3`, and Nitro `^0.35.9`.

React Native 0.85.3 requires Android API **24+** and iOS **15.1+**. These are deployment requirements, not a claim that every OS/device combination was tested. See [platform support](../reference/platforms.md).

## Add the packages

::: code-group
```sh [npm]
npm install nitro-webview@0.2.0 react-native-nitro-modules
```
```sh [yarn]
yarn add nitro-webview@0.2.0 react-native-nitro-modules
```
:::

Use the Nitro runtime compatible with your installed library version. Keep the native binary and JavaScript package versions aligned.

## iOS

From your app's `ios` directory:

```sh
bundle exec pod install
```

Build and run the app again. A Metro reload cannot install native bindings.

## Android

Autolinking registers the library. Rebuild and install your Android app after adding or upgrading either native package.

For camera, microphone, location, and file inputs, configure only the permissions your app uses. See [media and permissions](../guides/permissions.md) and [downloads and uploads](../guides/downloads.md).

The library declares Mozilla's Maven repository for `org.mozilla.components:support-utils`.
If your app manages dependency repositories centrally, include `maven { url "https://maven.mozilla.org/maven2" }` in that repository list.

## Expo

Use an Expo development build with native autolinking. **Expo Go does not contain this native module.** This package does not provide a config plugin. Configure app permissions in your native project or your Expo app configuration, then regenerate and rebuild the native app as needed.

Next: [render your first WebView](./quick-start.md).
