/**
 * HomeList — vertical list of tappable rows used by the App.tsx router
 * to surface the seven demo panels when no panel is active.
 *
 * The component is intentionally generic over the panel-registry shape:
 * it accepts an `entries` array of `{ id, title }` rows and an
 * `onSelect(id)` callback. App.tsx feeds it the `PANELS` constant from
 * `example/src/panels/index.ts` and a `setActivePanelId` setter, but
 * keeping the component free of the registry import keeps the home-list
 * UI primitive reusable and trivially testable in isolation.
 *
 * Per the Seed contract this primitive lives under
 * `example/src/components/` and owns its own `StyleSheet.create()` call
 * sourcing every literal from `theme.ts`. There is no implicit coupling
 * to any specific panel.
 */

import React from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'

import { color, fontSize, radii, spacing } from './theme'

/**
 * Minimal shape of a single home-list row. The `id` is the value passed
 * back through `onSelect`; the `title` is the human-readable label
 * rendered in the row. This intentionally matches the public shape of
 * the panel-registry `PanelEntry` so App.tsx can pass `PANELS` straight
 * through without an adapter.
 */
export interface HomeListEntry<TId extends string = string> {
  /** Stable identifier handed back to the `onSelect` callback. */
  id: TId
  /** Human-readable label rendered in the row. */
  title: string
}

export interface HomeListProps<TId extends string = string> {
  /** Ordered list of rows to render. */
  entries: readonly HomeListEntry<TId>[]
  /**
   * Invoked when a row is tapped. The `id` of the tapped entry is
   * passed through verbatim so the router can update its
   * `active_panel_id` state.
   */
  onSelect: (id: TId) => void
}

/**
 * A vertical, tappable list of panel names. Rendered as the App.tsx
 * default view when no panel is active (i.e. `active_panel_id` is
 * `null`). Each row mounts a `TouchableOpacity` that invokes
 * `onSelect(entry.id)` when tapped.
 */
export function HomeList<TId extends string = string>({
  entries,
  onSelect,
}: HomeListProps<TId>) {
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>nitro-webview</Text>
        <Text style={styles.headerSubtitle}>demo panels</Text>
      </View>
      {entries.map((entry) => (
        <TouchableOpacity
          key={entry.id}
          style={styles.row}
          onPress={() => onSelect(entry.id)}
          accessibilityRole="button"
          accessibilityLabel={entry.title}
          testID={`home-list-row-${entry.id}`}
        >
          <Text style={styles.rowLabel}>{entry.title}</Text>
          <Text style={styles.rowChevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: color.appBackground,
  },
  scrollContent: {
    paddingBottom: spacing.xl5,
  },
  header: {
    paddingHorizontal: spacing.xl3,
    paddingTop: spacing.xl2,
    paddingBottom: spacing.xl2,
    backgroundColor: color.headerBackground,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: color.textOnDark,
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: fontSize.xs,
    color: color.textMutedOnDark,
    marginTop: spacing.xxs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.xl,
    marginTop: spacing.base,
    paddingHorizontal: spacing.xl3,
    paddingVertical: spacing.xl2,
    backgroundColor: color.buttonBackground,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: color.buttonBorder,
  },
  rowLabel: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '600',
    color: color.textAccent,
  },
  rowChevron: {
    fontSize: fontSize.lg,
    color: color.textAccent,
    marginLeft: spacing.base,
  },
})

export default HomeList
