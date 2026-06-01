import React, { useState } from 'react'
import { SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { HomeList } from './src/components/HomeList'
import { color, fontSize, spacing } from './src/components/theme'
import { PANELS, findPanelById } from './src/panels/index'
import type { PanelId } from './src/panels/index'

export default function App() {
  const [activePanelId, setActivePanelId] = useState<PanelId | null>(null)

  const activePanel = findPanelById(activePanelId)

  if (activePanel) {
    const PanelComponent = activePanel.component
    return (
      <View style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={color.headerBackground} />
        <SafeAreaView style={styles.backBar}>
          <TouchableOpacity
            onPress={() => setActivePanelId(null)}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to panel list"
          >
            <Text style={styles.backLabel}>‹ All demos</Text>
          </TouchableOpacity>
        </SafeAreaView>
        <View style={styles.panelContainer}>
          <PanelComponent />
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={color.headerBackground} />
      <HomeList entries={PANELS} onSelect={setActivePanelId} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.appBackground },
  backBar: {
    backgroundColor: color.headerBackground,
  },
  backButton: {
    paddingHorizontal: spacing.xl3,
    paddingVertical: spacing.base,
  },
  backLabel: {
    fontSize: fontSize.sm,
    color: color.textOnDark,
    fontWeight: '600',
  },
  panelContainer: { flex: 1 },
})
