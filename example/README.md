# Example app

This playground exercises Nitro WebView on Android and iOS. For library usage, see the [official documentation](https://l2hyunwoo.github.io/nitro-webview/).
Complete the [React Native environment setup](https://reactnative.dev/docs/set-up-your-environment) before building the app.
Use Node.js 22.13 or later in the Node 22 line for development checks.

## Run the playground

From the repository root:

```sh
yarn install && yarn prepare
(cd example && yarn install)
(cd example/ios && bundle install && bundle exec pod install)
(cd example && yarn start)
```

In another terminal, run `(cd example && yarn android)` or `(cd example && yarn ios)`.
The example links to the library in this repository. Rebuild the app after changing native code or generated bindings.

## Manual verification screens

For POST echo checks, run `node example/scripts/post-verification-server.mjs` from the repository root.
On Android, also run `adb reverse tcp:18965 tcp:18965`. Open `PostVerificationScreen` in the playground.
The page displays the HTTP response; the server logs the method, body, and content type.

`PermissionsVerificationScreen` checks real camera, microphone, and location access.
Use a device with the required hardware. Android deny mode checks origin blocking after OS permissions are granted.
Missing hardware, location timeouts, and unavailable services are failures, not simulated successes.
For playback fixture details, see [media fixture](src/fixtures/README.md).

## Package and release checks

`yarn prepare` and `yarn prepack` compile TypeScript. They do not run Nitrogen.
Run `yarn check:codegen` to generate bindings and reject changes under `nitrogen/generated`.
Run `yarn test:package` to build declarations, inspect an actual npm tarball, and compile package-root imports in an isolated consumer.
The package check installs the tarball with lifecycle scripts disabled. It does not perform native builds.
CI checks Nitro Modules `0.35.9` and `0.35.10` with at most two package/typecheck jobs.
The native release gate uses the example’s pinned `0.35.9` runtime; package/typecheck success does not verify native compatibility.

The example's `link:..` dependency supports local development. Metro also resolves an installed tarball through its normal package entry.
It does not replace `nitro-webview` with a fixed repository source path.
Before release, install the packed tarball in a separate native app and run both platform builds and the normal-root smoke checks.
Match that artifact and all required results to the release SHA. A missing, skipped, or failed required check blocks release.
The manual release workflow requires ESLint, ktlint, TypeScript checks, and Android JVM and iOS Swift unit tests before preparing the release candidate.
It repeats codegen and package checks on the version commit, then requires both packed native regression suites before tagging or publishing.

## E2E tests

The primary native regression suite runs through the example app's normal
AppRegistry root. `Regression verification` shows each case's PASS/FAIL result and
uploads progress and final results to a local fixture server. It checks real native
callbacks, methods, storage, navigation, and Android renderer recovery.

Install dependencies first. Build and install the example app on a booted target
before running the suite. Run these commands from the repository root:

```sh
yarn install && yarn prepare
(cd example && yarn install)

# iOS: use the UDID of an already booted simulator.
SIM_UDID='<booted-simulator-udid>'
(cd example/ios && bundle install && bundle exec pod install)
xcodebuild -workspace example/ios/example.xcworkspace -scheme example \
  -configuration Debug -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$SIM_UDID" \
  -derivedDataPath example/ios/build CODE_SIGNING_ALLOWED=NO build
xcrun simctl install "$SIM_UDID" \
  example/ios/build/Build/Products/Debug-iphonesimulator/example.app
node example/scripts/run-regression.mjs ios "$SIM_UDID"

# Android: use the serial of an already booted emulator or connected device.
ANDROID_SERIAL='<booted-device-serial>'
(cd example/android && ./gradlew :app:assembleDebug --no-daemon)
adb -s "$ANDROID_SERIAL" install -r \
  example/android/app/build/outputs/apk/debug/app-debug.apk
node example/scripts/run-regression.mjs android "$ANDROID_SERIAL"

# Fixture and runner host tests need no device.
node --test example/scripts/__tests__/*.test.mjs
```

The runner uses `agent-device@0.17.4` to open the app and select `Run regression`.
It starts the fixture on port 8098 and Metro on port 8081. Its Metro process uses
two workers and a 768 MiB Node heap limit. It can reuse Metro from this example
directory, leaving that process running. It refuses an unrelated Metro process.
Android uses explicit-device `adb reverse` for both ports. Cleanup stops only the
runner's own processes and session, leaving the device booted.

The runner polls for up to 240 seconds. Success requires all 37 named Android cases
or all 33 named iOS cases, with `complete: true` and every `ok: true`. Missing,
incomplete, duplicate, or failed cases make the command fail. Android includes an
actual renderer crash, stale-ref checks, and an explicit fresh-view retry.
The history case uses a real native tap because
[Chromium can skip history entries created without user activation](https://chromium.googlesource.com/chromium/src/+/refs/heads/lkgr/docs/history_manipulation_intervention.md).

Each run first removes only prior evidence with its own `<platform>-regression-`
prefix. Evidence is saved in `example/artifacts/`: `<platform>-regression-results.json`,
`<platform>-regression-requests.json`, `<platform>-regression-success.png`, and UI,
fixture, and Metro logs. A successful run fails if it cannot save its device screenshot.
Failures also save a screenshot and native logs when available. Fixture request records include
cookie names and authorization match/count fields, without cookie or authorization
values.

CI invokes this runner on every PR for Android. iOS runs on pushes to main and PRs
with the `e2e-ios` label. `.github/workflows/e2e.yml` builds, installs, runs, and
uploads evidence. `.github/workflows/ci.yml` also runs the fixture and runner host
tests.

The remaining [react-native-harness](https://github.com/callstackincubator/react-native-harness) tests in
`example/src/__tests__/*.harness.tsx` are mount smoke checks. They do not verify
load, message, or HTTP-error callbacks. Use the AppRegistry regression suite for
that coverage.

## Android renderer recovery

Use the normal example app and select **Android renderer recovery verification**.
This screen runs under the React root registered in `index.js`.
Use Android API 26 or later and a development build for the crash button.

1. Start `node example/e2e-server.mjs` from the repository root.
2. For a connected Android device, run `adb reverse tcp:8099 tcp:8099`.
3. Tap **Load GET**. Check `LOAD`, `END`, and `MESSAGE echo:mount:1` in the log.
4. Tap **Crash renderer**. This development-only button loads `chrome://crash` inside the WebView.
5. Check that the app survives, the recovery screen appears, and the exit count increases once.
6. Tap **Check old ref**. The log must contain a `NitroWebViewState` rejection.
7. Tap **Retry GET**. Check a new mount, `freshRef=true`, load events, and a message echo.
8. Return to the demo list after the crash, then open the panel again to check cleanup during unmount.

The screen sends only GET requests. Retry requires an explicit user action and creates a fresh WebView with a new React `key`.
The app clears its active ref on renderer exit. It retains one old ref only for the development check and releases it after recovery.
Remounting does not restore history or page input. Apps that use POST sources must choose retry data and timing themselves.
`chrome://crash` can affect several WebViews that share one renderer. Each affected instance must handle its own event.
Record the build SHA, Android version, System WebView version, and observed log with device results.
