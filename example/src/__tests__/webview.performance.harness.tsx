import React from 'react';
import { Platform, View } from 'react-native';
import * as RNFS from '@dr.pogodin/react-native-fs';
import { cleanup, expect, render, test } from 'react-native-harness';
import { callback, NitroWebView, type NitroWebViewType } from 'nitro-webview';
import WebView from 'react-native-webview';
import nitroPackage from '../../../package.json';
import webviewPackage from 'react-native-webview/package.json';
import harnessPackage from 'react-native-harness/package.json';
import { bounded } from './webViewHarness';
import {
  BURST,
  PAGE_SCRIPT,
  PAYLOAD_BYTES,
  ROUNDS,
  SAMPLES,
  SOURCE,
  WARMUP,
  request,
  summarize,
  validateResponse,
} from './performanceProtocol';

declare const performance: { now(): number };

type Implementation = 'nitro' | 'react-native-webview';
type Sample = {
  implementation: Implementation;
  round: number;
  bytes: number;
  roundTripMs: number[];
  burstMs: number;
  messagesPerSecond: number;
};

const resultPath = `${RNFS.DocumentDirectoryPath}/webview-performance.json`;
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 100));

async function measure(implementation: Implementation, round: number) {
  let ref: Pick<NitroWebViewType, 'postMessage'> | null = null;
  let sequence = 0;
  let readyAt = 0;
  let failure: Error | undefined;
  let pending:
    | {
        id: number;
        bytes: number;
        count: number;
        received: number;
        start: number;
        resolve: (duration: number) => void;
        reject: (error: Error) => void;
      }
    | undefined;
  let resolveReady: () => void = () => {};
  let rejectReady: (error: Error) => void = () => {};
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  function fail(error: Error) {
    failure = error;
    rejectReady(error);
    pending?.reject(error);
  }
  function onMessage(event: { nativeEvent: { data: string } }) {
    const now = performance.now();
    const data = event.nativeEvent.data;
    try {
      if (data === 'ready' && !readyAt) {
        readyAt = now;
        resolveReady();
        return;
      }
      if (!pending) throw new Error('Unexpected message outside an exchange');
      validateResponse(data, pending.id, pending.received, pending.bytes);
      pending.received++;
      if (pending.received === pending.count) {
        pending.resolve(now - pending.start);
      }
    } catch (error) {
      fail(error instanceof Error ? error : new Error(String(error)));
    }
  }
  const common = {
    source: SOURCE,
    injectedJavaScript: PAGE_SCRIPT,
    javaScriptEnabled: true,
    originWhitelist: ['http://*', 'https://*'],
    style: { flex: 1 },
  };
  async function exchange(bytes: number, count = 1) {
    if (failure) throw failure;
    const id = ++sequence;
    const data = request(id, bytes, count);
    try {
      return await bounded(
        new Promise<number>((resolve, reject) => {
          pending = {
            id,
            bytes,
            count,
            received: 0,
            start: performance.now(),
            resolve,
            reject,
          };
          if (!ref) throw new Error('Native ref is missing');
          ref.postMessage(data);
        }),
      );
    } finally {
      pending = undefined;
    }
  }
  try {
    const start = performance.now();
    await bounded(
      Promise.all([
        ready,
        render(
          <View collapsable={false} style={{ width: 320, height: 320 }}>
            {implementation === 'nitro' ? (
              <NitroWebView
                {...common}
                hybridRef={callback(value => {
                  ref = value;
                })}
                onMessage={callback(onMessage)}
                onError={callback(event =>
                  fail(new Error(event.nativeEvent.description)),
                )}
              />
            ) : (
              <WebView
                {...common}
                ref={value => {
                  ref = value;
                }}
                onMessage={onMessage}
                onError={event =>
                  fail(new Error(event.nativeEvent.description))
                }
              />
            )}
          </View>,
          { timeout: 10000 },
        ),
      ]),
    );
    const renderToReadyMs = readyAt - start;
    const samples: Sample[] = [];
    for (const bytes of PAYLOAD_BYTES) {
      for (let i = 0; i < WARMUP; i++) await exchange(bytes);
      const roundTripMs: number[] = [];
      for (let i = 0; i < SAMPLES; i++) roundTripMs.push(await exchange(bytes));
      await exchange(bytes, BURST);
      const burstMs = await exchange(bytes, BURST);
      samples.push({
        implementation,
        round,
        bytes,
        roundTripMs,
        burstMs,
        messagesPerSecond: (BURST * 1000) / burstMs,
      });
    }
    await pause();
    if (failure) throw failure;
    return { implementation, round, renderToReadyMs, samples };
  } catch (error) {
    throw new Error(
      `${implementation} round=${round} sequence=${sequence} ready=${!!readyAt}: ${String(error)}`,
    );
  } finally {
    cleanup();
    await pause();
  }
}

