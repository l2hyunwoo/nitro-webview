package io.github.l2hyunwoo.nitro.webview

import android.app.Activity
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.widget.FrameLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.OnBackPressedDispatcherOwner
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

/** Owns one HTML fullscreen session and restores the host when it ends. */
internal class NitroFullscreenVideo {
  private var dismiss: (() -> Unit)? = null

  fun show(activity: Activity?, webView: View?, video: View, callback: WebChromeClient.CustomViewCallback) {
    val root = activity?.window?.decorView as? ViewGroup
    if (dismiss != null || activity == null || activity.isFinishing || root == null || video.parent != null) {
      callback.onCustomViewHidden()
      return
    }
    val window = activity.window
    val orientation = activity.requestedOrientation
    val visibility = webView?.visibility
    val focus = root.findFocus()
    val insets = ViewCompat.getRootWindowInsets(root)
    val statusVisible = insets?.isVisible(WindowInsetsCompat.Type.statusBars()) ?: true
    val navigationVisible = insets?.isVisible(WindowInsetsCompat.Type.navigationBars()) ?: true
    val controller = WindowCompat.getInsetsController(window, root)
    val behavior = controller.systemBarsBehavior
    val overlay = FrameLayout(activity).apply {
      setBackgroundColor(Color.BLACK)
      isFocusableInTouchMode = true
      addView(video, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
      setOnKeyListener { _, keyCode, event ->
        if (keyCode == KeyEvent.KEYCODE_BACK) {
          if (event.action == KeyEvent.ACTION_UP) hide()
          true
        } else false
      }
    }
    val back = object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() = hide()
    }
    // Clear ownership before removing the overlay or invoking WebKit: either
    // operation can synchronously call onHideCustomView again.
    var overlayDetached = false
    dismiss = {
      back.remove()
      if (!overlayDetached) root.removeView(overlay)
      overlay.removeAllViews()
      if (visibility != null) webView?.visibility = visibility
      activity.requestedOrientation = orientation
      controller.systemBarsBehavior = behavior
      if (statusVisible) controller.show(WindowInsetsCompat.Type.statusBars())
      else controller.hide(WindowInsetsCompat.Type.statusBars())
      if (navigationVisible) controller.show(WindowInsetsCompat.Type.navigationBars())
      else controller.hide(WindowInsetsCompat.Type.navigationBars())
      focus?.requestFocus()
      callback.onCustomViewHidden()
    }
    overlay.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
      override fun onViewAttachedToWindow(v: View) = Unit
      override fun onViewDetachedFromWindow(v: View) {
        // Parent removal is already in progress; removing the same child
        // again would corrupt ViewGroup's child array.
        overlayDetached = true
        hide()
      }
    })
    (activity as? OnBackPressedDispatcherOwner)?.onBackPressedDispatcher?.addCallback(back)
    root.addView(overlay, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    webView?.visibility = View.INVISIBLE
    activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
    controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    controller.hide(WindowInsetsCompat.Type.systemBars())
    overlay.requestFocus()
  }

  fun hide() {
    val finish = dismiss ?: return
    dismiss = null
    finish()
  }
}
