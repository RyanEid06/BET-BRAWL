package com.betbrawl.app

import android.annotation.SuppressLint
import android.content.Intent
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
                val js = "if (window.onHostDiscovered) { window.onHostDiscovered('${discoveredHost.ip}', ${discoveredHost.port}, '${discoveredHost.roomCode}'); }"
                webView.evaluateJavascript(js, null)
            }
        }

        configureWebView()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val js = "if (window.onAndroidBackPressed && window.onAndroidBackPressed()) { /* handled */ } else if (window.history.length > 1) { window.history.back(); } else { finish(); }"
                webView.evaluateJavascript(js) { result ->
                    if (result != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })

        // Check for deep link intent on launch
        handleIntent(intent)

        if (savedInstanceState == null) {
            webView.loadUrl("file:///android_asset/web/index.html")
        }
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val uri = intent?.data ?: return
        if (uri.scheme == "brawl" && uri.host == "join") {
            val room = uri.getQueryParameter("room").orEmpty()
            val host = uri.getQueryParameter("host").orEmpty()
            val port = uri.getQueryParameter("port")?.toIntOrNull() ?: 8080
            val js = "if (window.onDeepLinkJoin) { window.onDeepLinkJoin('$room', '$host', $port); }"
            webView.evaluateJavascript(js, null)
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
