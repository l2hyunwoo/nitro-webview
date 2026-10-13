export const PAYLOAD_BYTES = [64, 1024, 65536] as const;
export const WARMUP = 5;
export const SAMPLES = 30;
export const BURST = 128;
export const ROUNDS = 6;

export function summarize(samples: number[]) {
  if (
    !samples.length ||
    samples.some(value => !Number.isFinite(value) || value < 0)
  ) {
    throw new Error('Expected finite, nonnegative timing samples');
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1],
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
  };
}

// ASCII payloads make string length equal UTF-8 byte length.
export function payload(bytes: number) {
  return 'x'.repeat(bytes);
}

export const PAGE_SCRIPT = `
(function () {
  var lastMessage;
  function receive(event) {
    // Android document events can also reach window; count each request once.
    if (event === lastMessage) return;
    lastMessage = event;
    var request = JSON.parse(event.data);
    for (var index = 0; index < request.count; index++) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        id: request.id, index: index, payload: request.payload
      }));
    }
  }
  window.addEventListener('message', receive);
  document.addEventListener('message', receive);
  window.ReactNativeWebView.postMessage('ready');
})(); true;
`;

export const SOURCE = {
  html: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>WebView performance fixture</body></html>',
  baseUrl: 'http://localhost/',
};

export function request(id: number, bytes: number, count = 1) {
  return JSON.stringify({ id, count, payload: payload(bytes) });
}

export function validateResponse(
  data: string,
  id: number,
  index: number,
  bytes: number,
) {
  const value = JSON.parse(data);
  if (
    value.id !== id ||
    value.index !== index ||
    value.payload !== payload(bytes)
  ) {
    throw new Error(
      `Invalid, missing, duplicate or reordered message at ${id}:${index}`,
    );
  }
}
