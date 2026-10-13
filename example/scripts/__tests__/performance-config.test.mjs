import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const normal = require('../../jest.harness.config.js');
const performance = require('../../jest.performance.config.js');
const metro = require('../../metro.config.js');

test('performance runs are opt-in and select only the benchmark suite', () => {
  const file = '/src/__tests__/webview.performance.harness.tsx';
  assert.ok(
    normal.testPathIgnorePatterns.some(pattern =>
      new RegExp(pattern).test(file),
    ),
  );
  assert.ok(
    !performance.testPathIgnorePatterns.some(pattern =>
      new RegExp(pattern).test(file),
    ),
  );
  assert.deepEqual(performance.testMatch, [
    '**/__tests__/**/*.performance.harness.tsx',
  ]);
});

test('Metro resolves linked library peers through the app without changing other modules', () => {
  const context = {
    resolveRequest: (options, name, platform) => ({ options, name, platform }),
  };
  for (const name of [
    'react',
    'react/jsx-runtime',
    'react-native',
    'react-native-nitro-modules',
  ]) {
    const result = metro.resolver.resolveRequest(context, name, 'ios');
    assert.equal(result.options.disableHierarchicalLookup, true);
    assert.equal(result.name, name);
    assert.equal(result.platform, 'ios');
  }
  assert.equal(
    metro.resolver.resolveRequest(context, 'other', 'android').options,
    context,
  );
});
