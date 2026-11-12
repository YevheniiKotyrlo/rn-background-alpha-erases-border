package com.reproducerapp

import android.os.Bundle
import android.util.Log
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.uimanager.util.ReactFindViewUtil

class MainActivity : ReactActivity() {

  private val halfAlphaBackgrounds =
      ReactFindViewUtil.OnMultipleViewsFoundListener { view, nativeId ->
        view.post {
          val background = view.background ?: return@post
          background.alpha = 128
          Log.i("BorderAlphaReproducer", "$nativeId: ${background.javaClass.simpleName}.alpha = 128")
        }
      }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "ReproducerApp"

  /**
   * Returns the instance of the [ReactActivityDelegate].
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)

  override fun onCreate(savedInstanceState: Bundle?) {
    ReactFindViewUtil.addViewsListener(halfAlphaBackgrounds, setOf("uniform-border", "edge-colors"))
    super.onCreate(savedInstanceState)
  }

  override fun onDestroy() {
    ReactFindViewUtil.removeViewsListener(halfAlphaBackgrounds)
    super.onDestroy()
  }
}
