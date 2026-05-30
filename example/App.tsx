import React from 'react'
import { SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native'
import { NitroWebView } from 'nitro-webview'

export default function App() {
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text style={styles.title}>nitro-webview</Text>
        <Text style={styles.subtitle}>example.com</Text>
      </View>
      <NitroWebView
        style={styles.webview}
        source={{ uri: 'https://example.com' }}
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  subtitle: { fontSize: 13, color: '#666', marginTop: 2 },
  webview: { flex: 1 },
})
