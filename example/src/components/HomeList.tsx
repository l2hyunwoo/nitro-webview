import React, { useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { color, fontFamily } from './theme'

export interface HomeListEntry<TId extends string = string> {
  id: TId
  title: string
  description: string
  category: 'demo' | 'verify'
  platform?: 'Android' | 'iOS'
}
export interface HomeListProps<TId extends string = string> {
  entries: readonly HomeListEntry<TId>[]
  onSelect: (id: TId) => void
  compact?: boolean
}
export function HomeList<TId extends string>({
  entries,
  onSelect,
  compact = false,
}: HomeListProps<TId>) {
  const [category, setCategory] = useState<'all' | 'demo' | 'verify'>('all')
  const [query, setQuery] = useState('')
  const visible = entries.filter(
    entry =>
      (category === 'all' || entry.category === category) &&
      (entry.title + ' ' + entry.description)
        .toLowerCase()
        .includes(query.trim().toLowerCase())
  )
  const regression = entries.find(
    entry => entry.id === 'regression-verification'
  )
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      {!compact && (
        <>
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Text style={styles.markText}>N</Text>
            </View>
            <Text style={styles.brandName}>Nitro WebView</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>PLAYGROUND</Text>
            </View>
          </View>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>REACT NATIVE · ANDROID + iOS</Text>
            <Text style={styles.title}>{'Web content.\nNative control.'}</Text>
            <Text style={styles.subtitle}>
              Explore the APIs. Inspect real events. Verify what runs on your
              device.
            </Text>
            {regression ? (
              <TouchableOpacity
                style={styles.primary}
                accessibilityRole="button"
                accessibilityLabel="Open native regression checks"
                onPress={() => onSelect(regression.id)}
              >
                <Text style={styles.primaryText}>Open native checks</Text>
                <Text style={styles.primaryText}>↗</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </>
      )}
      <View style={styles.catalogHeader}>
        <Text style={styles.catalogTitle}>Capabilities</Text>
        <Text style={styles.count}>{entries.length} scenarios</Text>
      </View>
      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            ['all', 'All'],
            ['demo', 'Demos'],
            ['verify', 'Verification'],
          ] as const
        ).map(([value, label]) => (
          <TouchableOpacity
            key={value}
            style={[styles.tab, category === value && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: category === value }}
            onPress={() => setCategory(value)}
          >
            <Text
              style={[
                styles.tabText,
                category === value && styles.tabTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        accessibilityLabel="Search capabilities"
        placeholder="Find a capability…"
        placeholderTextColor={color.textTertiary}
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      {visible.map(entry => (
        <TouchableOpacity
          key={entry.id}
          style={styles.row}
          onPress={() => onSelect(entry.id)}
          accessibilityRole="button"
          accessibilityLabel={entry.title}
          accessibilityHint={entry.description}
          testID={(compact ? 'feature-menu-row-' : 'home-list-row-') + entry.id}
        >
          <View style={styles.rowBody}>
            <View style={styles.rowHeading}>
              <Text style={styles.rowCategory}>
                {entry.category === 'verify' ? 'VERIFY' : 'EXPLORE'}
              </Text>
              {entry.platform ? (
                <Text style={styles.platform}>{entry.platform}</Text>
              ) : null}
            </View>
            <Text style={styles.rowTitle}>{entry.title}</Text>
            <Text style={styles.rowDescription}>{entry.description}</Text>
          </View>
          <Text style={styles.chevron}>↗</Text>
        </TouchableOpacity>
      ))}
      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.rowTitle}>No matching capabilities</Text>
          <Text style={styles.rowDescription}>
            Try a different search or choose All.
          </Text>
        </View>
      ) : null}
      <Text style={styles.footer}>REAL WEBVIEWS. REAL NATIVE EVENTS.</Text>
    </ScrollView>
  )
}
const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: color.appBackground },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: color.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { fontWeight: '800', color: '#ffffff', fontSize: 16 },
  brandName: { fontSize: 15, fontWeight: '700', color: color.textPrimary },
  badge: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: fontFamily.mono,
    fontSize: 9,
    color: color.textSecondary,
  },
  hero: { paddingTop: 22, paddingBottom: 30, gap: 16 },
  eyebrow: {
    fontFamily: fontFamily.mono,
    fontSize: 10,
    letterSpacing: 1,
    color: color.textTertiary,
  },
  title: {
    fontSize: 38,
    lineHeight: 42,
    letterSpacing: -1.7,
    fontWeight: '700',
    color: color.headerText,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 23,
    color: color.textSecondary,
    maxWidth: 420,
  },
  primary: {
    minHeight: 48,
    borderRadius: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: color.textPrimary,
  },
  primaryText: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  catalogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  catalogTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: color.textPrimary,
    letterSpacing: -0.4,
  },
  count: {
    fontSize: 12,
    color: color.textTertiary,
    fontFamily: fontFamily.mono,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 4,
    backgroundColor: '#f0f0f1',
    gap: 4,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  tabActive: { backgroundColor: '#ffffff' },
  tabText: { color: color.textSecondary, fontSize: 12, fontWeight: '500' },
  tabTextActive: { color: color.textPrimary, fontWeight: '600' },
  search: {
    minHeight: 46,
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 8,
    paddingHorizontal: 12,
    color: color.textPrimary,
    backgroundColor: '#ffffff',
    marginBottom: 12,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: color.divider,
    borderRadius: 10,
    marginBottom: 10,
    gap: 12,
  },
  rowBody: { flex: 1, gap: 7 },
  rowHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowCategory: {
    fontFamily: fontFamily.mono,
    color: color.textTertiary,
    fontSize: 9,
    letterSpacing: 1.3,
  },
  platform: {
    fontSize: 10,
    color: color.textSecondary,
    backgroundColor: '#f4f4f5',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: color.textPrimary,
    letterSpacing: -0.2,
  },
  rowDescription: { fontSize: 12, lineHeight: 18, color: color.textSecondary },
  chevron: { fontSize: 19, color: color.textTertiary },
  empty: { padding: 24, gap: 8, alignItems: 'center' },
  footer: {
    textAlign: 'center',
    fontSize: 9,
    letterSpacing: 1.5,
    fontFamily: fontFamily.mono,
    color: color.textTertiary,
    paddingVertical: 24,
  },
})
export default HomeList
