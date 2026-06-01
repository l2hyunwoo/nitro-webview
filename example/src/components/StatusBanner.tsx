/**
 * StatusBanner — shared primitive for the modularized example app.
 *
 * Migrated from the three inline status banners defined in the original
 * `example/App.tsx`:
 *
 *   - the red error banner (lines 289-301): "onError fired …"
 *   - the green message banner (lines 303-315): "onMessage fired"
 *   - the blue evaluateJavaScript banner (lines 317-326)
 *
 * Each banner shared the same visual shape — a colored card with a
 * heading line, a body line, and an optional small footer line — but
 * each used a distinct color palette to communicate status.
 * StatusBanner unifies that shape into a single component driven by a
 * `status` prop:
 *
 *   - `error`   — red palette (onError fired)
 *   - `message` — green palette (onMessage fired)
 *   - `eval`    — blue palette (evaluateJavaScript resolved)
 *
 * The visual identity is preserved by sourcing every literal from
 * `theme.ts` rather than inlining the original hex/number values. The
 * body text optionally renders with the monospaced Menlo font family
 * (matching the eval banner in the original App.tsx) when
 * `monospaceBody` is true.
 *
 * Per the Seed contract, this primitive lives under
 * `example/src/components/` and owns its own `StyleSheet.create()`
 * call so panels can compose it without importing a panel-specific
 * style sheet.
 */

import React from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { color, fontFamily, fontSize, radii, spacing } from './theme'

/**
 * Visual variant of the banner. Each value maps to a distinct color
 * palette migrated from the original App.tsx banner styles.
 */
export type StatusBannerStatus = 'error' | 'message' | 'eval'

export interface StatusBannerProps {
  /** Color palette to use. */
  status: StatusBannerStatus
  /** Headline rendered on the first row of the banner. */
  title: string
  /** Primary body text rendered on the second row. */
  body: string
  /** Optional italic footer line (e.g. an originating URL). */
  footer?: string
  /**
   * Number of lines for the body text. Mirrors the original App.tsx,
   * which clamped the error/message body to 2 lines and the eval body
   * to 3 lines. Defaults to 2.
   */
  bodyNumberOfLines?: number
  /**
   * Render the body in the Menlo monospace font. Mirrors the original
   * eval banner. Defaults to false.
   */
  monospaceBody?: boolean
}

/**
 * A status banner card with a title, body, and optional footer line.
 * The `status` prop selects between the error (red), message (green),
 * and eval (blue) color palettes migrated verbatim from the original
 * App.tsx StyleSheet.
 */
export function StatusBanner({
  status,
  title,
  body,
  footer,
  bodyNumberOfLines = 2,
  monospaceBody = false,
}: StatusBannerProps) {
  const palette = PALETTES[status]
  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
        },
      ]}
    >
      <Text style={[styles.title, { color: palette.title }]} numberOfLines={1}>
        {title}
      </Text>
      <Text
        style={[
          styles.body,
          { color: palette.body },
          monospaceBody && styles.bodyMono,
        ]}
        numberOfLines={bodyNumberOfLines}
      >
        {body}
      </Text>
      {footer ? (
        <Text style={[styles.footer, { color: palette.body }]} numberOfLines={1}>
          {footer}
        </Text>
      ) : null}
    </View>
  )
}

interface BannerPalette {
  background: string
  border: string
  title: string
  body: string
}

const PALETTES: Record<StatusBannerStatus, BannerPalette> = {
  error: {
    background: color.errorBackground,
    border: color.errorBorder,
    title: color.errorTitle,
    body: color.errorBody,
  },
  message: {
    background: color.messageBackground,
    border: color.messageBorder,
    title: color.messageTitle,
    body: color.messageBody,
  },
  eval: {
    background: color.evalBackground,
    border: color.evalBorder,
    title: color.evalTitle,
    body: color.evalBody,
  },
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  title: {
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  body: {
    fontSize: fontSize.xs,
    marginTop: spacing.xxs,
  },
  bodyMono: {
    fontFamily: fontFamily.mono,
  },
  footer: {
    fontSize: fontSize.xxs,
    marginTop: spacing.xxs,
    fontStyle: 'italic',
  },
})

export default StatusBanner
