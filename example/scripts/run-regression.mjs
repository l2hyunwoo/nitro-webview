import iosUICases from '../src/ios-ui-cases.json' with { type: 'json' };
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  fixtureText,
  validateRegressionInteraction,
} from './regression-server.mjs';
export { validateRegressionInteraction } from './regression-server.mjs';

const exampleDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixtureURL = 'http://127.0.0.1:8098';
const metroURL = 'http://127.0.0.1:8081/status';
const sleep = ms => new Promise(resolveSleep => setTimeout(resolveSleep, ms));
const commonCases = [
  'load-200',
  'http-404',
  'transport-error',
  'message-roundtrip',
  'evaluate-json',
  'evaluation-removal',
  'headers-case-insensitive',
  'headers-duplicate-source',
  'cookie-url-validation',
  'initial-javascript-disabled',
  'navigation-allow',
  'navigation-block',
  'navigation-delayed-false',
  'navigation-handler-throw',
  'navigation-handler-reject',
  'origin-whitelist-block',
  'post-body-once',
  'redirect-once',
  'history-back-forward',
  'download-http-metadata',
  'download-blob-bytes',
  'message-native-frame-origins',
  'message-origin-policy',
  'window-open-parent-unchanged',
  'background-resume',
  'file-chooser-cancel',
  'fullscreen-exit-unmount',
];
export const expectedRegressionCases = {
  android: [
    ...commonCases,
    'android-incognito-rejection',
    'android-renderer-recovery',
    'android-renderer-shared-views',
    'android-blob-failures-replay',
    'android-file-upload',
    'android-capture-chooser-cancel',
    'android-permission-origin-deny',
    'android-media-origin-deny',
    'android-permission-os-deny',
    'android-permission-os-allow',
  ],
  ios: [
    ...commonCases,
    'ios-callback-cleanup',
    'ios-evaluation-error',
    'ios-navigation-stop-loading',
    'ios-storage-isolation',
    'ios-shared-cookie-first-request',
    'ios-initial-setting-change',
  ],
};

export function runLoggedCommand(
  executable,
  args,
  { cwd, output, commands, timeoutMs = 90000, logPath },
) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(executable, args, {
      cwd,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    commands.add(child);
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    let timedOut = false;
    let captured = '';
    let failureOutput = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      captured = (captured + chunk.toString()).slice(-100000);
      failureOutput = (failureOutput + chunk.toString()).slice(-8000);
    });
    child.stderr.on('data', chunk => {
      failureOutput = (failureOutput + chunk.toString()).slice(-8000);
    });
    const timer = setTimeout(() => {
      timedOut = true;
      signalChild(child, 'SIGKILL');
    }, timeoutMs);
    child.once('error', error => {
      clearTimeout(timer);
      commands.delete(child);
      reject(error);
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      commands.delete(child);
      if (code === 0 && !timedOut) resolveCommand(captured);
      else
        reject(
          Object.assign(
            new Error(
              `${executable} ${args.slice(0, 3).join(' ')} failed (${
                timedOut ? 'timeout' : signal ?? code
              }); see ${logPath}`,
            ),
            { output: failureOutput, timedOut, signal },
          ),
        );
    });
  });
}

// Keep the CLI's 90-second iOS request deadline ahead of process termination.
const captureSnapshot = (agent, platform) =>
  agent(['snapshot', '-i'], platform === 'ios' ? 120000 : 30000);

export async function tapRegressionControl(agent, label, platform = 'ios') {
  for (let attempt = 0; attempt < 3; attempt++) {
    const snapshot = await captureSnapshot(agent, platform);
    if (snapshot.includes('Open debugger to view warnings.')) {
      await agent(['react-native', 'dismiss-overlay'], 30000);
      continue;
    }
    // Android snapshots can omit WebView links; retain its native label lookup.
    if (platform === 'android') {
      await agent(['find', label, 'click', '--first'], 30000);
      return;
    }
    const target = snapshot
      .split('\n')
      .map(line => line.match(/^\s*(@e\d+) \[(button|link)\] "([^"]+)"/))
      .find(match => match?.[3] === label);
    if (!target) throw new Error(`${label} control was not observed`);
    await agent(['click', target[1], '--hold-ms', '100'], 30000);
    return;
  }
  throw new Error(`${label} remained obscured by a development warning`);
}

