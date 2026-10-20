package com.betbrawl.app

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AppCompatActivity
import com.betbrawl.app.server.LanDiscovery
import com.betbrawl.app.webview.BrawlWebInterface
import com.betbrawl.app.webview.BrawlWebViewClient
import com.betbrawl.app.webview.DeepLinkParser
import org.json.JSONObject
import java.net.URLEncoder

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var lanDiscovery: LanDiscovery

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Set up immersive fullscreen
        hideSystemUI()

        webView = WebView(this).apply {
            id = View.generateViewId()
        }
        setContentView(webView)

        lanDiscovery = LanDiscovery(this)
        lanDiscovery.startListening { discoveredHost ->
            runOnUiThread {
                val payload = JSONObject().apply {
                    put("ip", discoveredHost.ip)
                    put("host", discoveredHost.ip)
                    put("port", discoveredHost.port)
                    put("roomCode", discoveredHost.roomCode)
                }
                webView.evaluateJavascript("if (typeof window.onHostDiscovered === 'function') { window.onHostDiscovered(${payload}); }", null)
            }
        }

        configureWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("typeof window.onAndroidBackPressed === 'function' ? window.onAndroidBackPressed() : false") { result ->
                    if (result != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            // Cold launch: Parse validated deep link and append as safe query parameters to initial URL
            val coldLink = DeepLinkParser.parse(intent?.data)
            val initialUrl = if (coldLink != null) {
                val encodedRoom = URLEncoder.encode(coldLink.roomCode, "UTF-8")
                val encodedHost = URLEncoder.encode(coldLink.host, "UTF-8")
                "file:///android_asset/web/index.html?room=$encodedRoom&host=$encodedHost&port=${coldLink.port}"
            } else {
                "file:///android_asset/web/index.html"
            }
            webView.loadUrl(initialUrl)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        // Warm launch: dispatch safely via JSON
        val warmLink = DeepLinkParser.parse(intent?.data)
        if (warmLink != null) {
            val payload = JSONObject().apply {
                put("room", warmLink.roomCode)
                put("host", warmLink.host)
                put("port", warmLink.port)
            }
            webView.evaluateJavascript("if (typeof window.onDeepLinkJoin === 'function') { window.onDeepLinkJoin(${payload}); }", null)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = BrawlWebViewClient()
        webView.addJavascriptInterface(BrawlWebInterface(this, lanDiscovery), "BetBrawlAndroid")
    }

    private fun hideSystemUI() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            @Suppress("DEPRECATION")
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            )
        }
    }

    override fun onResume() {
        super.onResume()
        hideSystemUI()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        lanDiscovery.stop()
        webView.destroy()
        super.onDestroy()
    }
}
