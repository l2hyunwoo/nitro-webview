import { waitForNativeInteraction } from '../src/regressionInteractions';

const aborted = () =>
  Object.assign(new Error('Aborted'), { name: 'AbortError' });
const result = { id: 'current', ok: true, detail: 'completed' };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('an aborted background read and an old result keep waiting for this interaction', async () => {
  const read = jest
    .fn()
    .mockRejectedValueOnce(aborted())
    .mockResolvedValueOnce({ ...result, id: 'previous' })
    .mockResolvedValue(result);
  const pending = waitForNativeInteraction(
    'current',
    'background-resume',
    read,
    () => true,
  );
  await jest.advanceTimersByTimeAsync(500);
  await pending;
  expect(read).toHaveBeenCalledTimes(3);
});

test('real transport failures and native failure acknowledgements still reject', async () => {
  const failure = new Error('Fixture unavailable');
  await expect(
    waitForNativeInteraction(
      'current',
      'tap',
      jest.fn().mockRejectedValue(failure),
      () => true,
    ),
  ).rejects.toBe(failure);
  await expect(
    waitForNativeInteraction(
      'current',
      'tap',
      jest
        .fn()
        .mockResolvedValue({ ...result, ok: false, detail: 'Missing control' }),
      () => true,
    ),
  ).rejects.toThrow('Missing control');
});

test('aborted reads cannot extend the 90-second interaction deadline', async () => {
  const read = jest.fn().mockRejectedValue(aborted());
  const pending = expect(
    waitForNativeInteraction('current', 'background-resume', read, () => true),
  ).rejects.toThrow('Native interaction background-resume timed out');
  await jest.advanceTimersByTimeAsync(90000);
  await pending;
  expect(read).toHaveBeenCalledTimes(360);
});

test('screen removal still stops an aborted result poll', async () => {
  await expect(
    waitForNativeInteraction(
      'current',
      'tap',
      jest.fn().mockRejectedValue(aborted()),
      () => false,
    ),
  ).rejects.toThrow('Regression screen was removed');
});
