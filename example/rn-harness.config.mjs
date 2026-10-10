import {
  androidPlatform,
  androidEmulator,
} from '@react-native-harness/platform-android'
import {
  applePlatform,
  appleSimulator,
} from '@react-native-harness/platform-apple'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const isCI = process.env.CI === 'true'

// CI exports the selected simulator's unique name and exact runtime version.
// Override these defaults for local Xcode installations.
const SIM_DEVICE = process.env.SIM_DEVICE || 'iPhone 17 Pro'
const SIM_OS = process.env.SIM_OS || '26.1'
const ANDROID_API = Number(process.env.ANDROID_API || 34)
if (!Number.isInteger(ANDROID_API) || ANDROID_API < 1) {
  throw new Error('ANDROID_API must be a positive integer')
}
let androidName = process.env.ANDROID_EMULATOR || 'e2e_avd'
if (process.env.ANDROID_SERIAL) {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  const adb = sdk ? path.join(sdk, 'platform-tools', 'adb') : 'adb'
  const readAdb = args =>
    execFileSync(adb, args, { encoding: 'utf8', timeout: 5000 }).trim()
  const nameOf = serial =>
    readAdb(['-s', serial, 'emu', 'avd', 'name']).split('\n')[0].trim()
  androidName = nameOf(process.env.ANDROID_SERIAL)
  if (!androidName || androidName === 'OK')
    throw new Error('ANDROID_SERIAL must identify a running emulator')
  // Harness selects by AVD name; reject ambiguity rather than use another serial.
  const matching = readAdb(['devices'])
    .split('\n')
    .slice(1)
    .filter(line => /^emulator-\S+\s+device$/.test(line.trim()))
    .map(line => line.split(/\s+/)[0])
    .filter(serial => nameOf(serial) === androidName)
  if (matching.length !== 1 || matching[0] !== process.env.ANDROID_SERIAL) {
    throw new Error(
      'ANDROID_SERIAL requires exactly one connected emulator with its AVD name'
    )
  }
}

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
      device: androidEmulator(androidName, {
        apiLevel: ANDROID_API,
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
