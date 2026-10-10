# Installation

Install the library and its Nitro runtime, then rebuild your native app.

::: warning Development API
These pages describe the repository's development API, including changes for the 0.2 candidate. The latest npm release can have different behavior. Match this documentation to the version you install. See [migration](../guides/migration.md).
:::

## Requirements

The development baseline uses React Native **0.85.3**, React **19.2.3**, and Nitro Modules **0.35.9**, with the New Architecture enabled. The candidate peer ranges are RN `~0.85.3`, React `19.2.3`, and Nitro `^0.35.9`.

React Native 0.85.3 requires Android API **24+** and iOS **15.1+**. These are deployment requirements, not a claim that every OS/device combination was tested. See [platform support](../reference/platforms.md).

## Add the packages

::: code-group
```sh [npm]
npm install nitro-webview react-native-nitro-modules
```
```sh [yarn]
yarn add nitro-webview react-native-nitro-modules
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

## Expo

Use an Expo development build with native autolinking. **Expo Go does not contain this native module.** This package does not provide a config plugin. Configure app permissions in your native project or your Expo app configuration, then regenerate and rebuild the native app as needed.

Next: [render your first WebView](./quick-start.md).