export function validateRegressionResults(result, platform, profile = 'full') {
  if (
    !['full', 'ios-core'].includes(profile) ||
    (profile === 'ios-core' && platform !== 'ios')
  )
    throw new Error('Invalid regression profile');
  if ((result?.profile ?? 'full') !== profile)
    throw new Error('Regression profile mismatch');
  if (
    result?.complete !== true ||
    result.platform !== platform ||
    !Array.isArray(result.cases) ||
    result.cases.length === 0
  ) {
    throw new Error(
      'Regression results are incomplete, empty, or for another platform',
    );
  }
  const expected = expectedRegressionCases[platform]?.filter(
    name => profile !== 'ios-core' || !iosUICases.includes(name),
  );
  if (!expected)
    throw new Error(`Unsupported regression platform: ${platform}`);
  const names = new Set();
  for (const item of result.cases) {
    if (
      !item ||
      typeof item.name !== 'string' ||
      !item.name ||
      names.has(item.name) ||
      typeof item.detail !== 'string' ||
      !Number.isFinite(item.durationMs) ||
      item.durationMs < 0
    ) {
      throw new Error('Malformed or duplicate regression case');
    }
    names.add(item.name);
    if (item.ok !== true) throw new Error(`FAIL ${item.name}: ${item.detail}`);
  }
  const missing = expected.filter(name => !names.has(name));
  if (missing.length || names.size !== expected.length) {
    throw new Error(
      `Regression case coverage changed; missing: ${missing.join(', ')}`,
    );
  }
  return result.cases.length;
}

async function clearAndroidLocationPermissionFlags({ device, bundleID, command }) {
  for (const permission of ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']) {
    await command('adb', ['-s', device, 'shell', 'pm', 'clear-permission-flags', bundleID,
      `android.permission.${permission}`, 'user-set', 'user-fixed']);
  }
}

export async function prepareAndroidRuntimePermissions({
  device,
  bundleID,
  command,
}) {
  for (const permission of ['CAMERA', 'RECORD_AUDIO']) {
    await command('adb', [
      '-s',
      device,
      'shell',
      'pm',
      'grant',
      bundleID,
      `android.permission.${permission}`,
    ]);
  }
  for (const permission of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION']) {
    await command('adb', [
      '-s',
      device,
      'shell',
      'pm',
      'revoke',
      bundleID,
      `android.permission.${permission}`,
    ]);
  }
  await clearAndroidLocationPermissionFlags({ device, bundleID, command });
}

