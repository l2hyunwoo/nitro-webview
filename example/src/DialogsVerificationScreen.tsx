import React, { useEffect, useRef, useState } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { NitroWebView } from 'nitro-webview';

const source = {
  html: `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body{font:17px -apple-system,sans-serif;padding:16px;background:#f4f7fb;color:#12243a}
button{display:block;width:100%;font:inherit;padding:14px;margin:12px 0;border-radius:10px;border:1px solid #8898aa;background:white}
pre{white-space:pre-wrap;background:#e3ecf6;padding:14px;border-radius:10px;min-height:100px}
</style></head><body>
<h2>JavaScript dialogs</h2><p>Results below come from actual JavaScript return values.</p>
<button onclick="record('alert', alert('Alert verification'))">Alert → OK</button>
<button onclick="record('confirm', confirm('Confirm verification'))">Confirm → OK / Cancel</button>
<button onclick="record('prompt', prompt('Prompt verification', 'default value'))">Prompt → text / Cancel</button>
<button onclick="alert('First alert'); record('sequence', confirm('Second dialog'))">Sequential alert → confirm</button>
<button onclick="setTimeout(function(){record('delayed',prompt('Delayed prompt','pending'))},3000)">Prompt in 3 seconds (unmount test)</button>
<pre id="results">Waiting for dialog results…</pre>
<script>
var entries=[];
function record(kind,value){
  var result=kind+' returned '+(value===undefined?'undefined':JSON.stringify(value));
  entries.push(result);
  document.getElementById('results').textContent=entries.join('\\n');
}
</script></body></html>`,
};

export function DialogsVerificationScreen() {
  const [mounted, setMounted] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const scheduleUnmount = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMounted(false), 5000);
  };
  return (
    <View style={styles.screen}>
      <Text style={styles.hint}>
        Test OK, Cancel, edited text, and consecutive dialogs.
      </Text>
      <Button
        title={mounted ? 'Unmount WebView' : 'Mount WebView'}
        onPress={() => setMounted(!mounted)}
      />
      {mounted && (
        <Button
          title="Unmount in 5 seconds (open a dialog now)"
          onPress={scheduleUnmount}
        />
      )}
      {mounted ? (
        <NitroWebView style={styles.webview} source={source} />
      ) : (
        <Text>WebView unmounted.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f4f7fb' },
  hint: { padding: 12, color: '#12243a' },
  webview: { flex: 1 },
});
