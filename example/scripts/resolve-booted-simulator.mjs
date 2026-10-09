// Verify simulator-action's selected UDID for the native regression runner.
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { SIM_UDID: udid, GITHUB_ENV: githubEnv } = process.env;
if (!udid || !githubEnv) throw new Error('SIM_UDID and GITHUB_ENV must be set');
const data = JSON.parse(
  execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], {
    encoding: 'utf8',
    timeout: 90000,
  }),
);
for (const [runtime, devices] of Object.entries(data.devices)) {
  const found = devices.find(device => device.udid === udid);
  if (!found) continue;
  const os = runtime.match(/\.iOS-([0-9-]+)$/)?.[1]?.replaceAll('-', '.');
  if (!os || found.state !== 'Booted')
    throw new Error(`Expected a booted iOS device: ${udid}`);
  appendFileSync(githubEnv, `SIM_UDID=${udid}\n`);
  console.log(`Using ${found.name} (iOS ${os}, ${udid})`);
  process.exit(0);
}
throw new Error(`Simulator ${udid} not found in available devices`);
