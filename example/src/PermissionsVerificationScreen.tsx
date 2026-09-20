import React, { useState } from 'react'
import {
  Button,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { NitroWebView } from 'nitro-webview'

const origin = 'https://permissions.nitro.test'

function page(deny: boolean) {
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:18px system-ui;padding:16px;background:#eef4ff;color:#15223a}button{display:block;font:inherit;padding:14px;margin:12px 0;width:100%}pre{white-space:pre-wrap}video{width:100%;height:140px;background:#111}</style>
<h2>Real WebView permissions</h2><p>${deny ? 'Expect origin policy denial (Android)' : 'Allow OS prompts to verify hardware access'}</p>
<button onclick="media('camera')">Test camera</button><button onclick="media('microphone')">Test microphone</button><button onclick="locate()">Test location</button>
<video id="preview" autoplay muted playsinline></video><pre id="results">READY — tap a test</pre>
<script>
const expectDeny=${deny};
function report(kind,ok,detail){document.getElementById('results').textContent=(ok?'PASS':'FAIL')+' '+kind+' — '+detail;}
async function media(kind){let stream;try{stream=await navigator.mediaDevices.getUserMedia({video:kind==='camera',audio:kind==='microphone'});document.getElementById('preview').srcObject=stream;report(kind,!expectDeny,'live '+stream.getTracks().map(t=>t.kind+':'+t.readyState).join(', '));setTimeout(()=>stream.getTracks().forEach(t=>t.stop()),3000);}catch(e){report(kind,expectDeny&&e.name==='NotAllowedError',e.name+': '+e.message);}}
function locate(){navigator.geolocation.getCurrentPosition(p=>report('location',!expectDeny,'accuracy '+Math.round(p.coords.accuracy)+'m'),e=>report('location',expectDeny&&e.code===1,'error '+e.code+': '+e.message),{timeout:15000,maximumAge:0});}
</script>`
}

export function PermissionsVerificationScreen() {
  const [deny, setDeny] = useState(false)
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Camera · microphone · location</Text>
      <Text style={styles.description}>
        {Platform.OS === 'android'
          ? 'Allow mode requests OS consent. Deny mode rejects this origin even with app permissions.'
          : 'iOS uses system website prompts. Grant or deny there; the Android origin policy does not apply.'}
      </Text>
      {Platform.OS === 'android' && (
        <View style={styles.actions}>
          <Button
            title={deny ? 'Switch to ALLOW origin' : 'Switch to DENY origin'}
            onPress={() => setDeny(!deny)}
          />
        </View>
      )}
      <NitroWebView
        key={String(deny)}
        style={styles.webview}
        source={{ html: page(deny), baseUrl: origin }}
        mediaCapturePermissionOrigins={deny ? [] : [origin]}
        geolocationPermissionOrigins={deny ? [] : [origin]}
        allowsInlineMediaPlayback
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef4ff' },
  title: { fontSize: 22, padding: 12 },
  description: { paddingHorizontal: 12 },
  actions: { padding: 12 },
  webview: { flex: 1 },
})
