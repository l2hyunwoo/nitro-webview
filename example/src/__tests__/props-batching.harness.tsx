import React from 'react';
import { View } from 'react-native';
import { callback, NitroWebView, type NitroWebViewType } from 'nitro-webview';
import { cleanup, expect, render, test, waitFor } from 'react-native-harness';
import { bounded, WAIT } from './webViewHarness';

const page = (title: string) => ({
  html: `<!doctype html><title>${title}</title><script>window.observedBefore = window.batchBefore</script>`,
});

test('updates both injection scripts before loading a source in the same prop batch', async () => {
  let ref: NitroWebViewType | null = null;
  const messages: string[] = [];
  const onMessage = callback((event: { nativeEvent: { data: string } }) => {
    messages.push(event.nativeEvent.data);
  });
  const hybridRef = callback((value: NitroWebViewType) => {
    ref = value;
  });
  const element = (version: string) => (
    <View style={{ width: 320, height: 320 }}>
      <NitroWebView
        source={page(version)}
        hybridRef={hybridRef}
        onMessage={onMessage}
        injectedJavaScriptBeforeContentLoaded={`window.batchBefore = ${JSON.stringify(version)};`}
        injectedJavaScript={`window.ReactNativeWebView.postMessage(JSON.stringify({title:document.title,before:window.observedBefore,after:${JSON.stringify(version)}})); true;`}
      />
    </View>
  );
  try {
    const mounted = await render(element('one'), { timeout: 10000 });
    await waitFor(
      () =>
        expect(messages).toEqual([
          '{"title":"one","before":"one","after":"one"}',
        ]),
      WAIT,
    );
    await mounted.rerender(element('two'));
    await waitFor(
      () =>
        expect(messages).toEqual([
          '{"title":"one","before":"one","after":"one"}',
          '{"title":"two","before":"two","after":"two"}',
        ]),
      WAIT,
    );
    await bounded(
      ref!.evaluateJavaScript(
        'history.pushState({}, "", "#after-batch"); true',
      ),
    );
    expect(
      JSON.parse(
        await bounded(
          ref!.evaluateJavaScript(
            '({hash:location.hash,shim:window.__nitroHistoryShimInstalled})',
          ),
        ),
      ),
    ).toEqual({ hash: '#after-batch', shim: true });
  } finally {
    cleanup();
  }
});

test('switches plain and wrapped callbacks without reloading, then removes and restores them', async () => {
  let ref: NitroWebViewType | null = null;
  let loads = 0;
  const messages: string[] = [];
  const source = page('stable');
  const onLoadEnd = () => {
    loads++;
  };
  const receive = (event: { nativeEvent: { data: string } }) => {
    messages.push(`first:${event.nativeEvent.data}`);
  };
  const replacement = (event: { nativeEvent: { data: string } }) => {
    messages.push(`second:${event.nativeEvent.data}`);
  };
  const hybridRef = (value: NitroWebViewType) => {
    ref = value;
  };
  const handlers = [
    receive,
    callback(receive),
    callback(replacement),
    undefined,
    replacement,
  ];
  const element = (phase: number) => (
    <View collapsable={false} style={{ width: 320, height: 320 }}>
      <NitroWebView
        style={{ flex: 1 }}
        source={source}
        onLoadEnd={onLoadEnd}
        hybridRef={
          phase === 3
            ? undefined
            : phase % 2 === 0
              ? hybridRef
              : callback(hybridRef)
        }
        onMessage={handlers[phase]}
      />
    </View>
  );
  try {
    const mounted = await render(element(0), { timeout: 10000 });
    await waitFor(() => expect(loads).toBe(1), WAIT);
    await waitFor(async () => {
      expect(
        JSON.parse(await bounded(ref!.evaluateJavaScript('document.title'))),
      ).toBe('stable');
    }, WAIT);
    await bounded(ref!.evaluateJavaScript('window.marker = 42'));
    const expected: string[] = [];
    for (let phase = 0; phase < handlers.length; phase++) {
      await mounted.rerender(element(phase));
      expect(
        JSON.parse(
          await bounded(
            ref!.evaluateJavaScript(
              `window.ReactNativeWebView.postMessage("phase-${phase}"); document.title`,
            ),
          ),
        ),
      ).toBe('stable');
      if (phase !== 3)
        expected.push(`${phase < 2 ? 'first' : 'second'}:phase-${phase}`);
      await waitFor(() => expect(messages).toEqual(expected), WAIT);
    }
    expect(
      JSON.parse(await bounded(ref!.evaluateJavaScript('window.marker'))),
    ).toBe(42);
    expect(loads).toBe(1);
  } finally {
    cleanup();
  }
});
