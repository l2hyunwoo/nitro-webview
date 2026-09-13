import React, { useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { callback, NitroWebView } from 'nitro-webview';
import type { WebViewLoadEvent, WebViewLoadProgressEvent } from 'nitro-webview';

export function LoadEventsVerificationScreen() {
  const [host, setHost] = useState('http://127.0.0.1:18966');
  const [request, setRequest] = useState<{ uri: string; key: number }>();
  const source = useMemo(() => ({ uri: request?.uri ?? '' }), [request]);
  const [events, setEvents] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [loads, setLoads] = useState(0);
  const [ends, setEnds] = useState(0);
  const started = useRef(0);
  const sequence = useRef(0);
  const log = (message: string) => {
    const line = `${++sequence.current}. ${((Date.now() - started.current) / 1000).toFixed(1)}s ${message}`;
    setEvents(previous => [...previous, line].slice(-40));
  };
  const begin = (path: string) => {
    started.current = Date.now();
    sequence.current = 0;
    setEvents([]);
    setProgress(0);
    setLoads(0);
    setEnds(0);
    const uri =
      path === 'transport'
        ? 'http://127.0.0.1:18967/unreachable'
        : `${host.replace(/\/$/, '')}${path}`;
    setRequest({ uri, key: Date.now() });
  };
  return (
    <View style={styles.screen}>
      <Text style={styles.heading}>Native load events</Text>
      <Text style={styles.hint}>
        Success: start → load → end. Failures: error → end, zero load.
      </Text>
      <TextInput
        accessibilityLabel="Verification server URL"
        autoCapitalize="none"
        autoCorrect={false}
        value={host}
        onChangeText={setHost}
        style={styles.input}
      />
      <View style={styles.buttons}>
        {[
          ['Delayed success', '/'],
          ['HTTP 404', '/404'],
          ['Transport error', 'transport'],
        ].map(([label, path]) => (
          <Pressable
            key={path}
            accessibilityRole="button"
            onPress={() => begin(path!)}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.counts}>
        onLoad: {loads} onLoadEnd: {ends} Progress: {Math.round(progress * 100)}
        %
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
      <View style={styles.web}>
        {request ? (
          <NitroWebView
            key={request.key}
            style={styles.web}
            source={source}
            onLoadStart={callback((event: WebViewLoadEvent) =>
              log(`START loading=${event.nativeEvent.loading}`),
            )}
            onLoadProgress={callback((event: WebViewLoadProgressEvent) => {
              setProgress(event.nativeEvent.progress);
              log(
                `PROGRESS ${Math.round(event.nativeEvent.progress * 100)}% loading=${event.nativeEvent.loading}`,
              );
            })}
            onLoad={callback((event: WebViewLoadEvent) => {
              setLoads(value => value + 1);
              log(`LOAD loading=${event.nativeEvent.loading}`);
            })}
            onLoadEnd={callback((event: WebViewLoadEvent) => {
              setEnds(value => value + 1);
              log(`END loading=${event.nativeEvent.loading}`);
            })}
            onError={callback(event => log(`ERROR ${event.nativeEvent.code}`))}
            onHttpError={callback(event =>
              log(`HTTP ${event.nativeEvent.statusCode}`),
            )}
          />
        ) : (
          <Text style={styles.hint}>
            Start the verification server, then tap Delayed success.
          </Text>
        )}
      </View>
      <Text style={styles.hint} numberOfLines={1}>
        {request?.uri ??
          'Native callbacks only; no page-script progress simulation.'}
      </Text>
      <ScrollView style={styles.log}>
        {events.map(line => (
          <Text key={line} style={styles.line}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, padding: 14, backgroundColor: '#f5f7fa', gap: 8 },
  heading: { fontSize: 23, fontWeight: '700', color: '#172438' },
  hint: { fontSize: 12, color: '#46566c' },
  input: {
    borderWidth: 1,
    borderColor: '#acb9ca',
    padding: 8,
    borderRadius: 6,
    color: '#172438',
  },
  buttons: { flexDirection: 'row', gap: 6 },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#2455aa',
    alignItems: 'center',
  },
  buttonText: { fontSize: 12, color: 'white', fontWeight: '600' },
  counts: { fontSize: 14, fontWeight: '700', color: '#172438' },
  track: {
    height: 8,
    backgroundColor: '#dce4ef',
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: { height: 8, backgroundColor: '#21866c' },
  web: { flex: 1, minHeight: 100 },
  log: { flex: 1, backgroundColor: '#172438', borderRadius: 6, padding: 8 },
  line: {
    color: '#e3efff',
    fontSize: 12,
    lineHeight: 20,
    fontFamily: 'monospace',
  },
});