export async function performNativeInteraction(value, context) {
  const interaction = validateRegressionInteraction(value);
  if (!interaction) return;
  const { platform, device, bundleID, agent, command, uploadFile } = context;
  const action = interaction.action ?? 'tap';
  const adb = args => command('adb', ['-s', device, ...args]);
  const foreground = async () => {
    const activity = await adb(['shell', 'dumpsys', 'activity', 'activities']);
    return (activity.match(
      /\btopResumedActivity=ActivityRecord\{[^\n]*?\s([\w.]+)\//,
    ) ??
      activity.match(
        /\b(?:mResumedActivity|ResumedActivity):\s*ActivityRecord\{[^\n]*?\s([\w.]+)\//,
      ))?.[1];
  };
  const tap = async label => {
    const fileInput = label === 'Upload fixture' || label === 'Capture fixture';
    const deadline = Date.now() + 15000;
    let snapshotHelperReset = false;
    while (true) {
      const snapshot = await captureSnapshot(agent, platform);
      if (snapshot.includes('Open debugger to view warnings.')) {
        await agent(['react-native', 'dismiss-overlay'], 30000);
        if (Date.now() >= deadline)
          throw new Error(`${label} remained obscured by a development warning`);
        continue;
      }
      const observed = snapshot
        .split('\n')
        .map(line => line.match(/^\s*(@e\d+) \[([^\]]+)\] "([^"]+)"/))
        .filter(Boolean);
      const nodes = observed.filter(
        match =>
          match[3] === label ||
          match[3].startsWith(`${label}:`) ||
          (label === 'nitro-regression.txt' &&
            match[3].startsWith(`${label}, `)),
      );
      const target = nodes.find(
        match =>
          match[2] === 'button' ||
          (platform === 'ios' &&
            (match[2] === 'link' ||
              (label === 'Media' && match[2] === 'other'))),
      );
      if (target) {
        // A short XCTest press avoids the synthesized tap path for iOS links.
        const hold =
          platform === 'ios' && target[2] === 'link'
            ? ['--hold-ms', '100']
            : [];
        return agent(['click', target[1], ...hold], 30000);
      }
      if (!fileInput && nodes.length)
        return agent(['find', label, 'click', '--first'], 30000);
      if (
        !fileInput &&
        observed.some(
          match =>
            /^(list|scroll-area|gridview|viewpager)$/.test(match[2]) &&
            match[3].split(',').some(item => item.trim() === label),
        )
      )
        return agent(['find', label, 'click', '--first'], 30000);
      if (
        platform === 'android' &&
        !snapshotHelperReset &&
        snapshot.includes('[webview]') &&
        Date.now() >= deadline - 10000
      ) {
        // Recover stale UiAutomation trees without relaunching the tested app.
        await adb([
          'shell',
          'am',
          'force-stop',
          'com.callstack.agentdevice.snapshothelper',
        ]);
        snapshotHelperReset = true;
        continue;
      }
      if (Date.now() >= deadline) {
        if (
          platform === 'android' &&
          !fileInput &&
          snapshot.includes('[webview]')
        )
          return agent(['find', label, 'click', '--first'], 30000);
        const kind = fileInput ? 'file input button' : 'control';
        throw new Error(`${label} ${kind} was not observed`);
      }
      await sleep(Math.min(250, deadline - Date.now()));
    }
  };
  const appVisible = async () => {
    const deadline = Date.now() + 15000;
    while (true) {
      const snapshot = await captureSnapshot(agent, platform);
      if (
        /^\s*@e\d+ \[button\] "Run regression"/im.test(snapshot) &&
        (platform !== 'android' || (await foreground()) === bundleID)
      )
        return;
      if (Date.now() >= deadline)
        throw new Error('Regression app did not return to the foreground');
      await sleep(Math.min(250, deadline - Date.now()));
    }
  };
  if (action === 'tap') return tap(interaction.label);
  if (action === 'background-resume') {
    await agent(['home'], 30000);
    await sleep(1500);
    return agent(['open', bundleID], 30000);
  }
  if (action === 'fullscreen-exit') {
    if (platform === 'android') {
      await adb(['shell', 'input', 'keyevent', '4']);
      const controls = await captureSnapshot(agent, platform);
      const coachmark = controls.match(/^\s*(@e\d+) \[button\] "Got it"/m);
      // A fresh emulator's immersive-mode hint can consume the first Back.
      if (coachmark && /\[button\] "exit full screen"/.test(controls)) {
        await agent(['click', coachmark[1]], 30000);
        await adb(['shell', 'input', 'keyevent', '4']);
      }
    } else {
      // Raw snapshots avoid live descendant expansion for AVKit sliders.
      const captureControls = async () =>
        JSON.parse(
          await agent(['snapshot', '-i', '--raw', '--json'], 120000),
        ).data.nodes;
      const dismissButton = nodes =>
        nodes.find(
          node => node.type === 'Button' && /^(Close|Done)$/.test(node.label),
        );
      let controls = await captureControls();
      let dismiss = dismissButton(controls);
      if (!dismiss) {
        const media = controls.find(
          node => node.type === 'Other' && node.label === 'Media',
        );
        if (media) {
          await agent(['click', `@${media.ref}`], 30000);
          controls = await captureControls();
          dismiss = dismissButton(controls);
        }
      }
      if (!dismiss)
        throw new Error('Fullscreen Close or Done button was not observed');
      await agent(['click', `@${dismiss.ref}`], 30000);
    }
    return appVisible();
  }
  if (action === 'capture-cancel') {
    if (platform !== 'android')
      throw new Error('Camera chooser automation requires Android');
    await adb(['shell', 'pm', 'grant', bundleID, 'android.permission.CAMERA']);
    await tap('Capture fixture');
    const picker = await captureSnapshot(agent, platform);
    if (!/Camera|Capture image/.test(picker))
      throw new Error('Capture input did not offer a camera activity');
    await tap(picker.includes('Capture image') ? 'Capture image' : 'Camera');
    const cameraDeadline = Date.now() + 15000;
    while (
      !/\] "(?:Shutter[^"]*|Take photo[^"]*|Capture|Switch camera[^"]*)"/i.test(
        await captureSnapshot(agent, platform),
      )
    ) {
      if (Date.now() >= cameraDeadline)
        throw new Error('The system camera did not open');
      await sleep(Math.min(250, cameraDeadline - Date.now()));
    }
    await adb(['shell', 'input', 'keyevent', '4']);
    return appVisible();
  }
  if (action === 'chooser-cancel' || action === 'chooser-upload') {
    if (action === 'chooser-upload' && platform !== 'android')
      throw new Error('File selection automation requires Android DocumentsUI');
    if (action === 'chooser-upload') {
      await adb(['push', uploadFile, '/sdcard/Download/nitro-regression.txt']);
      await adb([
        'shell',
        'am',
        'broadcast',
        '-a',
        'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
        '-d',
        'file:///sdcard/Download/nitro-regression.txt',
      ]);
    }
    await tap('Upload fixture');
    const pickerDeadline = Date.now() + 15000;
    let picker;
    while (true) {
      picker = await captureSnapshot(agent, platform);
      if (
        /Choose file|Choose File|Files|Recent|Browse|Photo Library/i.test(
          picker,
        ) ||
        (platform === 'ios' &&
          picker.includes('[navigation-bar]') &&
          /^\s*@e\d+ \[button\] "Cancel"/m.test(picker))
      )
        break;
      if (Date.now() >= pickerDeadline)
        throw new Error('The OS file chooser did not appear');
      await sleep(Math.min(250, pickerDeadline - Date.now()));
    }
    if (action === 'chooser-cancel') {
      if (platform === 'android')
        await adb(['shell', 'input', 'keyevent', '4']);
      else {
        if (picker.includes('Choose File')) await tap('Choose File');
        await tap('Cancel');
      }
      return appVisible();
    }
    if (picker.includes('Choose file')) await tap('Files');
    await tap('Show roots');
    await tap('Downloads');
    await tap('nitro-regression.txt');
    return appVisible();
  }
  if (action === 'permission-allow' || action === 'permission-deny') {
    if (platform !== 'android')
      throw new Error('OS permission automation requires Android');
    const permissionControllers = [
      'com.google.android.permissioncontroller',
      'com.android.permissioncontroller',
    ];
    const deadline = Date.now() + 15000;
    let allow;
    let deny;
    while (true) {
      const permissionPackage = await foreground();
      const permission = await captureSnapshot(agent, platform);
      allow = permission.match(/^\s*(@e\d+) \[button\] "While using the app"/im);
      deny = permission.match(/^\s*(@e\d+) \[button\] "Don[’']t allow"/im);
      if (permissionControllers.includes(permissionPackage) && /location/i.test(permission) && allow && deny) break;
      if ((!permissionControllers.includes(permissionPackage) && permissionPackage !== bundleID) ||
          ((allow || deny) && permissionPackage === bundleID) || Date.now() >= deadline)
        throw new Error('Android location permission dialog was not observed');
      await sleep(250);
    }
    await agent(
      ['click', action === 'permission-allow' ? allow[1] : deny[1]],
      30000,
    );
    // Do not remount a WebView while the OS permission window is closing.
    await appVisible();
    if (action === 'permission-deny') await clearAndroidLocationPermissionFlags(context);
    if (action === 'permission-allow' && device.startsWith('emulator-'))
      await adb(['emu', 'geo', 'fix', '127.0', '37.5']);
    return;
  }
}

