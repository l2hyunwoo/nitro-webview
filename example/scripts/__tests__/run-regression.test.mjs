import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import {
  expectedRegressionCases,
  isPlatformRegressionArtifact,
  stopOwnedChild,
  validateRegressionResults,
  validateRegressionInteraction,
  performNativeInteraction,
} from '../run-regression.mjs';

const result = (platform = 'ios') => ({
  complete: true,
  platform,
  cases: expectedRegressionCases[platform].map(name => ({
    name,
    ok: true,
    detail: 'actual fixture response',
    durationMs: 12,
  })),
});

test('accepts completed production result schema', () => {
  assert.equal(validateRegressionResults(result(), 'ios'), 33);
  assert.equal(validateRegressionResults(result('android'), 'android'), 37);
});

test('incomplete, missing, empty and cross-platform results never pass', () => {
  for (const value of [
    null,
    {},
    { ...result(), complete: false },
    { ...result(), cases: [] },
    { ...result(), platform: 'android' },
  ]) {
    assert.throws(() => validateRegressionResults(value, 'ios'));
  }
});

test('partial coverage and fixture-connection placeholder never pass', () => {
  for (const platform of ['ios', 'android']) {
    const complete = result(platform);
    assert.throws(
      () =>
        validateRegressionResults(
          {
            ...complete,
            cases: complete.cases.filter(
              item => item.name !== 'origin-whitelist-block',
            ),
          },
          platform,
        ),
      /missing: origin-whitelist-block/,
    );
  }
  const android = result('android');
  assert.throws(
    () =>
      validateRegressionResults(
        {
          ...android,
          cases: android.cases.filter(
            item => item.name !== 'android-renderer-recovery',
          ),
        },
        'android',
      ),
    /missing: android-renderer-recovery/,
  );
  assert.throws(
    () =>
      validateRegressionResults(
        {
          ...result(),
          cases: result().cases.filter(
            item => item.name !== 'navigation-handler-reject',
          ),
        },
        'ios',
      ),
    /missing: navigation-handler-reject/,
  );
  assert.throws(
    () =>
      validateRegressionResults(
        { ...result(), cases: result().cases.slice(1) },
        'ios',
      ),
    /missing: load-200/,
  );
  assert.throws(
    () =>
      validateRegressionResults(
        {
          ...result(),
          cases: [
            {
              name: 'fixture-connection',
              ok: true,
              detail: 'not the regression suite',
              durationMs: 1,
            },
          ],
        },
        'ios',
      ),
    /missing:/,
  );
});

test('failed, malformed and duplicate cases never pass', () => {
  for (const cases of [
    [{ ...result().cases[0], ok: false }],
    [{ ...result().cases[0], ok: 'true' }],
    [{ ...result().cases[0], durationMs: -1 }],
    [{ ...result().cases[0], durationMs: NaN }],
    [{ name: 'empty' }],
    [null],
    [...result().cases, ...result().cases],
  ]) {
    assert.throws(() =>
      validateRegressionResults({ ...result(), cases }, 'ios'),
    );
  }
});

test('invalid CLI arguments fail before touching services or devices', () => {
  const cli = fileURLToPath(new URL('../run-regression.mjs', import.meta.url));
  const child = spawnSync(process.execPath, [cli, 'unsupported', 'device'], {
    encoding: 'utf8',
  });
  assert.equal(child.status, 1);
  assert.match(child.stderr, /Usage:/);
});

test('native interaction accepts only identified fixed fixture actions', () => {
  assert.equal(validateRegressionInteraction(null), null);
  assert.deepEqual(
    validateRegressionInteraction({ id: 'history-1', label: 'Navigate' }),
    { id: 'history-1', label: 'Navigate' },
  );
  for (const action of [
    'background-resume',
    'chooser-cancel',
    'chooser-upload',
    'capture-cancel',
    'fullscreen-exit',
    'permission-allow',
    'permission-deny',
  ])
    assert.deepEqual(validateRegressionInteraction({ id: 'native', action }), {
      id: 'native',
      action,
    });
  for (const value of [
    undefined,
    false,
    [],
    {},
    { id: '', label: 'Navigate' },
    { id: 1, label: 'Navigate' },
    { id: 'history-1', label: 'Delete' },
    { id: 'history-1', label: 'Navigate --shutdown' },
    { id: 'native', action: 'shell' },
    { id: 'native', action: 'chooser-upload', label: 'Delete' },
    { id: 'native', action: 'tap', label: 'Navigate', executable: 'rm' },
  ])
    assert.throws(() => validateRegressionInteraction(value));
});

