import React, { useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { color } from './theme'

export function DemoTabs({
  controls,
  results,
}: {
  controls: React.ReactNode
  results: React.ReactNode
}) {
  const [tab, setTab] = useState<'controls' | 'results'>('controls')
  return (
    <View style={styles.root}>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(['controls', 'results'] as const).map(value => (
          <TouchableOpacity
            key={value}
            testID={`demo-tab-${value}`}
            accessibilityRole="tab"
            accessibilityLabel={value === 'controls' ? 'Controls' : 'Results'}
            accessibilityState={{ selected: tab === value }}
            onPress={() => setTab(value)}
            style={[styles.tab, tab === value && styles.selected]}
          >
            <Text style={styles.label}>
              {value === 'controls' ? 'Controls' : 'Results'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <ScrollView
        key={tab}
        testID={`demo-content-${tab}`}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {tab === 'controls' ? controls : results}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, borderTopWidth: 1, borderColor: color.divider },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: color.divider,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderColor: 'transparent',
  },
  selected: {
    borderBottomColor: color.textPrimary,
    backgroundColor: color.headerBackground,
  },
  label: { color: color.textPrimary, fontSize: 14, fontWeight: '600' },
  content: { paddingVertical: 16, paddingBottom: 24 },
})
