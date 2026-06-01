package io.github.l2hyunwoo.nitro.webview

import android.view.View
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.margelo.nitro.nitrowebview.NitroWebviewOnLoad
import com.margelo.nitro.nitrowebview.views.HybridNitroWebViewManager

class NitroWebviewPackage : BaseReactPackage() {
    override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? = null

    override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider { HashMap() }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<View, *>> {
        @Suppress("UNCHECKED_CAST")
        return listOf(HybridNitroWebViewManager() as ViewManager<View, *>)
    }

    companion object {
        init {
            NitroWebviewOnLoad.initializeNative()
        }
    }
}
