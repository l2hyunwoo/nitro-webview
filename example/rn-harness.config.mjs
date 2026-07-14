import { androidPlatform, androidEmulator } from '@react-native-harness/platform-android'
import { applePlatform, appleSimulator } from '@react-native-harness/platform-apple'

const isCI = process.env.CI === 'true'

// Default to the macos-15 CI runner's simulator (as of 2026-07-14: Xcode 16.4
// ships iPhone 17 Pro / iOS 26.1 -- these images drift over time, so this
// fallback can go stale; e2e.yml is the actual source of truth via its env
// block). Override with SIM_DEVICE / SIM_OS to run against a local simulator
// whose Xcode differs (`xcrun simctl list runtimes devices available`).
const SIM_DEVICE = process.env.SIM_DEVICE || 'iPhone 17 Pro'
const SIM_OS = process.env.SIM_OS || '26.1'

/** @type {import('react-native-harness').HarnessConfig} */
const config = {
  entryPoint: './index.js',
  // MUST equal AppRegistry.registerComponent name === app.json "name" === "example".
  appRegistryComponentName: 'example',
  bridgeTimeout: isCI ? 120000 : 60000,
  runners: [
    applePlatform({
      name: 'ios',
      device: appleSimulator(SIM_DEVICE, SIM_OS),
      bundleId: 'org.reactjs.native.example.example',
    }),
    androidPlatform({
      name: 'android',
      // 'e2e_avd' MUST equal avd-name in both android-emulator-runner steps in
      // e2e.yml, and apiLevel here MUST equal API_LEVEL there (34) — a
      // mismatched AVD name means the harness looks for a device that was
      // never booted (HarnessAppPathError: App is not installed).
      device: androidEmulator('e2e_avd', {
        apiLevel: 34,
        profile: 'pixel_6',
        diskSize: '2048M',
        heapSize: '512M',
      }),
      bundleId: 'com.example',
    }),
  ],
  defaultRunner: 'ios',
}

export default config