export function isPlatformRegressionArtifact(name, platform) {
  return name.startsWith(`${platform}-regression-`);
}

async function clearPlatformRegressionArtifacts(artifacts, platform) {
  for (const entry of await readdir(artifacts, { withFileTypes: true })) {
    if (entry.isFile() && isPlatformRegressionArtifact(entry.name, platform)) {
      await rm(join(artifacts, entry.name), { force: true });
    }
  }
}

async function fetchJSON(path, body) {
  const response = await fetch(`${fixtureURL}${path}`, {
    signal: AbortSignal.timeout(5000),
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function metroRunning() {
  try {
    const response = await fetch(metroURL, {
      signal: AbortSignal.timeout(3000),
    });
    if (
      !response.ok ||
      (await response.text()).trim() !== 'packager-status:running'
    ) {
      throw new Error('Port 8081 is occupied by an unrecognized server');
    }
    return true;
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return false;
    throw error;
  }
}

function verifyExistingMetro() {
  const pids = execFileSync(
    'lsof',
    ['-nP', '-iTCP:8081', '-sTCP:LISTEN', '-t'],
    {
      encoding: 'utf8',
      timeout: 5000,
    },
  )
    .trim()
    .split(/\s+/);
  for (const pid of pids) {
    const output = execFileSync('lsof', ['-a', '-p', pid, '-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    const cwd = output
      .split('\n')
      .find(line => line.startsWith('n'))
      ?.slice(1);
    if (!cwd || realpathSync(cwd) !== realpathSync(exampleDir)) {
      throw new Error(
        `Metro on 8081 belongs to another directory (PID ${pid}); it was left running`,
      );
    }
  }
}

function signalChild(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

export async function stopOwnedChild(owned) {
  if (owned.closed) return;
  signalChild(owned.child, 'SIGTERM');
  if (owned.closed) return;
  await new Promise(resolveStop => {
    const timer = setTimeout(resolveStop, 2000);
    owned.child.once('close', () => {
      clearTimeout(timer);
      resolveStop();
    });
  });
  // A closed process group may already belong to a different process.
  if (!owned.closed) signalChild(owned.child, 'SIGKILL');
}

async function run(platform, device, profile = 'full') {
  const core = platform === 'ios' && profile === 'ios-core';
  if (
    !['full', 'ios-core'].includes(profile) ||
    (profile === 'ios-core' && !core)
  )
    throw new Error('Invalid regression profile');
  if (
    !['ios', 'android'].includes(platform) ||
    !device ||
    device.startsWith('-')
  ) {
    throw new Error(
      'Usage: node example/scripts/run-regression.mjs <ios|android> <udid|serial>',
    );
  }
  const artifacts = join(exampleDir, 'artifacts');
  await mkdir(artifacts, { recursive: true });
  await clearPlatformRegressionArtifacts(artifacts, platform);
  const artifact = suffix =>
    join(artifacts, `${platform}-regression-${suffix}`);
  const json = (suffix, value) =>
    writeFile(artifact(suffix), `${JSON.stringify(value, null, 2)}\n`);
  const uiLog = createWriteStream(artifact('ui.log'));
  const uploadFile = artifact('upload.txt');
  await writeFile(uploadFile, fixtureText);
  const children = [];
  const commands = new Set();
  const session = `nitro-regression-${platform}-${process.pid}`;
  const target = [
    '--platform',
    platform,
    platform === 'ios' ? '--udid' : '--serial',
    device,
    '--session',
    session,
  ];
  const bundleID =
    platform === 'ios' ? 'org.reactjs.native.example.example' : 'com.example';
  let interrupted = false;
  let sessionUsed = false;
  let failure;
  let lastResult = { complete: false, platform, cases: [] };
  await json('results.json', lastResult);
  await json('requests.json', []);

  function interrupt() {
    interrupted = true;
    for (const child of commands) signalChild(child, 'SIGTERM');
  }
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);

  function checkChildren() {
    if (interrupted) throw new Error('Regression run interrupted');
    for (const owned of children) {
      if (owned.error) throw owned.error;
      if (owned.exited)
        throw new Error(`${owned.name} exited unexpectedly (${owned.status})`);
    }
  }

  function start(name, executable, args, options = {}) {
    const output = createWriteStream(artifact(`${name}.log`));
    const child = spawn(executable, args, {
      cwd: exampleDir,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
    const owned = {
      name,
      child,
      output,
      exited: false,
      closed: false,
      status: null,
      error: null,
      ready: false,
    };
    children.push(owned);
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    let readiness = '';
    child.stdout.on('data', chunk => {
      readiness = (readiness + chunk.toString()).slice(-200);
      if (readiness.includes('regression fixture: 8098')) owned.ready = true;
    });
    child.once('error', error => {
      owned.error = error;
    });
    child.once('exit', (code, signal) => {
      owned.exited = true;
      owned.status = signal ?? code;
    });
    child.once('close', () => {
      owned.closed = true;
    });
    return owned;
  }

  function command(executable, args, output = uiLog, timeoutMs = 90000) {
    uiLog.write(`\n$ ${executable} ${args.join(' ')}\n`);
    return runLoggedCommand(executable, args, {
      cwd: exampleDir,
      output,
      commands,
      timeoutMs,
      logPath: artifact('ui.log'),
    });
  }

  const agent = (args, timeoutMs) => {
    sessionUsed = true;
    return command(
      'npx',
      ['-y', 'agent-device@0.17.4', ...args, ...target],
      uiLog,
      timeoutMs,
    );
  };

  async function healthy(test, label, timeoutMs = 60000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      checkChildren();
      try {
        if (await test()) return;
      } catch {
        /* Retry while the owned server starts. */
      }
      await sleep(500);
    }
    checkChildren();
    throw new Error(`${label} did not become healthy within ${timeoutMs} ms`);
  }

  try {
    const fixture = start(
      'fixture',
      process.execPath,
      [join(exampleDir, 'scripts/regression-server.mjs')],
      {
        env: { ...process.env, REGRESSION_PORT: '8098' },
      },
    );
    await healthy(
      async () => fixture.ready && (await fetchJSON('/health')).ok,
      'Regression fixture',
    );
    if (!core) {
      if (await metroRunning()) {
        verifyExistingMetro();
        console.log(
          'Reusing Metro for this example directory; it will remain running',
        );
      } else {
        const require = createRequire(join(exampleDir, 'package.json'));
        const cli = join(
          dirname(require.resolve('react-native/package.json')),
          'cli.js',
        );
        start(
          'metro',
          process.execPath,
          [cli, 'start', '--port', '8081', '--max-workers', '2'],
          {
            env: {
              ...process.env,
              CI: 'true',
              NODE_OPTIONS:
                `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=768`.trim(),
            },
          },
        );
        await healthy(metroRunning, 'Metro');
      }
    }
    checkChildren();
    if (core) {
      await command(
        'env',
        [
          'SIMCTL_CHILD_NITRO_REGRESSION_PROFILE=ios-core',
          'xcrun',
          'simctl',
          'launch',
          '--terminate-running-process',
          device,
          bundleID,
        ],
        uiLog,
        60000,
      );
    } else {
      if (platform === 'android') {
        await command('adb', ['-s', device, 'reverse', 'tcp:8081', 'tcp:8081']);
        await command('adb', ['-s', device, 'reverse', 'tcp:8098', 'tcp:8098']);
        await prepareAndroidRuntimePermissions({ device, bundleID, command });
      } else {
        await agent(['prepare', 'ios-runner', '--timeout', '240000'], 270000);
      }
      // Relaunch stops the iOS runner that prepare just warmed.
      await agent(
        platform === 'ios'
          ? ['open', bundleID]
          : ['open', bundleID, '--relaunch'],
        platform === 'ios' ? 120000 : 90000,
      );
      await agent(['snapshot', '-i'], platform === 'ios' ? 120000 : 90000);
      await agent(['wait', 'text', 'Open native regression checks', '60000']);
      await tapRegressionControl(
        agent,
        'Open native regression checks',
        platform,
      );
      await agent(['wait', 'text', 'Run regression', '60000']);
      await tapRegressionControl(agent, 'Run regression', platform);
    }
    const deadline = Date.now() + (core ? 180000 : 600000);
    const printed = new Set();
    const handledInteractions = new Set();
    let finished = false;
    while (Date.now() < deadline) {
      checkChildren();
      const [result, requestedInteraction] = await Promise.all([
        fetchJSON('/results'),
        fetchJSON('/interaction'),
      ]);
      const interaction = validateRegressionInteraction(requestedInteraction);
      if (
        result?.complete !== true &&
        interaction &&
        !handledInteractions.has(interaction.id)
      ) {
        handledInteractions.add(interaction.id);
        // Clear before tapping so polling cannot repeat the same gesture.
        await fetchJSON('/interaction', null);
        console.log(
          `Native interaction: ${interaction.action ?? interaction.label} (${interaction.id})`,
        );
        if (core)
          throw new Error(
            'Core profile unexpectedly requested OS UI automation',
          );
        let outcome;
        try {
          await performNativeInteraction(interaction, {
            platform,
            device,
            bundleID,
            agent,
            command,
            uploadFile,
          });
          outcome = {
            id: interaction.id,
            ok: true,
            detail: 'Native commands completed',
          };
        } catch (error) {
          outcome = {
            id: interaction.id,
            ok: false,
            detail: String(error).slice(0, 2000),
          };
        }
        await fetchJSON('/interaction-result', outcome);
        if (!outcome.ok) throw new Error(outcome.detail);
      }
      if (result !== null) {
        lastResult = result;
        await json('results.json', result);
        if (Array.isArray(result.cases)) {
          for (const item of result.cases) {
            if (printed.has(item.name)) continue;
            printed.add(item.name);
            console.log(
              `${item.ok === true ? 'PASS' : 'FAIL'} ${item.name} (${item.durationMs} ms): ${item.detail}`,
            );
          }
        }
        if (result.complete === true) {
          checkChildren();
          const count = validateRegressionResults(result, platform, profile);
          if (!core)
            await agent(['screenshot', artifact('success.png')], 30000);
          console.log(`COMPLETE PASS: ${count} ${platform} cases`);
          finished = true;
          break;
        }
      }
      await sleep(1000);
    }
    if (!finished)
      throw new Error(
        `Regression results were missing or incomplete after ${core ? 180 : 600} seconds`,
      );
  } catch (error) {
    failure = error;
    console.error(error.message);
    try {
      if (core)
        await command(
          'xcrun',
          ['simctl', 'io', device, 'screenshot', artifact('failure.png')],
          uiLog,
          10000,
        );
      else await agent(['screenshot', artifact('failure.png')], 30000);
    } catch (captureError) {
      console.error(`Failure screenshot: ${captureError.message}`);
    }
    const nativeLog = createWriteStream(artifact('native.log'));
    try {
      if (platform === 'android') {
        await command(
          'adb',
          ['-s', device, 'logcat', '-d', '-t', '2000', '-v', 'threadtime'],
          nativeLog,
          30000,
        );
      } else {
        await command(
          'xcrun',
          [
            'simctl',
            'spawn',
            device,
            'log',
            'show',
            '--last',
            '5m',
            '--style',
            'compact',
            '--predicate',
            'process == "example" OR subsystem CONTAINS "WebKit"',
          ],
          nativeLog,
          30000,
        );
      }
    } catch (captureError) {
      console.error(`Failure native log: ${captureError.message}`);
    } finally {
      nativeLog.end();
    }
  } finally {
    try {
      await json('requests.json', await fetchJSON('/requests'));
    } catch (error) {
      console.error(`Fixture requests unavailable: ${error.message}`);
    }
    await json('results.json', lastResult);
    if (sessionUsed) {
      try {
        await agent(['close'], 30000);
      } catch (error) {
        failure ??= error;
        console.error(`Session cleanup: ${error.message}`);
      }
    }
    for (const owned of children.reverse()) {
      try {
        await stopOwnedChild(owned);
      } catch (error) {
        failure ??= error;
        console.error(`${owned.name} cleanup: ${error.message}`);
      } finally {
        owned.output.end();
      }
    }
    uiLog.end();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
  if (failure) throw failure;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  run(...process.argv.slice(2)).catch(error => {
    console.error(error.stack ?? String(error));
    process.exitCode = 1;
  });
}
