import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareSimulator } from '../prepare-ios-simulator.mjs';

const udid = '01234567-89AB-CDEF-0123-456789ABCDEF';

test('prepares only its own simulator with bounded commands and no device listing', async () => {
  const calls = [];
  const published = [];
  assert.equal(
    await prepareSimulator(
      async (args, timeout) => {
        calls.push([args, timeout]);
        return args[0] === 'create' ? `${udid}\n` : '';
      },
      value => published.push(value),
    ),
    udid,
  );
  assert.deepEqual(published, [udid]);
  assert.equal(calls[0][0][0], 'create');
  assert.equal(calls[0][1], 20000);
  assert.deepEqual(calls.slice(1), [
    [['boot', udid], 20000],
    [['bootstatus', udid, '-b'], 120000],
  ]);
});

test('rejects invalid identifiers and preserves cleanup identity when boot fails', async () => {
  await assert.rejects(
    prepareSimulator(
      async () => 'unexpected output',
      () => assert.fail(),
    ),
    /UUID/,
  );
  let published;
  await assert.rejects(
    prepareSimulator(
      async args => {
        if (args[0] === 'create') return udid;
        throw new Error('boot timeout');
      },
      value => {
        published = value;
      },
    ),
    /boot timeout/,
  );
  assert.equal(published, udid);
});
