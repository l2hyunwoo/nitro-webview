/**
 * Cross-cutting design tokens for the nitro-webview example app.
 *
 * Every value here is lifted directly from the original
 * `example/App.tsx` StyleSheet so the modularized panels can
 * keep pixel-for-pixel parity with the pre-refactor demo while
 * still owning their own local StyleSheet.create() calls.
 *
 * Per the Seed contract, theme.ts only stores tokens — it does
 * not export any pre-composed style objects or components.
 */

/**
 * Color palette derived from every hex literal that appears in
 * the original App.tsx StyleSheet, grouped by role.
 */
export const color = {
  // Surfaces
  appBackground: '#f8fafc', // root, demoPanel
  headerBackground: '#0f172a', // header, status bar tint, demoPanel border, sectionLabelText
  buttonBackground: '#e0e7ff', // button bg, statusValue bg
  buttonBackgroundDisabled: '#f1f5f9', // buttonDisabled bg, cookieList bg
  buttonBorder: '#c7d2fe', // button border
  buttonBorderDisabled: '#e2e8f0', // buttonDisabled border
  divider: '#0f172a', // demoPanel top border (same hex as header)

  // Text
  textOnDark: '#f8fafc', // title (header)
  textMutedOnDark: '#94a3b8', // subtitle, buttonLabelDisabled
  textSecondaryOnDark: '#cbd5e1', // pageTitle
  textPrimary: '#0f172a', // sectionLabelText, statusValue, downloadValue
  textSecondary: '#475569', // statusLabel, downloadLabel
  textTertiary: '#64748b', // hint
  textCookie: '#1e293b', // cookieItem
  textAccent: '#2563eb', // buttonLabel, sectionLabelAccent

  // Error banner
  errorBackground: '#fff1f0',
  errorBorder: '#f5c2c0',
  errorTitle: '#b1241a',
  errorBody: '#7c1d12',

  // Message banner
  messageBackground: '#ecfdf5',
  messageBorder: '#a7f3d0',
  messageTitle: '#047857',
  messageBody: '#065f46',

  // Evaluate-JS banner
  evalBackground: '#eff6ff',
  evalBorder: '#bfdbfe',
  evalTitle: '#1d4ed8',
  evalBody: '#1e3a8a',

  // Upload pill
  uploadPillBackground: '#d1fae5',
  uploadPillBorder: '#6ee7b7',
  uploadPillText: '#065f46',

  // Download row highlight
  downloadHighlightBackground: '#fef3c7',
} as const

/**
 * Spacing scale collected from every padding/margin/gap literal
 * in the original App.tsx StyleSheet.
 */
export const spacing = {
  xxs: 2,
  xs: 3,
  sm: 4,
  md: 6,
  smPlus: 7,
  base: 8,
  lg: 9,
  xl: 10,
  xl2: 12,
  xl3: 16,
  xl4: 20,
  xl5: 24,
} as const

/**
 * Font size scale collected from every fontSize literal in the
 * original App.tsx StyleSheet.
 */
export const fontSize = {
  xxs: 10,
  xs: 11,
  sm: 12,
  md: 13,
  lg: 18,
} as const

/**
 * Border-radius scale collected from every borderRadius literal
 * in the original App.tsx StyleSheet.
 */
export const radii = {
  xxs: 2,
  xs: 4,
  sm: 6,
  md: 7,
  lg: 8,
  pill: 20,
} as const

/**
 * Font family tokens. The original App.tsx only references
 * `'Menlo'` for monospaced status values and the platform default
 * (undefined) everywhere else.
 */
export const fontFamily = {
  mono: 'Menlo',
} as const

export type Color = keyof typeof color
export type Spacing = keyof typeof spacing
export type FontSize = keyof typeof fontSize
export type Radii = keyof typeof radii
export type FontFamily = keyof typeof fontFamily
