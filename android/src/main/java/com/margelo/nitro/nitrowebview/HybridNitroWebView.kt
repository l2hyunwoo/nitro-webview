package com.margelo.nitro.nitrowebview

/**
 * Bridge alias that exposes the relocated [io.github.l2hyunwoo.nitro.webview.HybridNitroWebView]
 * implementation under the package name the nitrogen-generated
 * `HybridNitroWebViewManager` and `HybridNitroWebViewStateUpdater` resolve
 * via their wildcard `import com.margelo.nitro.nitrowebview.*` statements.
 *
 * The hand-written implementation now lives at
 * [io.github.l2hyunwoo.nitro.webview.HybridNitroWebView] so the package
 * identifier matches the published `io.github.l2hyunwoo.nitro.webview`
 * namespace. nitrogen/generated files must not be edited, so this
 * single-line typealias is the only file left under the historical
 * `com.margelo.nitro.nitrowebview` package — it preserves the symbol
 * lookup contract the codegen depends on without re-introducing any
 * production logic in the legacy package.
 */
typealias HybridNitroWebView = io.github.l2hyunwoo.nitro.webview.HybridNitroWebView
