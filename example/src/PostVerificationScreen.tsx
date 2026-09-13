import React, { useState } from 'react';
import { Button, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { callback, NitroWebView } from 'nitro-webview';
import type { NitroWebViewErrorEvent } from 'nitro-webview';

/** The green page is an HTTP response from the server, never a local PASS fixture.
 * Start example/scripts/post-verification-server.mjs; on Android adb reverse tcp:18965 tcp:18965.
 */
export function PostVerificationScreen() {
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState('');
  const body =
    'name=Nitro+WebView&message=%ED%95%9C%EA%B8%80&attempt=' + attempt;
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.controls}>
        <Text style={styles.title}>POST source verification</Text>
        <Text>Expected method: POST</Text>
        <Text>Expected body: {body}</Text>
        <Button
          title="Send another POST"
          onPress={() => {
            setError('');
            setAttempt(attempt + 1);
          }}
        />
        {error !== '' && <Text accessibilityRole="alert">{error}</Text>}
      </View>
      <NitroWebView
        key={attempt}
        style={styles.webview}
        source={{ uri: 'http://127.0.0.1:18965/echo', method: 'POST', body }}
        onError={callback((event: NitroWebViewErrorEvent) =>
          setError(event.nativeEvent.description),
        )}
      />
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  controls: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: '600' },
  webview: { flex: 1 },
});