test('compares native WebView message paths with identical verified payloads', async () => {
  // Remove stale success evidence before starting a run that can fail.
  if (await RNFS.exists(resultPath)) await RNFS.unlink(resultPath);
  const mounts: Awaited<ReturnType<typeof measure>>[] = [];
  const startedAt = new Date().toISOString();
  const report = {
    schemaVersion: 1,
    complete: false,
    startedAt,
    environment: {
      platform: Platform.OS,
      osVersion: Platform.Version,
      dev: __DEV__,
      hermes: 'HermesInternal' in globalThis,
      fabric: 'nativeFabricUIManager' in globalThis,
      reactNative: Platform.constants.reactNativeVersion,
      nitroWebview: nitroPackage.version,
      reactNativeWebview: webviewPackage.version,
      harness: harnessPackage.version,
    },
    protocol: {
      payloadBytes: PAYLOAD_BYTES,
      warmupPerSize: WARMUP,
      samplesPerSizePerMount: SAMPLES,
      burstCount: BURST,
      pairedRounds: ROUNDS,
      mountMetric:
        'harness-render-to-page-ready; first pair discarded; not cold startup or first paint',
      burstMetric:
        'RN request to last verified page response; includes one outbound request',
    },
    mounts,
  };
  try {
    // Each process warms both engines before recorded pairs; later order is AB/BA.
    for (let round = -1; round < ROUNDS; round++) {
      const order: Implementation[] =
        round % 2 === 0
          ? ['nitro', 'react-native-webview']
          : ['react-native-webview', 'nitro'];
      for (const implementation of order) {
        const mount = await measure(implementation, round);
        if (round >= 0) mounts.push(mount);
      }
    }
    expect(mounts.length).toBe(ROUNDS * 2);
    const summary = (['nitro', 'react-native-webview'] as const).map(
      implementation => {
        const own = mounts.filter(
          mount => mount.implementation === implementation,
        );
        return {
          implementation,
          renderToReadyMs: summarize(own.map(mount => mount.renderToReadyMs)),
          messages: PAYLOAD_BYTES.map(bytes => {
            const samples = own
              .flatMap(mount => mount.samples)
              .filter(sample => sample.bytes === bytes);
            return {
              bytes,
              roundTripMs: summarize(
                samples.flatMap(sample => sample.roundTripMs),
              ),
              burstMessagesPerSecond: summarize(
                samples.map(sample => sample.messagesPerSecond),
              ),
            };
          }),
        };
      },
    );
    report.complete = true;
    await RNFS.writeFile(
      resultPath,
      JSON.stringify({ ...report, summary }, null, 2),
      'utf8',
    );
    console.log(`WebView performance results: ${resultPath}`);
    console.log(JSON.stringify(summary));
  } catch (error) {
    report.complete = false;
    await RNFS.writeFile(
      resultPath,
      JSON.stringify({ ...report, error: String(error) }, null, 2),
      'utf8',
    );
    throw error;
  }
});
