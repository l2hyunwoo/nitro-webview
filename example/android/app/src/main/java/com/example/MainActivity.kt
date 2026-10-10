package com.example

import android.os.Bundle
import androidx.appcompat.app.AppCompatDelegate
import androidx.core.view.WindowCompat
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO)
    super.onCreate(savedInstanceState)
    // The playground uses a light surface even when the device theme is dark.
    WindowCompat.getInsetsController(window, window.decorView).apply {
      isAppearanceLightStatusBars = true
      isAppearanceLightNavigationBars = true
    }
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
