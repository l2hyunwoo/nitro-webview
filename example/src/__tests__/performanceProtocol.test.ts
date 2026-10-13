/// <reference types="node" />
import vm from 'node:vm';
import {
  PAGE_SCRIPT,
  payload,
  request,
  summarize,
  validateResponse,
} from './performanceProtocol';

test('percentiles preserve raw samples and reject invalid measurements', () => {
  const samples = [4, 1, 3, 2];
  expect(summarize(samples)).toEqual({ count: 4, p50: 2, p95: 4 });
  expect(samples).toEqual([4, 1, 3, 2]);
  for (const values of [[], [-1], [NaN], [Infinity]]) {
    expect(() => summarize(values)).toThrow();
  }
});

test('the actual page fixture echoes exact payloads and deduplicates a bubbled event', () => {
  const listeners: Record<string, (event: { data: string }) => void> = {};
  const responses: string[] = [];
  vm.runInNewContext(PAGE_SCRIPT, {
    window: {
      addEventListener: (_: string, fn: (event: { data: string }) => void) => {
        listeners.window = fn;
      },
      ReactNativeWebView: {
        postMessage: (data: string) => responses.push(data),
      },
    },
    document: {
      addEventListener: (_: string, fn: (event: { data: string }) => void) => {
        listeners.document = fn;
      },
    },
  });
  expect(responses.shift()).toBe('ready');
  const event = { data: request(7, 1024, 3) };
  listeners.document(event);
  listeners.window(event);
  expect(responses).toHaveLength(3);
  responses.forEach((data, index) => validateResponse(data, 7, index, 1024));
  expect(() => validateResponse(responses[0], 7, 1, 1024)).toThrow();
  expect(() => validateResponse(responses[0], 7, 0, 64)).toThrow();
  expect(() => validateResponse('invalid JSON', 7, 0, 1024)).toThrow();
  expect(Buffer.byteLength(payload(65536), 'utf8')).toBe(65536);
});
