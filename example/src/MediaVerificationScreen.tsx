import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { callback, NitroWebView } from 'nitro-webview';

// Original synthetic test signal, not a recording of a successful test.
const videoUri = Image.resolveAssetSource(
  require('./fixtures/media-test.mp4'),
).uri;

export function MediaVerificationScreen() {
  const [mode, setMode] = useState<'inline' | 'gesture' | 'fullscreen'>(
    'inline',
  );
  const [generation, setGeneration] = useState(0);
  const [lastEvent, setLastEvent] = useState('Waiting for page');
  const [mounted, setMounted] = useState(true);
  const source = useMemo(
    () => ({
      html: `<!doctype html>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{font:17px system-ui;background:#f1f5f9;color:#14213d;margin:16px}video{width:100%;background:black}button{font:inherit;padding:12px;margin:8px 6px 8px 0}#state{white-space:pre-wrap;background:white;padding:12px;border-radius:8px}</style>
<h2>Real HTML video</h2><p>${mode === 'gesture' ? 'Unmuted autoplay should be blocked. Tap Play.' : mode === 'fullscreen' ? 'iOS: Play should open the native player.' : 'Unmuted autoplay should advance inline.'}</p>
<video id="video" controls playsinline webkit-playsinline loop preload="auto" src=${JSON.stringify(videoUri)}></video>
<div><button id="play">Play</button><button id="pause">Pause</button><button id="fullscreen">Fullscreen</button><button id="exit">Exit fullscreen</button></div><pre id="state">Loading…</pre>
<script>
const video = document.getElementById('video');
function report(event) {
 const value = event + ' | time=' + video.currentTime.toFixed(1) + 's | paused=' + video.paused + ' | muted=' + video.muted + ' | fullscreen=' + Boolean(document.fullscreenElement || video.webkitDisplayingFullscreen);
 document.getElementById('state').textContent = value;
 window.ReactNativeWebView.postMessage(value);
}
['loadeddata','playing','pause','timeupdate','error','webkitbeginfullscreen','webkitendfullscreen'].forEach(name => video.addEventListener(name, () => report(name)));
document.addEventListener('fullscreenchange', () => report('fullscreenchange'));
function play() { video.play().then(() => report('play resolved')).catch(error => report('play rejected: ' + error.name)); }
document.getElementById('play').onclick = play;
document.getElementById('pause').onclick = () => video.pause();
document.getElementById('fullscreen').onclick = () => {
 if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
 else if (video.requestFullscreen) video.requestFullscreen().catch(error => report(error.name));
 else report('Fullscreen unavailable');
};
document.getElementById('exit').onclick = () => {
 if (document.fullscreenElement) document.exitFullscreen();
 else if (video.webkitDisplayingFullscreen) video.webkitExitFullscreen();
};
report('page ready');
${mode === 'fullscreen' ? '' : 'play();'}
</script>`,
    }),
    [mode],
  );

  function select(next: typeof mode) {
    setMode(next);
    setGeneration(value => value + 1);
    setLastEvent('Remounting with initial media props');
    setMounted(true);
  }

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Media playback verification</Text>
      <Text>
        Each mode remounts the WebView. Use system Back / Done to leave
        fullscreen.
      </Text>
      <View style={styles.row}>
        {(['inline', 'gesture', 'fullscreen'] as const).map(value => (
          <Pressable
            key={value}
            accessibilityRole="button"
            onPress={() => select(value)}
            style={styles.button}
          >
            <Text style={styles.buttonText}>{value}</Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={() => setMounted(value => !value)}
          style={styles.button}
        >
          <Text style={styles.buttonText}>{mounted ? 'Unmount' : 'Mount'}</Text>
        </Pressable>
      </View>
      <Text testID="media-native-state" style={styles.state}>
        {mode}: {lastEvent}
      </Text>
      {mounted && (
        <NitroWebView
          key={`${mode}-${generation}`}
          style={styles.webview}
          source={source}
          allowsInlineMediaPlayback={mode !== 'fullscreen'}
          mediaPlaybackRequiresUserAction={mode !== 'inline'}
          onMessage={callback(event => setLastEvent(event.nativeEvent.data))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 12, gap: 8, backgroundColor: '#f1f5f9' },
  title: { fontSize: 22, fontWeight: '700', color: '#14213d' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: { backgroundColor: '#2446a6', padding: 10, borderRadius: 6 },
  buttonText: { color: 'white' },
  state: { minHeight: 50, color: '#14213d', fontSize: 13 },
  webview: { flex: 1 },
});