const documentsSnapshot =
  'Page: com.example\n@e1 [text] "Recent"\n@e2 [text] "Show roots"\n@e3 [text] "Downloads"\n@e4 [text] "nitro-regression.txt"';

function nativeContext(snapshot = documentsSnapshot) {
  const calls = [];
  let surface = 'app';
  const app =
    'Page: com.example\n@e1 [button] "RUN REGRESSION" [disabled]\n@e4 [text] "Upload fixture"\n@e5 [button] "Upload fixture: No file chosen"\n@e6 [text] "Capture fixture"\n@e7 [button] "Capture fixture: No file chosen"\n@e8 [button] "Location"\n@e9 [button] "Done"';
  const permission =
    'Page: com.example\n@e1 [scroll-area] "Allow example to access this device’s location?"\n@e5 [radiobutton] "Precise"\n@e7 [button] "While using the app"\n@e9 [button] "Don’t allow"';
  return {
    calls,
    platform: 'android',
    device: 'emulator-5554',
    bundleID: 'com.example',
    uploadFile: '/tmp/fixture-upload.txt',
    agent: async args => {
      calls.push(['agent', ...args]);
      if (args[0] === 'snapshot')
        return surface === 'app'
          ? app
          : surface === 'permission'
            ? permission
            : snapshot;
      if (args[0] === 'click') {
        if (surface === 'permission') {
          if (args[1] === '@e7' || args[1] === '@e9') surface = 'app';
        } else if (surface === 'app') {
          if (args[1] === '@e5' || args[1] === '@e7') surface = 'picker';
          if (args[1] === '@e8') surface = 'permission';
        }
      }
      if (args[0] === 'find' && args[1] === 'nitro-regression.txt')
        surface = 'app';
      return '';
    },
    command: async (executable, args) => {
      calls.push([executable, ...args]);
      if (args.includes('keyevent')) surface = 'app';
      if (args.includes('dumpsys')) {
        const component =
          surface === 'permission'
            ? 'com.google.android.permissioncontroller/com.android.permissioncontroller.permission.ui.GrantPermissionsActivity'
            : 'com.example/.MainActivity';
        return `ActivityRecord{old u0 com.other/.OldActivity t1}\n  topResumedActivity=ActivityRecord{current u0 ${component} t7}\n  ResumedActivity: ActivityRecord{current u0 ${component} t7}`;
      }
      return '';
    },
  };
}

test('invalid and unsupported native actions fail before device commands', async () => {
  const context = nativeContext();
  await assert.rejects(
    performNativeInteraction({ id: 'bad', action: 'shell' }, context),
  );
  for (const action of [
    'chooser-upload',
    'capture-cancel',
    'permission-allow',
  ]) {
    await assert.rejects(
      performNativeInteraction(
        { id: action, action },
        { ...context, platform: 'ios' },
      ),
    );
  }
  assert.deepEqual(context.calls, []);
});

test('file input taps use fresh button refs and never the preceding text label', async t => {
  const context = nativeContext();
  await performNativeInteraction(
    { id: 'input', action: 'tap', label: 'Upload fixture' },
    context,
  );
  assert.deepEqual(context.calls, [
    ['agent', 'snapshot', '-i'],
    ['agent', 'click', '@e5'],
  ]);
  const missing = nativeContext();
  missing.agent = async args => {
    missing.calls.push(args);
    return '@e4 [text] "Upload fixture"';
  };
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const rejected = assert.rejects(
    performNativeInteraction(
      { id: 'input', action: 'tap', label: 'Upload fixture' },
      missing,
    ),
    /button was not observed/,
  );
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(15000);
  await rejected;
  assert.deepEqual(missing.calls, [
    ['snapshot', '-i'],
    ['snapshot', '-i'],
  ]);
});

