package com.example

import android.content.res.Configuration
import android.content.res.Resources
import android.graphics.Color
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
    super.onCreate(savedInstanceState)
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightStatusBars = true
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { _, insets ->
      updateNavigationBar(insets)
      insets
    }
    ViewCompat.requestApplyInsets(content)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ViewCompat.requestApplyInsets(window.decorView)
  }

  @Suppress("DEPRECATION")
  private fun updateNavigationBar(insets: WindowInsetsCompat) {
    val tappableArea = insets.getInsets(WindowInsetsCompat.Type.tappableElement())
    val hasButtons = tappableArea.bottom > 0 || tappableArea.left > 0 || tappableArea.right > 0
    val systemNightMode = Resources.getSystem().configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
    val needsDarkBackground = hasButtons && systemNightMode == Configuration.UI_MODE_NIGHT_YES
    // Android 15 Launcher can override button colors with its own dark theme.
    window.navigationBarColor = if (needsDarkBackground) Color.BLACK else Color.TRANSPARENT
    WindowCompat.getInsetsController(window, window.decorView).isAppearanceLightNavigationBars = !needsDarkBackground
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "example"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate = DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
