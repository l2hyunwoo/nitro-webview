package io.github.l2hyunwoo.nitro.webview

import android.content.pm.ActivityInfo
import android.view.View
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class NitroFullscreenVideoTest {
  @Test fun backRestoresHostAndNotifiesOnce() {
    val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
    val page = View(activity)
    activity.setContentView(page)
    activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
    val video = FrameLayout(activity)
    val session = NitroFullscreenVideo()
    var hidden = 0
    session.show(activity, page, video) { hidden++ }
    assertEquals(View.INVISIBLE, page.visibility)
    assertNotNull(video.parent)
    activity.onBackPressedDispatcher.onBackPressed()
    assertEquals(View.VISIBLE, page.visibility)
    assertEquals(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT, activity.requestedOrientation)
    assertNull(video.parent)
    assertEquals(1, hidden)
    session.hide()
    assertEquals(1, hidden)
  }

  @Test fun duplicateRequestIsRejectedWithoutLosingOriginalSession() {
    val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
    val page = View(activity)
    activity.setContentView(page)
    val session = NitroFullscreenVideo()
    val first = FrameLayout(activity)
    val second = FrameLayout(activity)
    var firstHidden = 0
    var secondHidden = 0
    session.show(activity, page, first) { firstHidden++ }
    session.show(activity, page, second) { secondHidden++ }
    assertEquals(0, firstHidden)
    assertEquals(1, secondHidden)
    assertNull(second.parent)
    assertNotNull(first.parent)
    session.hide()
    assertEquals(1, firstHidden)
  }

  @Test fun missingActivityAndDetachedOverlayReleaseCallbacks() {
    val activity = Robolectric.buildActivity(ComponentActivity::class.java).setup().get()
    val page = View(activity).apply { visibility = View.INVISIBLE }
    activity.setContentView(page)
    val session = NitroFullscreenVideo()
    var hidden = 0
    session.show(null, page, FrameLayout(activity)) { hidden++ }
    assertEquals(1, hidden)
    val video = FrameLayout(activity)
    session.show(activity, page, video) { hidden++ }
    val overlay = video.parent as FrameLayout
    (overlay.parent as android.view.ViewGroup).removeView(overlay)
    assertEquals(2, hidden)
    assertEquals(View.INVISIBLE, page.visibility)
    session.hide()
    assertEquals(2, hidden)
  }
}