test('fixed-label tap polls fresh snapshots until its button appears without wait text', async () => {
  const context = nativeContext();
  let snapshots = 0;
  context.agent = async args => {
    context.calls.push(args);
    if (args[0] === 'snapshot')
      return ++snapshots === 1
        ? '@e2 [button] "RUN REGRESSION"\n@e3 [webview] "regression fixture"'
        : '@e2 [button] "Unrelated control"\n@e5 [button] "Camera permission"\n@e6 [button] "Microphone permission"';
    return '';
  };
  await performNativeInteraction(
    { id: 'media', action: 'tap', label: 'Camera permission' },
    context,
  );
  assert.deepEqual(context.calls, [
    ['snapshot', '-i'],
    ['snapshot', '-i'],
    ['click', '@e5'],
  ]);
});

test('only the expected permission transition is accepted after a fresh real permission dialog snapshot', async () => {
  const transition = new Error('agent failed');
  transition.output =
    'Error (COMMAND_FAILED): press @e8 left com.example and foregrounded com.google.android.permissioncontroller. The tap likely escaped the app.';
  const context = nativeContext();
  const agent = context.agent;
  context.agent = async args => {
    const result = await agent(args);
    if (args[0] === 'click' && args[1] === '@e8') throw transition;
    return result;
  };
  await performNativeInteraction(
    { id: 'deny', action: 'permission-deny' },
    context,
  );
  assert.ok(
    context.calls.some(call => call[1] === 'click' && call[2] === '@e9'),
  );

  for (const message of [
    'ADB disconnected',
    transition.output.replace(
      'com.google.android.permissioncontroller',
      'com.android.settings',
    ),
  ]) {
    const broken = nativeContext();
    const next = broken.agent;
    const failure = Object.assign(new Error('other failure'), {
      output: message,
    });
    broken.agent = async args => {
      const result = await next(args);
      if (args[0] === 'click' && args[1] === '@e8') throw failure;
      return result;
    };
    await assert.rejects(
      performNativeInteraction(
        { id: 'deny', action: 'permission-deny' },
        broken,
      ),
      error => error === failure,
    );
    assert.equal(
      broken.calls.some(call => call[2] === '@e9'),
      false,
    );
  }
  const absent = nativeContext();
  const next = absent.agent;
  absent.agent = async args => {
    const result = await next(args);
    if (args[0] === 'click' && args[1] === '@e8') throw transition;
    return result.includes('Allow example to access this device’s location?')
      ? 'Page: com.example\n@e1 [button] "RUN REGRESSION"'
      : result;
  };
  await assert.rejects(
    performNativeInteraction({ id: 'deny', action: 'permission-deny' }, absent),
    /permission dialog was not observed/,
  );
  assert.equal(
    absent.calls.some(call => call[2] === '@e9'),
    false,
  );
  for (const state of [{ timedOut: true }, { signal: 'SIGTERM' }]) {
    const interrupted = nativeContext();
    const agent = interrupted.agent;
    const failure = Object.assign(new Error('command interrupted'), {
      output: transition.output,
      ...state,
    });
    interrupted.agent = async args => {
      const result = await agent(args);
      if (args[0] === 'click' && args[1] === '@e8') throw failure;
      return result;
    };
    await assert.rejects(
      performNativeInteraction(
        { id: 'deny', action: 'permission-deny' },
        interrupted,
      ),
      error => error === failure,
    );
  }
});

