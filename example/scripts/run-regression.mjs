import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
];
export const expectedRegressionCases = {
  android: [
    ...commonCases,
    'android-incognito-rejection',
    'android-renderer-recovery',
  ],
  ios: [
    ...commonCases,
    'ios-evaluation-error',
    'ios-navigation-stop-loading',
    'ios-storage-isolation',
    'ios-shared-cookie-first-request',
    'ios-initial-setting-change',
  ],
};

export function validateRegressionResults(result, platform) {
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
  const expected = expectedRegressionCases[platform];
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

export function validateRegressionInteraction(value) {
  if (value === null) return null;
  if (
    typeof value !== 'object' ||
    typeof value.id !== 'string' ||
    !value.id ||
    value.label !== 'Navigate'
  )
    throw new Error(
      'Unsupported regression interaction; only Navigate is allowed',
    );
  return { id: value.id, label: 'Navigate' };
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

async function run(platform, device) {
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
    return new Promise((resolveCommand, reject) => {
      const child = spawn(executable, args, {
        cwd: exampleDir,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      commands.add(child);
      child.stdout.pipe(output, { end: false });
      child.stderr.pipe(output, { end: false });
      let timedOut = false;
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
        if (code === 0 && !timedOut) resolveCommand();
        else
          reject(
            new Error(
              `${executable} ${args.slice(0, 3).join(' ')} failed (${timedOut ? 'timeout' : (signal ?? code)}); see ${artifact('ui.log')}`,
            ),
          );
      });
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
    checkChildren();
    if (platform === 'android') {
      await command('adb', ['-s', device, 'reverse', 'tcp:8081', 'tcp:8081']);
      await command('adb', ['-s', device, 'reverse', 'tcp:8098', 'tcp:8098']);
    } else {
      await agent(['prepare', 'ios-runner', '--timeout', '120000'], 150000);
    }
    await agent(['open', bundleID, '--relaunch']);
    await agent(['snapshot', '-i']);
    await agent(['wait', 'text', 'Regression verification', '60000']);
    await agent(['find', 'Regression verification', 'click', '--first']);
    await agent(['snapshot', '-i']);
    await agent(['find', 'Run regression', 'click', '--first']);
    const deadline = Date.now() + 240000;
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
        console.log(`Native tap: ${interaction.label} (${interaction.id})`);
        await agent(['snapshot', '-i'], 30000);
        await agent(['find', 'Navigate', 'click', '--first'], 30000);
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
          const count = validateRegressionResults(result, platform);
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
        'Regression results were missing or incomplete after 240 seconds',
      );
  } catch (error) {
    failure = error;
    console.error(error.message);
    try {
      await agent(['screenshot', artifact('failure.png')], 30000);
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
