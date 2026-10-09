import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  expectedRegressionCases,
  validateRegressionResults,
  validateRegressionInteraction,
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
  assert.equal(validateRegressionResults(result(), 'ios'), 24);
  assert.equal(validateRegressionResults(result('android'), 'android'), 21);
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

test('native interaction accepts only an identified Navigate tap', () => {
  assert.equal(validateRegressionInteraction(null), null);
  assert.deepEqual(
    validateRegressionInteraction({ id: 'history-1', label: 'Navigate' }),
    { id: 'history-1', label: 'Navigate' },
  );
  for (const value of [
    undefined,
    false,
    [],
    {},
    { id: '', label: 'Navigate' },
    { id: 1, label: 'Navigate' },
    { id: 'history-1', label: 'Delete' },
    { id: 'history-1', label: 'Navigate --shutdown' },
  ])
    assert.throws(() => validateRegressionInteraction(value));
});