test('permission identity uses resumed activity, accepts actual curved/ASCII labels, and clicks their observed ref', async () => {
  for (const ascii of [false, true]) {
    const context = nativeContext();
    const agent = context.agent;
    context.agent = async args => {
      const result = await agent(args);
      return ascii ? result.replace('Don’t allow', "Don't allow") : result;
    };
    const command = context.command;
    context.command = async (executable, args) => {
      const result = await command(executable, args);
      // Older dumps omit topResumedActivity, while session snapshot Page remains com.example.
      return result.replace(/^.*topResumedActivity=.*\n/m, '');
    };
    await performNativeInteraction(
      { id: 'deny', action: 'permission-deny' },
      context,
    );
    assert.ok(
      context.calls.some(call => call[1] === 'click' && call[2] === '@e9'),
    );
    assert.equal(
      context.calls.some(call => call[1] === 'find'),
      false,
    );
  }
  for (const resumed of [
    '',
    'topResumedActivity=ActivityRecord{current u0 com.example/.MainActivity t7}\nResumedActivity: ActivityRecord{old u0 com.google.android.permissioncontroller/com.android.permissioncontroller.permission.ui.GrantPermissionsActivity t6}',
  ]) {
    const context = nativeContext();
    const command = context.command;
    context.command = async (executable, args) => {
      await command(executable, args);
      return args.includes('dumpsys') ? resumed : '';
    };
    await assert.rejects(
      performNativeInteraction(
        { id: 'deny', action: 'permission-deny' },
        context,
      ),
      /permission dialog was not observed/,
    );
    assert.equal(
      context.calls.some(call => call[1] === 'click' && call[2] === '@e9'),
      false,
    );
  }
});

test('picker cancellation requires observed OS UI and never selects a file', async () => {
  const absent = nativeContext('Regression verification');
  await assert.rejects(
    performNativeInteraction(
      { id: 'cancel', action: 'chooser-cancel' },
      absent,
    ),
    /did not appear/,
  );
  assert.equal(
    absent.calls.some(call => call[0] === 'adb'),
    false,
  );
  const context = nativeContext();
  await performNativeInteraction(
    { id: 'cancel', action: 'chooser-cancel' },
    context,
  );
  assert.deepEqual(
    context.calls.findLast(call => call.includes('keyevent')),
    ['adb', '-s', 'emulator-5554', 'shell', 'input', 'keyevent', '4'],
  );
  assert.equal(
    context.calls.some(call => call.includes('nitro-regression.txt')),
    false,
  );
});

test('upload selects one fixed file through DocumentsUI after preparing its real bytes', async () => {
  const context = nativeContext();
  await performNativeInteraction(
    { id: 'upload', action: 'chooser-upload' },
    context,
  );
  assert.deepEqual(context.calls[0], [
    'adb',
    '-s',
    'emulator-5554',
    'push',
    '/tmp/fixture-upload.txt',
    '/sdcard/Download/nitro-regression.txt',
  ]);
  assert.deepEqual(
    context.calls.filter(call => call[1] === 'click').map(call => call[2]),
    ['@e5'],
  );
  assert.deepEqual(
    context.calls.filter(call => call[1] === 'find').map(call => call[2]),
    ['Show roots', 'Downloads', 'nitro-regression.txt'],
  );
});

test('upload opens roots from remembered Downloads without waiting for Recent', async () => {
  const context = nativeContext(
    'Page: com.example\n@e1 [text] "Files in Downloads"\n@e4 [button] "Show roots"\n@e6 [text] "Downloads"\n@e8 [gridview] "nitro-regression.txt, 43 B, 10:28 AM"',
  );
  await performNativeInteraction(
    { id: 'upload-downloads', action: 'chooser-upload' },
    context,
  );
  assert.equal(
    context.calls.some(call => call[1] === 'wait' && call.includes('Recent')),
    false,
  );
  const openRoots = context.calls.findIndex(
    call => call[1] === 'click' && call[2] === '@e4',
  );
  assert.ok(openRoots > 0);
  assert.deepEqual(context.calls[openRoots - 1], ['agent', 'snapshot', '-i']);
  assert.deepEqual(
    context.calls.filter(call => call[1] === 'click').map(call => call[2]),
    ['@e5', '@e4'],
  );
  assert.deepEqual(
    context.calls.filter(call => call[1] === 'find').map(call => call[2]),
    ['Downloads', 'nitro-regression.txt'],
  );
});

