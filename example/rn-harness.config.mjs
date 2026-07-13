import { androidPlatform, androidEmulator } from '@react-native-harness/platform-android'
import { applePlatform, appleSimulator } from '@react-native-harness/platform-apple'

const isCI = process.env.CI === 'true'

/** @type {import('react-native-harness').HarnessConfig} */
const config = {
  entryPoint: './index.js',
  // MUST equal AppRegistry.registerComponent name === app.json "name" === "example".
  appRegistryComponentName: 'example',
  bridgeTimeout: isCI ? 120000 : 60000,
  runners: [
    applePlatform({
      name: 'ios',
      // SIM_OS in e2e.yml must match a runtime installed on the macos-15 runner's
      // Xcode. Re-check `xcrun simctl list runtimes` when bumping the runner image.
      device: appleSimulator('iPhone 16 Pro', '18.2'),
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
