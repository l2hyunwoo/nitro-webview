import { androidPlatform, androidEmulator } from '@react-native-harness/platform-android'
import { applePlatform, appleSimulator } from '@react-native-harness/platform-apple'

const isCI = process.env.CI === 'true'

// Default to the macos-15 CI runner's simulator (Xcode 16.2 ships iPhone 16 Pro /
// iOS 18.2). Override with SIM_DEVICE / SIM_OS to run against a local simulator
// whose Xcode differs (`xcrun simctl list runtimes devices available`). e2e.yml
// keeps these pinned via its env block.
const SIM_DEVICE = process.env.SIM_DEVICE || 'iPhone 16 Pro'
const SIM_OS = process.env.SIM_OS || '18.2'

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
      // apiLevel here MUST equal API_LEVEL in e2e.yml (34).
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
