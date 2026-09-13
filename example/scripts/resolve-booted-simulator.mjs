// Bind the harness's name/OS lookup to the device selected by simulator-action.
import { appendFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const { SIM_UDID: udid, GITHUB_ENV: githubEnv } = process.env
if (!udid || !githubEnv) throw new Error('SIM_UDID and GITHUB_ENV must be set')
const data = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j']))
for (const [runtime, devices] of Object.entries(data.devices)) {
  const found = devices.find(device => device.udid === udid)
  if (!found) continue
  const os = runtime.match(/\.iOS-([0-9-]+)$/)?.[1]?.replaceAll('-', '.')
  if (!os || found.state !== 'Booted') throw new Error(`Expected a booted iOS device: ${udid}`)
  // A unique name prevents harness from resolving another device with the same model/OS.
  const name = `Nitro E2E ${udid}`
  execFileSync('xcrun', ['simctl', 'rename', udid, name])
  appendFileSync(githubEnv, `SIM_UDID=${udid}\nSIM_DEVICE=${name}\nSIM_OS=${os}\n`)
  console.log(`Using ${name} (iOS ${os})`)
  process.exit(0)
}
throw new Error(`Simulator ${udid} not found in available devices`)
