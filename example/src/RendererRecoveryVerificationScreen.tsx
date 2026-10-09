import React, { useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { callback, NitroWebView } from 'nitro-webview';
import type { NitroWebViewMethods, WebViewSource } from 'nitro-webview';

import { color, fontSize, spacing } from './components/theme';

export function RendererRecoveryVerificationScreen() {
  const ref = useRef<NitroWebViewMethods | null>(null);
  // Keep this ref only for the development-only stale-reference check.
  const retired = useRef<NitroWebViewMethods | null>(null);
  const [host, setHost] = useState('http://127.0.0.1:8099/');
  const [source, setSource] = useState<WebViewSource>();
  const [generation, setGeneration] = useState(0);
  const [gone, setGone] = useState(false);
  const [exits, setExits] = useState(0);
  const [events, setEvents] = useState<string[]>([]);
  const log = (line: string) =>
    setEvents(previous => [...previous, line].slice(-30));
  const bindRef = useMemo(
    () =>
      callback((value: NitroWebViewMethods) => {
        ref.current = value;
      }),
    [],
  );
  const retry = () => {
    ref.current = null;
    setSource({ uri: host });
    setGeneration(value => value + 1);
    setGone(false);
  };
  const checkOldRef = async () => {
    const old = retired.current;
    if (!old) return;
    old.reload();
    old.goBack();
    old.goForward();
    old.stopLoading();
    old.postMessage('stale');
    old.injectJavaScript('document.title = "stale"');
    try {
      await old.evaluateJavaScript('1 + 1');
      log('FAIL: old evaluateJavaScript resolved');
    } catch (error) {
      log(`OLD REF rejected: ${String(error)}`);
    }
  };

  if (Platform.OS !== 'android') {
    return (
      <Text style={styles.hint}>
        This renderer remount check requires Android API 26 or later.
      </Text>
    );
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Renderer recovery</Text>
      <Text style={styles.hint}>
        GET only. Retry creates a new WebView and loses page history and input.
      </Text>
      <TextInput
        accessibilityLabel="Renderer verification GET URL"
        autoCapitalize="none"
        autoCorrect={false}
        value={host}
        onChangeText={setHost}
        editable={!source || gone}
        style={styles.input}
      />
      <Text style={styles.hint}>
        Mount: {generation} Renderer exits: {exits}
      </Text>
      <View style={styles.buttons}>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={retry}
          disabled={!!source && !gone}
          style={styles.button}
        >
          <Text style={styles.buttonText}>
            {gone ? 'Retry GET' : 'Load GET'}
          </Text>
        </TouchableOpacity>
        {__DEV__ && (
          <TouchableOpacity
            accessibilityRole="button"
            disabled={!source || gone}
            onPress={() => {
              retired.current = ref.current;
              log('Requesting chrome://crash');
              setSource({ uri: 'chrome://crash' });
            }}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Crash renderer</Text>
          </TouchableOpacity>
        )}
        {__DEV__ && gone && (
          <TouchableOpacity
            accessibilityRole="button"
            onPress={checkOldRef}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Check old ref</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.web}>
        {gone ? (
          <Text accessibilityRole="alert" style={styles.hint}>
            The page stopped. Tap Retry GET when you are ready.
          </Text>
        ) : source ? (
          <NitroWebView
            key={generation}
            style={styles.web}
            source={source}
            hybridRef={bindRef}
            onLoadStart={callback(() => log(`START mount=${generation}`))}
            onLoad={callback(() => {
              log(
                `LOAD mount=${generation} freshRef=${!!ref.current && ref.current !== retired.current}`,
              );
              retired.current = null;
              ref.current?.postMessage(`mount:${generation}`);
            })}
            onLoadEnd={callback(() => log(`END mount=${generation}`))}
            onMessage={callback(event =>
              log(`MESSAGE ${event.nativeEvent.data}`),
            )}
            onError={callback(event =>
              log(`ERROR ${event.nativeEvent.description}`),
            )}
            onRenderProcessGone={callback(event => {
              retired.current = ref.current;
              ref.current = null;
              setExits(value => value + 1);
              setGone(true);
              log(`GONE didCrash=${String(event.nativeEvent.didCrash)}`);
            })}
          />
        ) : (
          <Text style={styles.hint}>
            Start example/e2e-server.mjs, then tap Load GET.
          </Text>
        )}
      </View>
      <ScrollView style={styles.log}>
        {events.map((line, index) => (
          <Text key={index} style={styles.hint}>
            {line}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: spacing.xl3,
    gap: spacing.base,
    backgroundColor: color.appBackground,
  },
  title: { fontSize: fontSize.lg, fontWeight: '700', color: color.textPrimary },
  hint: { fontSize: fontSize.sm, color: color.textSecondary },
  input: {
    borderWidth: 1,
    borderColor: color.buttonBorder,
    padding: spacing.base,
    color: color.textPrimary,
  },
  buttons: { flexDirection: 'row', gap: spacing.base },
  button: {
    flex: 1,
    padding: spacing.xl2,
    backgroundColor: color.buttonBackground,
  },
  buttonText: { fontSize: fontSize.sm, color: color.textAccent },
  web: { flex: 2, minHeight: 100 },
  log: {
    flex: 1,
    borderTopWidth: 1,
    borderColor: color.buttonBorder,
    paddingTop: spacing.base,
  },
});
