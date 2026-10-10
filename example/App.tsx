import React, { useEffect, useState } from 'react'
import {
  BackHandler,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import {
  SafeAreaProvider,
  SafeAreaView,
  initialWindowMetrics,
} from 'react-native-safe-area-context'
import { HomeList } from './src/components/HomeList'
import { color, spacing } from './src/components/theme'
import { PANELS, findPanelById } from './src/panels/index'
import type { PanelId } from './src/panels/index'

export default function App() {
  const [activePanelId, setActivePanelId] = useState<PanelId | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const selectPanel = (id: PanelId) => {
    Keyboard.dismiss()
    setActivePanelId(id)
    setMenuOpen(false)
  }
  const activePanel = findPanelById(activePanelId)
  useEffect(() => {
    if (!activePanel && !menuOpen) return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) setMenuOpen(false)
      else setActivePanelId(null)
      return true
    })
    return () => sub.remove()
  }, [activePanel, menuOpen])
  const PanelComponent = activePanel?.component
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.root}>
          <KeyboardAvoidingView
            style={styles.root}
            accessibilityElementsHidden={menuOpen}
            importantForAccessibility={
              menuOpen ? 'no-hide-descendants' : 'auto'
            }
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View style={styles.featureBar}>
              <TouchableOpacity
                testID="open-features-menu"
                accessibilityRole="button"
                accessibilityLabel="Open features menu"
                onPress={() => {
                  Keyboard.dismiss()
                  setMenuOpen(true)
                }}
                style={styles.backButton}
              >
                <Text style={styles.backLabel}>☰ Features</Text>
              </TouchableOpacity>
              {activePanel ? (
                <TouchableOpacity
                  onPress={() => setActivePanelId(null)}
                  style={styles.backButton}
                  accessibilityRole="button"
                  accessibilityLabel="Back to panel list"
                >
                  <Text style={styles.backLabel}>Overview ↗</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.featureTitle}>Playground</Text>
              )}
            </View>
            {activePanel && PanelComponent ? (
              <View style={styles.panelContainer}>
                <PanelComponent />
              </View>
            ) : (
              <HomeList entries={PANELS} onSelect={selectPanel} />
            )}
          </KeyboardAvoidingView>
          {menuOpen && (
            <View style={styles.menuOverlay} accessibilityViewIsModal>
              <View style={styles.featureBar}>
                <Text accessibilityRole="header" style={styles.menuTitle}>
                  Features
                </Text>
                <TouchableOpacity
                  testID="close-features-menu"
                  accessibilityRole="button"
                  accessibilityLabel="Close features menu"
                  onPress={() => setMenuOpen(false)}
                  style={styles.backButton}
                >
                  <Text style={styles.backLabel}>Close ×</Text>
                </TouchableOpacity>
              </View>
              <HomeList compact entries={PANELS} onSelect={selectPanel} />
            </View>
          )}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.appBackground },
  safeArea: { flex: 1, backgroundColor: color.headerBackground },
  menuOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.headerBackground,
  },
  backButton: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl3,
  },
  backLabel: { fontSize: 14, color: color.textPrimary, fontWeight: '600' },
  panelContainer: { flex: 1 },
  featureBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: color.divider,
    minHeight: 48,
  },
  featureTitle: {
    flex: 1,
    fontSize: 13,
    color: color.textSecondary,
    paddingRight: 16,
  },
  menuTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: color.textPrimary,
    paddingLeft: 20,
  },
})
