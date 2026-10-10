import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runLoggedCommand } from './run-regression.mjs';

export async function prepareSimulator(command, publish) {
  const udid = (
    await command(
      [
        'create',
        'NitroWebView-E2E',
        'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro',
        process.env.SIM_RUNTIME ??
          'com.apple.CoreSimulator.SimRuntime.iOS-26-1',
      ],
      20000,
    )
  ).trim();
  if (!/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(udid))
    throw new Error('simctl create did not return a simulator UUID');
  // Publish before boot so workflow cleanup also covers boot failures.
  publish(udid);
  await command(['boot', udid], 20000);
  await command(['bootstatus', udid, '-b'], 120000);
  return udid;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (!process.env.GITHUB_ENV) throw new Error('GITHUB_ENV must be set');
  const commands = new Set();
  await prepareSimulator(
    (args, timeoutMs) =>
      runLoggedCommand('xcrun', ['simctl', ...args], {
        output: process.stdout,
        commands,
        timeoutMs,
        logPath: 'workflow output',
      }),
    udid => appendFileSync(process.env.GITHUB_ENV, `SIM_UDID=${udid}\n`),
  );
}