test('upload selects Downloads from the observed collapsed DocumentsUI roots list', async () => {
  const context = nativeContext(
    'Page: com.example\n@e1 [text] "Files in Downloads"\n@e4 [button] "Show roots"\n@e8 [gridview] "nitro-regression.txt, 43 B, 10:28 AM"',
  );
  const roots =
    'Page: com.example\n@e20 [list] "Drive, sdk_gphone64_arm64, Downloads, Documents, Recent"';
  const agent = context.agent;
  let rootsOpen = false;
  context.agent = async args => {
    if (args[0] === 'snapshot' && rootsOpen) {
      context.calls.push(['agent', ...args]);
      return roots;
    }
    const result = await agent(args);
    if (args[0] === 'click' && args[1] === '@e4') rootsOpen = true;
    if (args[0] === 'find' && args[1] === 'Downloads') rootsOpen = false;
    return result;
  };
  await performNativeInteraction(
    { id: 'upload-roots', action: 'chooser-upload' },
    context,
  );
  const fallback = context.calls.findIndex(call => call[1] === 'find');
  assert.ok(fallback > 0);
  assert.deepEqual(context.calls[fallback - 1], ['agent', 'snapshot', '-i']);
  assert.deepEqual(context.calls[fallback], [
    'agent',
    'find',
    'Downloads',
    'click',
    '--first',
  ]);
  assert.deepEqual(
    context.calls.filter(call => call[1] === 'click').map(call => call[2]),
    ['@e5', '@e4'],
  );
  assert.deepEqual(
    context.calls.filter(call => call[1] === 'find').map(call => call[2]),
    ['Downloads', 'nitro-regression.txt'],
  );
});

test('capture cancellation requires camera offering and camera UI; never fabricates a photo', async () => {
  const absent = nativeContext();
  await assert.rejects(
    performNativeInteraction(
      { id: 'capture', action: 'capture-cancel' },
      absent,
    ),
    /did not offer/,
  );
  const context = nativeContext(
    'Page: com.example\n@e1 [text] "Camera"\n@e2 [text] "Photo"',
  );
  await performNativeInteraction(
    { id: 'capture', action: 'capture-cancel' },
    context,
  );
  assert.deepEqual(
    context.calls.filter(call => call[1] === 'click').map(call => call[2]),
    ['@e7'],
  );
  assert.deepEqual(
    context.calls.filter(call => call[1] === 'find').map(call => call[2]),
    ['Camera'],
  );
  assert.deepEqual(
    context.calls.findLast(call => call.includes('keyevent')),
    ['adb', '-s', 'emulator-5554', 'shell', 'input', 'keyevent', '4'],
  );
});

test('runtime location flows tap explicit OS consent and inject only emulator GPS', async () => {
  const allow = nativeContext();
  await performNativeInteraction(
    { id: 'allow', action: 'permission-allow' },
    allow,
  );
  assert.deepEqual(
    allow.calls.filter(call => call[1] === 'click').map(call => call[2]),
    ['@e8', '@e7'],
  );
  assert.deepEqual(allow.calls.at(-1), [
    'adb',
    '-s',
    'emulator-5554',
    'emu',
    'geo',
    'fix',
    '127.0',
    '37.5',
  ]);
  const deny = nativeContext();
  deny.device = 'physical-device';
  await performNativeInteraction(
    { id: 'deny', action: 'permission-deny' },
    deny,
  );
  assert.deepEqual(
    deny.calls.filter(call => call[1] === 'click').map(call => call[2]),
    ['@e8', '@e9'],
  );
  assert.equal(
    deny.calls.some(call => call.includes('emu')),
    false,
  );
});

test('background and foreground use the same app without relaunch', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const context = nativeContext();
  const running = performNativeInteraction(
    { id: 'resume', action: 'background-resume' },
    context,
  );
  await Promise.resolve();
  t.mock.timers.tick(1500);
  await running;
  assert.deepEqual(context.calls, [
    ['agent', 'home'],
    ['agent', 'open', 'com.example'],
  ]);
});

test('fullscreen exit uses OS back on Android and Done on iOS', async t => {
  const android = nativeContext();
  await performNativeInteraction(
    { id: 'exit', action: 'fullscreen-exit' },
    android,
  );
  assert.deepEqual(android.calls[0], [
    'adb',
    '-s',
    'emulator-5554',
    'shell',
    'input',
    'keyevent',
    '4',
  ]);
  const ios = { ...nativeContext(), platform: 'ios' };
  await performNativeInteraction(
    { id: 'exit', action: 'fullscreen-exit' },
    ios,
  );
  assert.deepEqual(
    ios.calls.find(call => call[1] === 'click'),
    ['agent', 'click', '@e9'],
  );
  assert.equal(
    android.calls.some(call => call[1] === 'wait'),
    false,
  );
  const hidden = nativeContext();
  hidden.agent = async () => 'Page: com.example\n@e1 [button] "RUN REGRESSION"';
  hidden.command = async () =>
    'topResumedActivity=ActivityRecord{current u0 com.google.android.permissioncontroller/com.android.permissioncontroller.permission.ui.GrantPermissionsActivity t7}';
  let clockReads = 0;
  t.mock.method(Date, 'now', () => (clockReads++ ? 15000 : 0));
  await assert.rejects(
    performNativeInteraction({ id: 'exit', action: 'fullscreen-exit' }, hidden),
    /did not return to the foreground/,
  );
});

test('app return polls fresh snapshots from the OS picker to the actual foreground app without wait text', async () => {
  const context = nativeContext();
  let snapshots = 0;
  context.agent = async args => {
    context.calls.push(['agent', ...args]);
    return args[0] === 'snapshot'
      ? ++snapshots === 1
        ? '@e1 [scroll-area] "Files in Downloads"'
        : '@e2 [button] "RUN REGRESSION" [disabled]'
      : '';
  };
  await performNativeInteraction(
    { id: 'exit', action: 'fullscreen-exit' },
    context,
  );
  assert.deepEqual(
    context.calls.filter(call => call[0] === 'agent'),
    [
      ['agent', 'snapshot', '-i'],
      ['agent', 'snapshot', '-i'],
    ],
  );
  assert.equal(
    context.calls.filter(call => call.includes('dumpsys')).length,
    1,
  );
});

test('artifact cleanup matches only this platform regression evidence', () => {
  assert.equal(
    isPlatformRegressionArtifact('ios-regression-success.png', 'ios'),
    true,
  );
  assert.equal(
    isPlatformRegressionArtifact('android-regression-native.log', 'ios'),
    false,
  );
  assert.equal(isPlatformRegressionArtifact('unrelated.log', 'ios'), false);
});

test('cleanup never signals an already closed process group', async t => {
  const kill = t.mock.method(process, 'kill', () => true);
  await stopOwnedChild({ closed: true, child: { pid: 123 } });
  assert.equal(kill.mock.callCount(), 0);
});

test('graceful close prevents a second signal to a reused process group', async t => {
  const owned = { closed: false, child: new EventEmitter() };
  owned.child.pid = 123;
  const kill = t.mock.method(process, 'kill', () => {
    setImmediate(() => {
      owned.closed = true;
      owned.child.emit('close');
    });
    return true;
  });
  await stopOwnedChild(owned);
  assert.deepEqual(
    kill.mock.calls.map(call => call.arguments),
    [[-123, 'SIGTERM']],
  );
});

test('cleanup escalates only while an owned process group remains open', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const kill = t.mock.method(process, 'kill', () => true);
  const child = new EventEmitter();
  child.pid = 123;
  const stopping = stopOwnedChild({ closed: false, child });
  t.mock.timers.tick(2000);
  await stopping;
  assert.deepEqual(
    kill.mock.calls.map(call => call.arguments),
    [
      [-123, 'SIGTERM'],
      [-123, 'SIGKILL'],
    ],
  );
});

test('cleanup reports permission errors instead of treating them as success', async t => {
  t.mock.method(process, 'kill', () => {
    throw Object.assign(new Error('permission denied'), { code: 'EPERM' });
  });
  await assert.rejects(stopOwnedChild({ closed: false, child: { pid: 123 } }), {
    code: 'EPERM',
  });
});
